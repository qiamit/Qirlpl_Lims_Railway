-- ISO/IEC 17025 gap items P2-4 (control charts, 7.7.1 d / 7.7.3) and P2-7
-- (equipment, 6.4.1 - 6.4.3, 6.4.9, 6.4.11, 6.4.12).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261024100000_audit_trail_expansion.sql
-- (write_audit_log) and, ideally, 20261025100000_soft_delete.sql and
-- 20261026100100_equipment_traceability.sql, while the lab is idle.
-- Safe to re-run.
--
-- What it adds
--   result_validity_checks.nc_record_id
--                          Link from an IQC / validity check to the
--                          nonconforming work record raised from the Control
--                          Charts page for an action-limit violation (7.7.3).
--   equipment_master       seal_no, seal_intact_checked_on,
--                          adjustment_protection (6.4.12: safeguards against
--                          adjustments that would invalidate results) and
--                          acceptance_required (true for equipment registered
--                          after this migration; existing equipment was placed
--                          in service before acceptance records existed and
--                          stays false).
--   equipment_acceptance   Acceptance / commissioning record before an item is
--                          placed in service (6.4.1 - 6.4.4): checks done,
--                          initial calibration reference, result, who and when.
--                          Append-only; a later record supersedes an earlier
--                          one. Accepting fills date_placed_in_service when it
--                          is empty.
--   equipment_correction_factors
--                          Correction factors per equipment, quantity and range,
--                          from a calibration certificate, with an effective
--                          period (6.4.11). equipment_correction_for(...) picks
--                          the one that applies to a value on a date.
--   equipment_breakdown_register
--                          nc_record_id (link to an NC record), affected_work_note
--                          and last_good_check_on ("work affected since the last
--                          good check", 6.4.9 / 7.10), status_before_breakdown
--                          (kept by the database).
--                          Triggers: while a breakdown is Open / Under Repair /
--                          Awaiting Verification the equipment is set Out of
--                          Service (equipment_for_calibration: In Repair, its
--                          CHECK allows no other value). Closing needs the
--                          return-to-service date, who authorized it and, when
--                          post-repair calibration is required, that it was done.
--                          On closure (or soft delete) the equipment returns to
--                          the status it had before the breakdown, unless another
--                          breakdown is still open. Scrapped -> Scrapped
--                          (equipment_for_calibration: Idle).
--                          The app may not set an equipment back in service by
--                          hand while a breakdown is open.
--   equipment_usable_on(...) (from 20261026100100) is replaced so it agrees with
--                          the above: a breakdown blocks the dates from
--                          breakdown_date until return to service (Scrapped: for
--                          good); an Out of Service status that only reflects an
--                          open breakdown does not block dates before that
--                          breakdown; equipment that needs acceptance is not
--                          usable before it was accepted.
--
-- Access
--   Read: known staff. Acceptance records and correction factors: written by
--   the Laboratory Director, Quality Manager or a Technical Manager
--   (app_equipment_can_authorize). Acceptance records cannot be changed; only
--   the Laboratory Director can delete one entered in error. Restrictive gate
--   lims_known_staff_only like every other public table. Every change is in the
--   audit trail.
--
-- Before this migration the app keeps working: the pages retry without the new
-- columns (PGRST204 / 42703) and hide the new panels.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.equipment_master') IS NULL
     OR to_regclass('public.nc_work_records') IS NULL
     OR to_regclass('public.equipment_breakdown_register') IS NULL
     OR to_regclass('public.result_validity_checks') IS NULL THEN
    RAISE EXCEPTION 'equipment_master, equipment_breakdown_register, result_validity_checks and nc_work_records must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Who may accept equipment and maintain correction factors.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_equipment_can_authorize()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF public.app_is_laboratory_director() THEN
    RETURN true;
  END IF;
  IF to_regprocedure('public.app_is_quality_manager()') IS NOT NULL THEN
    EXECUTE 'SELECT public.app_is_quality_manager()' INTO v_ok;
    IF v_ok THEN
      RETURN true;
    END IF;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.designation, ''))) = 'technical manager'
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.app_equipment_can_authorize() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_equipment_can_authorize() TO authenticated, service_role;

