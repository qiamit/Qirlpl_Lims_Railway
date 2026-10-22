-- ISO/IEC 17025 clauses 6.4.8, 6.4.13, 6.5 and 7.5.1, gap item P1-8:
-- equipment and reference materials used for each result, and traceability.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000 (app_is_known_staff), 20261024100000 (audit trail) and,
-- ideally, 20261025100000 (soft delete), while the lab is idle.
-- Safe to run more than once.
--
-- 1. test_allocation_parameters.equipment_used: per result, a snapshot of the
--    equipment and CRMs used, taken when the results are saved, so later edits
--    of the masters do not change the record. Each array item:
--      { equipment_id, kind ('equipment' | 'crm'), asset_code, name,
--        cal_cert_no, cal_due_date, status_at_use, crm_valid_upto,
--        usable, reason, override_reason, override_by, override_by_name, override_at }
--    (the override_* keys only when the Laboratory Director overrode a block).
--    A result that needs no equipment (visual examination, calculation,
--    observation) holds a single item { kind: 'none', reason } instead.
-- 2. equipment_calibration_history: one row per calibration certificate
--    received for an equipment, with the 6.4 review (agency accreditation and
--    scope, uncertainty, errors within acceptance, corrections) and the
--    accept / reject decision. Append-only for API users: certificates are
--    never overwritten again.
-- 3. equipment_usable_on(equipment_id, on_date): may this equipment / CRM be
--    used on that date? (calibration overdue, out of service / under repair,
--    open breakdown, deleted, CRM expired).

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Equipment used, per result
-- ---------------------------------------------------------------------------

ALTER TABLE public.test_allocation_parameters
  ADD COLUMN IF NOT EXISTS equipment_used jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'test_allocation_parameters_equipment_used_array'
      AND conrelid = 'public.test_allocation_parameters'::regclass
  ) THEN
    ALTER TABLE public.test_allocation_parameters
      ADD CONSTRAINT test_allocation_parameters_equipment_used_array
      CHECK (jsonb_typeof(equipment_used) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.test_allocation_parameters.equipment_used IS
  'ISO 17025 6.4 / 7.5.1: snapshot of equipment and CRMs used for this result, taken at save time.';

-- ---------------------------------------------------------------------------
-- 2. Calibration certificate history (review / acceptance, ISO 17025 6.4.8-6.4.13)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_calibration_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE RESTRICT,
  certificate_no text NOT NULL,
  calibrated_on date NOT NULL,
  due_on date,
  agency text,
  agency_id uuid,
  agency_nabl_accredited boolean,
  agency_scope_ok boolean,
  uncertainty text,
  uncertainty_unit text,
  coverage_factor text,
  errors_within_acceptance boolean,
  corrections_applied text,
  certificate_path text,
  accepted boolean NOT NULL DEFAULT false,
  reviewed_by uuid DEFAULT auth.uid(),
  reviewed_by_name text NOT NULL DEFAULT '',
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_calibration_history_cert_no_check
    CHECK (btrim(certificate_no) <> ''),
  CONSTRAINT equipment_calibration_history_dates_check
    CHECK (due_on IS NULL OR due_on >= calibrated_on),
  CONSTRAINT equipment_calibration_history_rejected_needs_remarks
    CHECK (accepted OR btrim(coalesce(remarks, '')) <> '')
);

CREATE INDEX IF NOT EXISTS idx_equipment_calibration_history_equipment
  ON public.equipment_calibration_history (equipment_id, calibrated_on DESC, created_at DESC);

-- Reviewer and time come from the server; the name falls back to the profile.
-- Rows written without a user session (service_role backfill) keep their values.
CREATE OR REPLACE FUNCTION public.equipment_calibration_history_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
    NEW.created_at := now();
  END IF;
  IF btrim(coalesce(NEW.reviewed_by_name, '')) = '' AND NEW.reviewed_by IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(up.full_name), ''), '')
      INTO NEW.reviewed_by_name
      FROM public.user_profiles up
     WHERE up.id = NEW.reviewed_by;
  END IF;
  NEW.reviewed_by_name := coalesce(NEW.reviewed_by_name, '');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.equipment_calibration_history_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_equipment_calibration_history_before_insert ON public.equipment_calibration_history;
CREATE TRIGGER trg_equipment_calibration_history_before_insert
  BEFORE INSERT ON public.equipment_calibration_history
  FOR EACH ROW EXECUTE FUNCTION public.equipment_calibration_history_before_insert();