-- Statuses that mean "do not use" (same list as equipment_usable_on).
CREATE OR REPLACE FUNCTION public.app_equipment_status_blocks(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(btrim(coalesce(p_status, ''))) IN (
    'out of service', 'out-of-service', 'out of order', 'under repair', 'in repair',
    'breakdown', 'under breakdown', 'scrapped', 'retired', 'condemned', 'discarded'
  );
$$;

REVOKE ALL ON FUNCTION public.app_equipment_status_blocks(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_equipment_status_blocks(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Control charts: link a validity check to the NC raised for it (7.7.3).
-- ---------------------------------------------------------------------------

ALTER TABLE public.result_validity_checks
  ADD COLUMN IF NOT EXISTS nc_record_id uuid REFERENCES public.nc_work_records (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_result_validity_checks_nc
  ON public.result_validity_checks (nc_record_id) WHERE nc_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_result_validity_checks_iqc_date
  ON public.result_validity_checks (iqc_master_id, check_date) WHERE iqc_master_id IS NOT NULL;

COMMENT ON COLUMN public.result_validity_checks.nc_record_id IS
  'ISO 17025 7.7.3 / 7.10: nonconforming work record raised for this check (e.g. control chart action-limit violation).';

-- ---------------------------------------------------------------------------
-- 3. equipment_master: seal / tamper protection and "acceptance required".
-- ---------------------------------------------------------------------------

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS seal_no text,
  ADD COLUMN IF NOT EXISTS seal_intact_checked_on date,
  ADD COLUMN IF NOT EXISTS adjustment_protection text;

COMMENT ON COLUMN public.equipment_master.seal_no IS
  'ISO 17025 6.4.12: seal / tamper-evident label number protecting adjustments.';
COMMENT ON COLUMN public.equipment_master.seal_intact_checked_on IS
  'ISO 17025 6.4.12: date the seal was last found intact.';
COMMENT ON COLUMN public.equipment_master.adjustment_protection IS
  'ISO 17025 6.4.12: how adjustments that would invalidate results are prevented (seal, password, locked menu, ...).';

-- Existing rows: false (placed in service before acceptance records existed).
-- Rows added later: true.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'acceptance_required'
  ) THEN
    ALTER TABLE public.equipment_master ADD COLUMN acceptance_required boolean NOT NULL DEFAULT false;
  END IF;
  ALTER TABLE public.equipment_master ALTER COLUMN acceptance_required SET DEFAULT true;
END $$;

COMMENT ON COLUMN public.equipment_master.acceptance_required IS
  'ISO 17025 6.4.1-6.4.4: true when an acceptance / commissioning record is needed before use (equipment registered after 20261028100200).';

-- ---------------------------------------------------------------------------
-- 4. Acceptance / commissioning records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_acceptance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE RESTRICT,
  -- [{"item": "Physical condition / accessories", "expected": "...", "observed": "...", "ok": true}]
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  initial_calibration_ref text,
  initial_calibration_id uuid,
  accepted_on date NOT NULL DEFAULT current_date,
  result text NOT NULL,
  conditions text,
  remarks text,
  accepted_by uuid DEFAULT auth.uid(),
  accepted_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_acceptance_result_check CHECK (result IN ('accepted', 'conditional', 'rejected')),
  CONSTRAINT equipment_acceptance_checks_check CHECK (jsonb_typeof(checks) = 'array'),
  CONSTRAINT equipment_acceptance_rejected_needs_remarks
    CHECK (result <> 'rejected' OR btrim(coalesce(remarks, '')) <> ''),
  CONSTRAINT equipment_acceptance_conditional_needs_conditions
    CHECK (result <> 'conditional' OR btrim(coalesce(conditions, '')) <> '')
);

CREATE INDEX IF NOT EXISTS idx_equipment_acceptance_equipment
  ON public.equipment_acceptance (equipment_id, accepted_on DESC, created_at DESC);

-- Link to the calibration certificate history when that table exists (20261026100100).
DO $$
BEGIN
  IF to_regclass('public.equipment_calibration_history') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_acceptance_initial_calibration_fk'
         AND conrelid = 'public.equipment_acceptance'::regclass
     ) THEN
    ALTER TABLE public.equipment_acceptance
      ADD CONSTRAINT equipment_acceptance_initial_calibration_fk
      FOREIGN KEY (initial_calibration_id) REFERENCES public.equipment_calibration_history (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Who and when come from the server; the name from the profile.
CREATE OR REPLACE FUNCTION public.equipment_acceptance_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.accepted_by := auth.uid();
    NEW.created_at := now();
    IF NEW.accepted_on > current_date + 1 THEN
      RAISE EXCEPTION 'The acceptance date cannot be in the future (%).', NEW.accepted_on
        USING ERRCODE = '22007';
    END IF;
  END IF;
  NEW.checks := coalesce(NEW.checks, '[]'::jsonb);
  IF NEW.accepted_by IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(up.full_name), ''), up.email)
      INTO v_name
      FROM public.user_profiles up
     WHERE up.id = NEW.accepted_by;
    IF v_name IS NOT NULL THEN
      NEW.accepted_by_name := v_name;
    END IF;
  END IF;
  NEW.accepted_by_name := coalesce(NEW.accepted_by_name, '');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_acceptance_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipment_acceptance_before_insert ON public.equipment_acceptance;
CREATE TRIGGER trg_equipment_acceptance_before_insert
  BEFORE INSERT ON public.equipment_acceptance
  FOR EACH ROW EXECUTE FUNCTION public.equipment_acceptance_before_insert();

-- Accepting fills "date placed in service" when it is empty.
CREATE OR REPLACE FUNCTION public.equipment_acceptance_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.result IN ('accepted', 'conditional') THEN
    UPDATE public.equipment_master
       SET date_placed_in_service = NEW.accepted_on
     WHERE id = NEW.equipment_id
       AND date_placed_in_service IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_acceptance_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipment_acceptance_after_insert ON public.equipment_acceptance;
CREATE TRIGGER trg_equipment_acceptance_after_insert
  AFTER INSERT ON public.equipment_acceptance
  FOR EACH ROW EXECUTE FUNCTION public.equipment_acceptance_after_insert();

-- ---------------------------------------------------------------------------
-- 5. Correction factors (6.4.11)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_correction_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE CASCADE,
  quantity text NOT NULL,
  range_from numeric,
  range_to numeric,
  correction numeric NOT NULL,
  unit text,
  source_certificate text,
  calibration_history_id uuid,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_correction_factors_quantity_check CHECK (btrim(quantity) <> ''),
  CONSTRAINT equipment_correction_factors_range_check
    CHECK (range_from IS NULL OR range_to IS NULL OR range_from <= range_to),
  CONSTRAINT equipment_correction_factors_period_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_equipment_correction_factors_equipment
  ON public.equipment_correction_factors (equipment_id, lower(btrim(quantity)), effective_from DESC);