ALTER TABLE public.equipment_calibration_history ENABLE ROW LEVEL SECURITY;

-- Known staff read every certificate and add new ones (as themselves).
-- No UPDATE or DELETE policy: both are refused for every API user.
DO $$
DECLARE
  gate text := 'true';
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    gate := 'public.app_is_known_staff()';
  END IF;
  DROP POLICY IF EXISTS equipment_calibration_history_select ON public.equipment_calibration_history;
  EXECUTE format(
    'CREATE POLICY equipment_calibration_history_select ON public.equipment_calibration_history '
    'FOR SELECT TO authenticated USING (%s)', gate);
  DROP POLICY IF EXISTS equipment_calibration_history_insert ON public.equipment_calibration_history;
  EXECUTE format(
    'CREATE POLICY equipment_calibration_history_insert ON public.equipment_calibration_history '
    'FOR INSERT TO authenticated WITH CHECK (%s AND reviewed_by = auth.uid())', gate);
END $$;

-- Same outer gate as every other public table (20261009063000).
DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    DROP POLICY IF EXISTS lims_known_staff_only ON public.equipment_calibration_history;
    CREATE POLICY lims_known_staff_only ON public.equipment_calibration_history
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.app_is_known_staff())
      WITH CHECK (public.app_is_known_staff());
  END IF;
END $$;

REVOKE ALL ON public.equipment_calibration_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.equipment_calibration_history TO authenticated;
GRANT ALL ON public.equipment_calibration_history TO service_role;

-- Every insert (and any service_role correction) is recorded (ISO 17025 7.5).
DO $$
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'equipment_calibration_history_audit_log'
      AND tgrelid = 'public.equipment_calibration_history'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER equipment_calibration_history_audit_log
      AFTER INSERT OR UPDATE OR DELETE ON public.equipment_calibration_history
      FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. equipment_usable_on(equipment_id, on_date)
--    Looks the id up in equipment_master, equipment_for_calibration and
--    equipment_crms. Rows are read as jsonb so the function works whether or
--    not optional columns (deleted_at, ...) exist on this database.
--    SECURITY DEFINER so a soft-deleted row is reported as deleted (RLS would
--    hide it); it only returns usable / reason, never row data.
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
  v_label text;
  v_status text;
  v_due date;
  v_valid date;
  v_reasons text[] := ARRAY[]::text[];
  v_staff boolean;
  v_breakdown text;
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
  ELSIF to_regclass('public.equipment_for_calibration') IS NOT NULL THEN
    EXECUTE 'SELECT to_jsonb(e) FROM public.equipment_for_calibration e WHERE e.id = $1'
      INTO v_row USING p_equipment_id;
    IF v_row IS NOT NULL THEN
      v_kind := 'equipment';
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
    v_status := lower(btrim(coalesce(v_row ->> 'equipment_status', '')));
    IF v_status IN (
      'out of service', 'out-of-service', 'out of order', 'under repair', 'in repair',
      'breakdown', 'under breakdown', 'scrapped', 'retired', 'condemned', 'discarded'
    ) THEN
      v_reasons := v_reasons || format('Status is %s', btrim(v_row ->> 'equipment_status'));
    END IF;
    v_due := nullif(left(v_row ->> 'next_calibration_due', 10), '')::date;
    IF v_due IS NOT NULL AND v_due < v_on THEN
      v_reasons := v_reasons || format('Calibration overdue since %s', to_char(v_due, 'DD-MM-YYYY'));
    END IF;
    IF to_regclass('public.equipment_breakdown_register') IS NOT NULL THEN
      EXECUTE $q$
        SELECT string_agg(coalesce(nullif(b ->> 'register_no', ''), 'breakdown') || ' (' || (b ->> 'status') || ')', ', ')
          FROM (SELECT to_jsonb(r) AS b FROM public.equipment_breakdown_register r WHERE r.equipment_id = $1) x
         WHERE (b ->> 'status') IN ('Open', 'Under Repair', 'Awaiting Verification')
           AND nullif(b ->> 'deleted_at', '') IS NULL
           AND (nullif(b ->> 'breakdown_date', '') IS NULL OR (b ->> 'breakdown_date')::date <= $2)
      $q$ INTO v_breakdown USING p_equipment_id, v_on;
      IF v_breakdown IS NOT NULL THEN
        v_reasons := v_reasons || ('Breakdown open: ' || v_breakdown);
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

NOTIFY pgrst, 'reload schema';