DO $$
BEGIN
  IF to_regclass('public.equipment_calibration_history') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'equipment_correction_factors_calibration_fk'
         AND conrelid = 'public.equipment_correction_factors'::regclass
     ) THEN
    ALTER TABLE public.equipment_correction_factors
      ADD CONSTRAINT equipment_correction_factors_calibration_fk
      FOREIGN KEY (calibration_history_id) REFERENCES public.equipment_calibration_history (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.equipment_correction_factors_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
  END IF;
  NEW.quantity := btrim(NEW.quantity);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_correction_factors_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipment_correction_factors_before_insert ON public.equipment_correction_factors;
CREATE TRIGGER trg_equipment_correction_factors_before_insert
  BEFORE INSERT ON public.equipment_correction_factors
  FOR EACH ROW EXECUTE FUNCTION public.equipment_correction_factors_before_insert();

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_equipment_correction_factors_updated_at ON public.equipment_correction_factors;
  CREATE TRIGGER trg_equipment_correction_factors_updated_at
    BEFORE UPDATE ON public.equipment_correction_factors
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
END $$;

-- The correction that applies to a reading of p_value (quantity matched
-- case-insensitively) on p_on: effective on that date, value inside the range
-- (open ends allowed); the narrowest range wins, then the latest effective_from.
-- SECURITY INVOKER: the caller's RLS applies.
DROP FUNCTION IF EXISTS public.equipment_correction_for(uuid, text, numeric, date);
CREATE FUNCTION public.equipment_correction_for(
  p_equipment_id uuid,
  p_quantity text,
  p_value numeric DEFAULT NULL,
  p_on date DEFAULT current_date
)
RETURNS TABLE (
  factor_id uuid,
  correction numeric,
  unit text,
  range_from numeric,
  range_to numeric,
  source_certificate text,
  effective_from date,
  effective_to date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT f.id, f.correction, f.unit, f.range_from, f.range_to, f.source_certificate, f.effective_from, f.effective_to
  FROM public.equipment_correction_factors f
  WHERE f.equipment_id = p_equipment_id
    AND lower(btrim(f.quantity)) = lower(btrim(coalesce(p_quantity, '')))
    AND f.effective_from <= coalesce(p_on, current_date)
    AND (f.effective_to IS NULL OR f.effective_to >= coalesce(p_on, current_date))
    AND (p_value IS NULL OR f.range_from IS NULL OR p_value >= f.range_from)
    AND (p_value IS NULL OR f.range_to IS NULL OR p_value <= f.range_to)
  ORDER BY (f.range_from IS NULL OR f.range_to IS NULL) ASC,
           (f.range_to - f.range_from) ASC NULLS LAST,
           f.effective_from DESC,
           f.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.equipment_correction_for(uuid, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipment_correction_for(uuid, text, numeric, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Breakdown register: NC link, affected work, automatic out-of-service.
-- ---------------------------------------------------------------------------

ALTER TABLE public.equipment_breakdown_register
  ADD COLUMN IF NOT EXISTS nc_record_id uuid REFERENCES public.nc_work_records (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affected_work_note text,
  ADD COLUMN IF NOT EXISTS last_good_check_on date,
  ADD COLUMN IF NOT EXISTS status_before_breakdown text;

CREATE INDEX IF NOT EXISTS idx_equipment_breakdown_register_nc
  ON public.equipment_breakdown_register (nc_record_id) WHERE nc_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipment_breakdown_register_open
  ON public.equipment_breakdown_register (equipment_id)
  WHERE status IN ('Open', 'Under Repair', 'Awaiting Verification');

COMMENT ON COLUMN public.equipment_breakdown_register.nc_record_id IS
  'ISO 17025 6.4.9 / 7.10: nonconforming work record for work affected by this breakdown.';
COMMENT ON COLUMN public.equipment_breakdown_register.affected_work_note IS
  'ISO 17025 6.4.9: effect of the defect on work done since the last good check (results / reports examined).';
COMMENT ON COLUMN public.equipment_breakdown_register.last_good_check_on IS
  'ISO 17025 6.4.9: date of the last calibration / intermediate check / use known to be good.';
COMMENT ON COLUMN public.equipment_breakdown_register.status_before_breakdown IS
  'Set by the database: equipment status before it was taken out of service, restored on closure.';

-- Which equipment table a breakdown row points at.
CREATE OR REPLACE FUNCTION public.app_breakdown_equipment_table(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_source IN ('calibration', 'calibration_iqc') THEN 'equipment_for_calibration'
    WHEN p_source = 'testing_iqc' THEN 'iqc_masters'
    ELSE 'equipment_master'
  END;
$$;

-- Out-of-service / scrapped status values per table
-- (equipment_for_calibration has CHECK (equipment_status IN ('Active','In Repair','Idle'))).
CREATE OR REPLACE FUNCTION public.app_breakdown_status_value(p_table text, p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_table = 'equipment_for_calibration' AND p_kind = 'scrapped' THEN 'Idle'
    WHEN p_table = 'equipment_for_calibration' THEN 'In Repair'
    WHEN p_kind = 'scrapped' THEN 'Scrapped'
    ELSE 'Out of Service'
  END;
$$;

-- Is this breakdown row (as jsonb) currently open?
CREATE OR REPLACE FUNCTION public.app_breakdown_row_open(p_row jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_row IS NOT NULL
     AND (p_row ->> 'status') IN ('Open', 'Under Repair', 'Awaiting Verification')
     AND nullif(p_row ->> 'deleted_at', '') IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.app_breakdown_get_equipment_status(p_table text, p_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  IF p_table NOT IN ('equipment_master', 'equipment_for_calibration', 'iqc_masters') THEN
    RETURN NULL;
  END IF;
  IF p_id IS NULL OR to_regclass('public.' || p_table) IS NULL OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'equipment_status'
  ) THEN
    RETURN NULL;
  END IF;
  EXECUTE format('SELECT equipment_status FROM public.%I WHERE id = $1', p_table) INTO v USING p_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_breakdown_set_equipment_status(p_table text, p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_table NOT IN ('equipment_master', 'equipment_for_calibration', 'iqc_masters') THEN
    RETURN;
  END IF;
  IF p_id IS NULL OR p_status IS NULL OR to_regclass('public.' || p_table) IS NULL OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'equipment_status'
  ) THEN
    RETURN;
  END IF;
  EXECUTE format(
    'UPDATE public.%I SET equipment_status = $2 WHERE id = $1 AND equipment_status IS DISTINCT FROM $2',
    p_table) USING p_id, p_status;
END;
$$;

-- Register numbers of the open, not deleted breakdowns of an equipment.
CREATE OR REPLACE FUNCTION public.app_equipment_open_breakdowns(p_equipment_id uuid, p_exclude uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  IF p_equipment_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT string_agg(coalesce(nullif(x.b ->> 'register_no', ''), 'breakdown'), ', ' ORDER BY x.b ->> 'breakdown_date')
    INTO v
    FROM (
      SELECT to_jsonb(r) AS b
      FROM public.equipment_breakdown_register r
      WHERE r.equipment_id = p_equipment_id
        AND r.id IS DISTINCT FROM p_exclude
        AND r.status IN ('Open', 'Under Repair', 'Awaiting Verification')
    ) x
   WHERE public.app_breakdown_row_open(x.b);
  RETURN v;
END;
$$;

-- Put the equipment back after a breakdown stops being open (closed,
-- scrapped elsewhere, deleted, or moved to another equipment), unless another
-- breakdown is still open or someone already changed the status.
CREATE OR REPLACE FUNCTION public.app_breakdown_restore_equipment(p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := nullif(p_row ->> 'equipment_id', '')::uuid;
  v_table text := public.app_breakdown_equipment_table(p_row ->> 'equipment_source');
  v_cur text;
  v_prev text;
BEGIN
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  IF public.app_equipment_open_breakdowns(v_id, nullif(p_row ->> 'id', '')::uuid) IS NOT NULL THEN
    RETURN;
  END IF;
  v_cur := public.app_breakdown_get_equipment_status(v_table, v_id);
  IF v_cur IS NULL
     OR lower(btrim(v_cur)) <> lower(public.app_breakdown_status_value(v_table, 'out')) THEN
    RETURN;
  END IF;
  v_prev := nullif(btrim(coalesce(p_row ->> 'status_before_breakdown', '')), '');
  IF v_prev IS NULL THEN
    SELECT r.status_before_breakdown INTO v_prev
      FROM public.equipment_breakdown_register r
     WHERE r.equipment_id = v_id
       AND nullif(btrim(coalesce(r.status_before_breakdown, '')), '') IS NOT NULL
     ORDER BY r.updated_at DESC
     LIMIT 1;
  END IF;
  IF v_prev IS NULL OR public.app_equipment_status_blocks(v_prev) THEN
    v_prev := 'Active';
  END IF;
  PERFORM public.app_breakdown_set_equipment_status(v_table, v_id, v_prev);
END;
$$;

-- Read by the invoker BEFORE trigger below; returns one status text of the
-- three equipment tables only.
REVOKE ALL ON FUNCTION public.app_breakdown_get_equipment_status(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_breakdown_get_equipment_status(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_breakdown_set_equipment_status(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_breakdown_restore_equipment(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_equipment_open_breakdowns(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_equipment_open_breakdowns(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_breakdown_equipment_table(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_breakdown_equipment_table(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_breakdown_status_value(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_breakdown_status_value(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_breakdown_row_open(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_breakdown_row_open(jsonb) TO authenticated, service_role;

-- BEFORE INSERT / UPDATE (invoker, so current_user tells the app apart from
-- the owner / service_role): closing needs return-to-service authorization;
-- remember the equipment status before it is taken out of service.
CREATE OR REPLACE FUNCTION public.equipment_breakdown_register_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := current_user IN ('authenticated', 'anon');
  v_new_open boolean := public.app_breakdown_row_open(to_jsonb(NEW));
  v_was_open boolean := false;
  v_cur text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_was_open := public.app_breakdown_row_open(to_jsonb(OLD))
      AND OLD.equipment_id IS NOT DISTINCT FROM NEW.equipment_id
      AND public.app_breakdown_equipment_table(OLD.equipment_source)
          = public.app_breakdown_equipment_table(NEW.equipment_source);
  END IF;

  IF v_app AND NEW.status = 'Closed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Closed') THEN
    IF NEW.return_to_service_date IS NULL THEN
      RAISE EXCEPTION 'Enter the return-to-service date and time before closing breakdown %.', NEW.register_no
        USING ERRCODE = '23514',
              HINT = 'Equipment returns to service only after repair and verification (ISO/IEC 17025 6.4.9).';
    END IF;
    IF NEW.authorized_by_employee_id IS NULL AND btrim(coalesce(NEW.authorized_by_name, '')) = '' THEN
      RAISE EXCEPTION 'Select who authorized the return to service before closing breakdown %.', NEW.register_no
        USING ERRCODE = '23514',
              HINT = 'Return to service must be authorized (ISO/IEC 17025 6.4.9).';
    END IF;
    IF coalesce(NEW.post_repair_check_required, false) AND NOT coalesce(NEW.post_repair_check_done, false) THEN
      RAISE EXCEPTION 'Post-repair calibration / verification of breakdown % is not recorded as done.', NEW.register_no
        USING ERRCODE = '23514',
              HINT = 'Record the post-repair calibration (Calibration Form) or mark it "not required" with a reason in Verification Notes.';
    END IF;
  END IF;

  IF NOT v_new_open OR NEW.equipment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT v_was_open THEN
    v_cur := public.app_breakdown_get_equipment_status(
      public.app_breakdown_equipment_table(NEW.equipment_source), NEW.equipment_id);
    IF v_cur IS NOT NULL AND NOT public.app_equipment_status_blocks(v_cur) THEN
      NEW.status_before_breakdown := v_cur;
    ELSIF TG_OP = 'INSERT' THEN
      NEW.status_before_breakdown := NULL;
    END IF;
  ELSIF v_app THEN
    NEW.status_before_breakdown := OLD.status_before_breakdown;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_breakdown_register_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipment_breakdown_register_before_write ON public.equipment_breakdown_register;
CREATE TRIGGER trg_equipment_breakdown_register_before_write
  BEFORE INSERT OR UPDATE ON public.equipment_breakdown_register
  FOR EACH ROW EXECUTE FUNCTION public.equipment_breakdown_register_before_write();

-- AFTER: keep the equipment status in step with its breakdowns.
CREATE OR REPLACE FUNCTION public.equipment_breakdown_register_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new_open boolean := public.app_breakdown_row_open(v_new);
  v_old_open boolean := public.app_breakdown_row_open(v_old);
  v_same boolean := false;
  v_table text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_same := NEW.equipment_id IS NOT DISTINCT FROM OLD.equipment_id
      AND public.app_breakdown_equipment_table(NEW.equipment_source)
          = public.app_breakdown_equipment_table(OLD.equipment_source);
  END IF;

  IF v_new IS NOT NULL AND NEW.equipment_id IS NOT NULL THEN
    v_table := public.app_breakdown_equipment_table(NEW.equipment_source);
    IF v_new_open THEN
      PERFORM public.app_breakdown_set_equipment_status(
        v_table, NEW.equipment_id, public.app_breakdown_status_value(v_table, 'out'));
    ELSIF NEW.status = 'Scrapped' AND nullif(v_new ->> 'deleted_at', '') IS NULL
          AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Scrapped' OR NOT v_same) THEN
      PERFORM public.app_breakdown_set_equipment_status(
        v_table, NEW.equipment_id, public.app_breakdown_status_value(v_table, 'scrapped'));
    ELSIF v_old_open AND v_same THEN
      PERFORM public.app_breakdown_restore_equipment(v_new);
    END IF;
  END IF;

  IF v_old_open AND OLD.equipment_id IS NOT NULL AND (TG_OP = 'DELETE' OR NOT v_same) THEN
    PERFORM public.app_breakdown_restore_equipment(v_old);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_breakdown_register_after_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipment_breakdown_register_after_write ON public.equipment_breakdown_register;
CREATE TRIGGER trg_equipment_breakdown_register_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.equipment_breakdown_register
  FOR EACH ROW EXECUTE FUNCTION public.equipment_breakdown_register_after_write();

-- Equipment tables: the app may not put an equipment back in service by hand
-- while a breakdown is open, and only authorizers change acceptance_required.
-- Changes made by the breakdown / acceptance triggers (nested) pass.
CREATE OR REPLACE FUNCTION public.app_equipment_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_open text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'equipment_master'
     AND (to_jsonb(NEW) -> 'acceptance_required') IS DISTINCT FROM (to_jsonb(OLD) -> 'acceptance_required')
     AND NOT public.app_equipment_can_authorize() THEN
    RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can change whether acceptance is required.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.equipment_status IS DISTINCT FROM OLD.equipment_status
     AND NOT public.app_equipment_status_blocks(NEW.equipment_status) THEN
    v_open := public.app_equipment_open_breakdowns(NEW.id, NULL);
    IF v_open IS NOT NULL THEN
      RAISE EXCEPTION 'This equipment is out of service: breakdown % is open.', v_open
        USING ERRCODE = '23514',
              HINT = 'Close the breakdown with return-to-service authorization; the status then changes back automatically (ISO/IEC 17025 6.4.9).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.app_equipment_status_guard() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['equipment_master', 'equipment_for_calibration', 'iqc_masters'] LOOP
    CONTINUE WHEN to_regclass('public.' || rel) IS NULL;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = rel AND column_name = 'equipment_status'
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_status_guard', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.app_equipment_status_guard()',
      'trg_' || rel || '_status_guard', rel);
  END LOOP;
END $$;

-- Equipment already under an open breakdown when this migration runs:
-- take it out of service now (the same as the trigger would have done).
DO $$
DECLARE
  r record;
  v_table text;
  v_cur text;
BEGIN
  FOR r IN
    SELECT b.id, b.equipment_id, b.equipment_source
    FROM public.equipment_breakdown_register b
    WHERE b.equipment_id IS NOT NULL
      AND public.app_breakdown_row_open(to_jsonb(b))
  LOOP
    v_table := public.app_breakdown_equipment_table(r.equipment_source);
    v_cur := public.app_breakdown_get_equipment_status(v_table, r.equipment_id);
    IF v_cur IS NOT NULL AND NOT public.app_equipment_status_blocks(v_cur) THEN
      UPDATE public.equipment_breakdown_register
         SET status_before_breakdown = v_cur
       WHERE id = r.id AND status_before_breakdown IS NULL;
    END IF;
    PERFORM public.app_breakdown_set_equipment_status(
      v_table, r.equipment_id, public.app_breakdown_status_value(v_table, 'out'));
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. equipment_usable_on(equipment_id, on_date), consistent with section 6
--    and acceptance. Same signature and result as 20261026100100.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.equipment_usable_on(p_equipment_id uuid, p_on date DEFAULT current_date)
RETURNS TABLE (usable boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_on date := coalesce(p_on, current_date);
  v_row jsonb;
  v_kind text;
  v_table text;
  v_status text;
  v_due date;
  v_valid date;
  v_reasons text[] := ARRAY[]::text[];
  v_staff boolean;
  v_breakdown text;
  v_open_any text;
  v_acc text;
BEGIN
  IF auth.uid() IS NOT NULL AND to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    EXECUTE 'SELECT public.app_is_known_staff()' INTO v_staff;
    IF NOT coalesce(v_staff, false) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_equipment_id IS NULL THEN
    RETURN QUERY SELECT false, 'No equipment selected';
    RETURN;
  END IF;

  SELECT to_jsonb(e) INTO v_row FROM public.equipment_master e WHERE e.id = p_equipment_id;
  IF v_row IS NOT NULL THEN
    v_kind := 'equipment';
    v_table := 'equipment_master';
  ELSIF to_regclass('public.equipment_for_calibration') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(e) FROM public.equipment_for_calibration e WHERE e.id = $1'
      INTO v_row USING p_equipment_id;
    IF v_row IS NOT NULL THEN
      v_kind := 'equipment';
      v_table := 'equipment_for_calibration';
    END IF;
  END IF;
  IF v_row IS NULL AND to_regclass('public.equipment_crms') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(c) FROM public.equipment_crms c WHERE c.id = $1'
      INTO v_row USING p_equipment_id;
    IF v_row IS NOT NULL THEN
      v_kind := 'crm';
    END IF;
  END IF;

  IF v_row IS NULL THEN
    RETURN QUERY SELECT false, 'Equipment / CRM not found';
    RETURN;
  END IF;

  IF nullif(v_row ->> 'deleted_at', '') IS NOT NULL THEN
    RETURN QUERY SELECT false, 'Deleted (in the Recycle Bin)';
    RETURN;
  END IF;

  IF v_kind = 'crm' THEN
    v_valid := nullif(left(v_row ->> 'valid_upto', 10), '')::date;
    IF v_valid IS NOT NULL AND v_valid < v_on THEN
      v_reasons := v_reasons || format('CRM expired on %s', to_char(v_valid, 'DD-MM-YYYY'));
    END IF;
  ELSE
    -- Breakdowns covering v_on: open ones from breakdown_date on; closed ones
    -- from breakdown_date until the day of return to service; scrapped for good.
    v_open_any := public.app_equipment_open_breakdowns(p_equipment_id, NULL);
    IF to_regclass('public.equipment_breakdown_register') IS NOT NULL THEN
      SELECT string_agg(coalesce(nullif(x.b ->> 'register_no', ''), 'breakdown') || ' (' || (x.b ->> 'status') || ')', ', '
                        ORDER BY x.b ->> 'breakdown_date')
        INTO v_breakdown
        FROM (SELECT to_jsonb(r) AS b FROM public.equipment_breakdown_register r WHERE r.equipment_id = p_equipment_id) x
       WHERE nullif(x.b ->> 'deleted_at', '') IS NULL
         AND (nullif(x.b ->> 'breakdown_date', '') IS NULL OR (x.b ->> 'breakdown_date')::date <= v_on)
         AND (
           (x.b ->> 'status') IN ('Open', 'Under Repair', 'Awaiting Verification', 'Scrapped')
           OR ((x.b ->> 'status') = 'Closed'
               AND nullif(x.b ->> 'return_to_service_date', '') IS NOT NULL
               AND (x.b ->> 'return_to_service_date')::timestamptz::date > v_on)
         );
      IF v_breakdown IS NOT NULL THEN
        v_reasons := v_reasons || ('Breakdown: ' || v_breakdown);
      END IF;
    END IF;

    -- The status. An out-of-service status set because of an open breakdown is
    -- governed by that breakdown's dates (above), not by today's status.
    v_status := lower(btrim(coalesce(v_row ->> 'equipment_status', '')));
    IF public.app_equipment_status_blocks(v_status)
       AND NOT (v_open_any IS NOT NULL
                AND v_status = lower(public.app_breakdown_status_value(v_table, 'out'))) THEN
      v_reasons := v_reasons || format('Status is %s', btrim(v_row ->> 'equipment_status'));
    END IF;

    v_due := nullif(left(v_row ->> 'next_calibration_due', 10), '')::date;
    IF v_due IS NOT NULL AND v_due < v_on THEN
      v_reasons := v_reasons || format('Calibration overdue since %s', to_char(v_due, 'DD-MM-YYYY'));
    END IF;

    -- Acceptance / commissioning (6.4.1-6.4.4) for testing equipment that needs it.
    IF v_table = 'equipment_master'
       AND coalesce((v_row ->> 'acceptance_required')::boolean, false)
       AND coalesce(nullif(v_row ->> 'equipment_kind', ''), 'testing') = 'testing'
       AND to_regclass('public.equipment_acceptance') IS NOT NULL THEN
      SELECT a.result INTO v_acc
        FROM public.equipment_acceptance a
       WHERE a.equipment_id = p_equipment_id
         AND a.accepted_on <= v_on
       ORDER BY a.accepted_on DESC, a.created_at DESC
       LIMIT 1;
      IF v_acc IS NULL THEN
        v_reasons := v_reasons || 'Not yet accepted / commissioned'::text;
      ELSIF v_acc = 'rejected' THEN
        v_reasons := v_reasons || 'Acceptance / commissioning rejected'::text;
      END IF;
    END IF;
  END IF;

  IF array_length(v_reasons, 1) IS NULL THEN
    RETURN QUERY SELECT true, NULL::text;
  ELSE
    RETURN QUERY SELECT false, array_to_string(v_reasons, '; ');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_usable_on(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipment_usable_on(uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Row level security and grants for the new tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.equipment_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_correction_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipment_acceptance_select ON public.equipment_acceptance;
CREATE POLICY equipment_acceptance_select ON public.equipment_acceptance
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS equipment_acceptance_insert ON public.equipment_acceptance;
CREATE POLICY equipment_acceptance_insert ON public.equipment_acceptance
  FOR INSERT TO authenticated
  WITH CHECK (public.app_equipment_can_authorize() AND accepted_by = auth.uid());
DROP POLICY IF EXISTS equipment_acceptance_delete ON public.equipment_acceptance;
CREATE POLICY equipment_acceptance_delete ON public.equipment_acceptance
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

DROP POLICY IF EXISTS equipment_correction_factors_select ON public.equipment_correction_factors;
CREATE POLICY equipment_correction_factors_select ON public.equipment_correction_factors
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS equipment_correction_factors_insert ON public.equipment_correction_factors;
CREATE POLICY equipment_correction_factors_insert ON public.equipment_correction_factors
  FOR INSERT TO authenticated WITH CHECK (public.app_equipment_can_authorize());
DROP POLICY IF EXISTS equipment_correction_factors_update ON public.equipment_correction_factors;
CREATE POLICY equipment_correction_factors_update ON public.equipment_correction_factors
  FOR UPDATE TO authenticated
  USING (public.app_equipment_can_authorize())
  WITH CHECK (public.app_equipment_can_authorize());
DROP POLICY IF EXISTS equipment_correction_factors_delete ON public.equipment_correction_factors;
CREATE POLICY equipment_correction_factors_delete ON public.equipment_correction_factors
  FOR DELETE TO authenticated USING (public.app_equipment_can_authorize());

-- Same outer gate as every other public table (20261009063000).
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['equipment_acceptance', 'equipment_correction_factors'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
END $$;

REVOKE ALL ON public.equipment_acceptance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.equipment_correction_factors FROM PUBLIC, anon, authenticated;
-- Acceptance records: no UPDATE for anyone in the app (append-only).
GRANT SELECT, INSERT, DELETE ON public.equipment_acceptance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_correction_factors TO authenticated;
GRANT ALL ON public.equipment_acceptance TO service_role;
GRANT ALL ON public.equipment_correction_factors TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Audit trail (ISO/IEC 17025 7.5). equipment_master, the breakdown register
--    and result_validity_checks are already audited (20261024100000).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: acceptance / correction tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['equipment_acceptance', 'equipment_correction_factors'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
