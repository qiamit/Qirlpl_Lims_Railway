-- ISO/IEC 17025 gaps P2-3 (unified CAPA register, report issue hold),
-- P2-8 (opinions and interpretations) and P2-11 (per-observation records).
-- Clauses 7.4, 7.5.1, 7.8.7, 7.9, 7.10, 8.7.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261024100300_report_issue_signature.sql, 20261025100000_soft_delete.sql,
-- 20261026100200_environmental_monitoring.sql, 20261027100000_proficiency_testing.sql,
-- 20261027100200_management_review_meetings.sql and
-- 20261027100400_personnel_competence.sql, while the lab is idle. Safe to re-run.
-- The frontend works with or without it: until it is applied every screen
-- behaves as before (new sections hidden, saves retried without new columns).
--
-- What it adds
--   A. CAPA register (8.7, 7.9, 7.10)
--      * CAPA tracking columns on audit_nc_actions, nc_work_corrective_actions
--        and customer_complaints: owner, due date, closed on (actions only),
--        effectiveness review due, outcome, notes, verified on / by.
--        verified_by / verified_by_name are stamped by trigger from the signed-in
--        user; only the Laboratory Director, Quality Manager or a Technical
--        Manager may record the effectiveness outcome.
--      * customer_complaints.nc_record_id: complaint -> NC work record ("Raise NC").
--      * nc_work_records.sample_id / srf_number: the NC is about this sample.
--        Either one is enough; the trigger fills the other.
--      * capa_register_v (security_invoker): one row per corrective action from
--        every source: audit NCs, NC work records (with the complaint / PT /
--        environment origin), complaints not yet turned into an NC,
--        unsatisfactory PT results without an NC, and management review actions.
--        Columns: source, ref, owner, due date, status (open / in_progress /
--        closed), overdue, effectiveness review due / outcome / overdue.
--      * Report issue hold (7.10.1): a sample cannot move to stage 'completed'
--        (test report issued) while a nonconforming work record linked to it is
--        not Closed and has no resumption authorization. The Laboratory Director
--        may override by sending issue_hold_override_reason in the issue UPDATE;
--        the trigger records who, when and which NCs. The browser cannot set the
--        override columns any other way.
--   B. Opinions and interpretations (7.8.7) on samples: opinions_text,
--      opinions_basis, opinions_by, opinions_by_name, opinions_at. by / at are
--      stamped by trigger. When the Authorization Matrix is in use for
--      'give_opinion', only an authorized person (or the Laboratory Director)
--      can write them.
--   C. Per-observation records (7.5.1, 7.4)
--      * test_allocation_parameters.entered_by / entered_by_name / entered_at,
--        stamped by trigger whenever results change.
--      * result_attachments + private bucket result-attachments: raw printouts /
--        photos per parameter result. Known staff read and add; the uploader
--        may remove until the report is issued; the Laboratory Director always.
--      * sample_custody_log: one row per sample stage change (written by
--        trigger), with who handed over and, once acknowledged, who received.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regprocedure('public.stamp_report_issuer()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261024100300_report_issue_signature.sql first';
  END IF;
  IF to_regclass('public.pt_participations') IS NULL OR to_regclass('public.environment_readings') IS NULL
     OR to_regclass('public.mrm_actions') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261026100200 (environment), 20261027100000 (PT) and 20261027100200 (MRM) first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nc_work_records' AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION 'Apply 20261025100000_soft_delete.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_profile_name(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT nullif(btrim(up.full_name), '') FROM public.user_profiles up WHERE up.id = p_user;
$$;

REVOKE ALL ON FUNCTION public.app_profile_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_profile_name(uuid) TO authenticated, service_role;

-- Laboratory Director, Quality Manager or an active Technical Manager.
CREATE OR REPLACE FUNCTION public.app_capa_can_verify()
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

REVOKE ALL ON FUNCTION public.app_capa_can_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_capa_can_verify() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. CAPA tracking columns
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['audit_nc_actions', 'nc_work_corrective_actions', 'customer_complaints'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS capa_owner_user_id uuid', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS capa_owner_name text', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS capa_due_on date', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS effectiveness_review_due_on date', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS effectiveness_outcome text', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS effectiveness_notes text', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS effectiveness_verified_on date', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS effectiveness_verified_by uuid', rel);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS effectiveness_verified_by_name text', rel);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', rel, rel || '_effectiveness_outcome_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (effectiveness_outcome IS NULL OR effectiveness_outcome IN (''effective'', ''not_effective''))',
      rel, rel || '_effectiveness_outcome_check');
  END LOOP;
END $$;

ALTER TABLE public.audit_nc_actions ADD COLUMN IF NOT EXISTS capa_closed_on date;
ALTER TABLE public.nc_work_corrective_actions ADD COLUMN IF NOT EXISTS capa_closed_on date;

ALTER TABLE public.customer_complaints
  ADD COLUMN IF NOT EXISTS nc_record_id uuid REFERENCES public.nc_work_records (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_complaints_nc
  ON public.customer_complaints (nc_record_id) WHERE nc_record_id IS NOT NULL;

ALTER TABLE public.nc_work_records
  ADD COLUMN IF NOT EXISTS sample_id uuid REFERENCES public.samples (id) ON DELETE SET NULL;
ALTER TABLE public.nc_work_records ADD COLUMN IF NOT EXISTS srf_number text;
CREATE INDEX IF NOT EXISTS idx_nc_work_records_sample
  ON public.nc_work_records (sample_id) WHERE sample_id IS NOT NULL;

COMMENT ON COLUMN public.nc_work_records.sample_id IS
  'Sample affected by this nonconforming work. While the NC is not Closed and has no resumption authorization, the sample''s test report cannot be issued (samples_issue_hold).';

-- Owner name and effectiveness verifier, stamped from the signed-in user.
CREATE OR REPLACE FUNCTION public.app_capa_tracking_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_changed boolean;
BEGIN
  NEW.capa_owner_name := nullif(btrim(NEW.capa_owner_name), '');
  IF NEW.capa_owner_user_id IS NOT NULL AND NEW.capa_owner_name IS NULL THEN
    NEW.capa_owner_name := public.app_profile_name(NEW.capa_owner_user_id);
  END IF;
  NEW.effectiveness_notes := nullif(btrim(NEW.effectiveness_notes), '');

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.effectiveness_outcome IS NOT NULL;
  ELSE
    v_changed := NEW.effectiveness_outcome IS DISTINCT FROM OLD.effectiveness_outcome
      OR NEW.effectiveness_notes IS DISTINCT FROM OLD.effectiveness_notes
      OR NEW.effectiveness_verified_on IS DISTINCT FROM OLD.effectiveness_verified_on;
  END IF;

  -- Scripts (no signed-in user) are left alone.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT v_changed THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.effectiveness_verified_by := OLD.effectiveness_verified_by;
      NEW.effectiveness_verified_by_name := OLD.effectiveness_verified_by_name;
    ELSE
      NEW.effectiveness_verified_by := NULL;
      NEW.effectiveness_verified_by_name := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.app_capa_can_verify() THEN
    RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can record the effectiveness review of a corrective action'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.effectiveness_outcome IS NULL THEN
    NEW.effectiveness_verified_on := NULL;
    NEW.effectiveness_verified_by := NULL;
    NEW.effectiveness_verified_by_name := NULL;
  ELSE
    NEW.effectiveness_verified_on := LEAST(coalesce(NEW.effectiveness_verified_on, current_date), current_date);
    NEW.effectiveness_verified_by := v_uid;
    NEW.effectiveness_verified_by_name := public.app_profile_name(v_uid);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.app_capa_tracking_stamp() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['audit_nc_actions', 'nc_work_corrective_actions', 'customer_complaints'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_capa_tracking_stamp', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.app_capa_tracking_stamp()',
      rel || '_capa_tracking_stamp', rel);
  END LOOP;
END $$;

-- NC <-> sample: either the sample or the SRF number is enough.
CREATE OR REPLACE FUNCTION public.nc_work_records_sample_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_srf text;
  v_id uuid;
BEGIN
  NEW.srf_number := nullif(btrim(NEW.srf_number), '');
  IF NEW.sample_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.sample_id IS DISTINCT FROM OLD.sample_id OR NEW.srf_number IS NULL) THEN
    SELECT s.srf_number INTO v_srf FROM public.samples s WHERE s.id = NEW.sample_id;
    NEW.srf_number := coalesce(nullif(btrim(v_srf), ''), NEW.srf_number);
  ELSIF NEW.sample_id IS NULL AND NEW.srf_number IS NOT NULL THEN
    SELECT s.id INTO v_id
      FROM public.samples s
     WHERE lower(btrim(s.srf_number)) = lower(NEW.srf_number)
       AND s.deleted_at IS NULL
     ORDER BY s.created_at DESC NULLS LAST
     LIMIT 1;
    NEW.sample_id := v_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.nc_work_records_sample_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS nc_work_records_sample_link ON public.nc_work_records;
CREATE TRIGGER nc_work_records_sample_link
  BEFORE INSERT OR UPDATE ON public.nc_work_records
  FOR EACH ROW EXECUTE FUNCTION public.nc_work_records_sample_link();

-- ---------------------------------------------------------------------------
-- 2. Report issue hold (7.10.1) and opinions (7.8.7) on samples
-- ---------------------------------------------------------------------------

ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issue_hold_override_reason text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issue_hold_override_by uuid;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issue_hold_override_by_name text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issue_hold_override_at timestamptz;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issue_hold_nc_refs text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS opinions_text text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS opinions_basis text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS opinions_by uuid;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS opinions_by_name text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS opinions_at timestamptz;

COMMENT ON COLUMN public.samples.issue_hold_override_reason IS
  'Laboratory Director''s reason for issuing the test report while a linked NC was open (set in the issue UPDATE).';
COMMENT ON COLUMN public.samples.opinions_text IS
  'Opinions and interpretations (ISO/IEC 17025 7.8.7), printed in Part C of the test report.';
COMMENT ON COLUMN public.samples.opinions_basis IS
  'Basis on which the opinions and interpretations were made (7.8.7.1).';

-- NC records that hold the issue of this sample's test report.
CREATE OR REPLACE FUNCTION public.app_sample_open_nc_refs(p_sample uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT string_agg(r.nc_id, ', ' ORDER BY r.nc_id)
    FROM public.nc_work_records r
   WHERE r.sample_id = p_sample
     AND r.deleted_at IS NULL
     AND r.status IS DISTINCT FROM 'Closed'
     AND r.resumption_authorized_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.app_sample_open_nc_refs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sample_open_nc_refs(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.samples_issue_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_refs text;
  v_reason text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A copy (amendment) starts without an override; its own issue is checked again.
    NEW.issue_hold_override_reason := NULL;
    NEW.issue_hold_override_by := NULL;
    NEW.issue_hold_override_by_name := NULL;
    NEW.issue_hold_override_at := NULL;
    NEW.issue_hold_nc_refs := NULL;
    RETURN NEW;
  END IF;

  IF NEW.stage IS NOT DISTINCT FROM 'completed' AND OLD.stage IS DISTINCT FROM 'completed' THEN
    -- This UPDATE issues the test report.
    v_refs := public.app_sample_open_nc_refs(NEW.id);
    v_reason := nullif(btrim(NEW.issue_hold_override_reason), '');
    IF v_refs IS NULL THEN
      NEW.issue_hold_override_reason := NULL;
      NEW.issue_hold_override_by := NULL;
      NEW.issue_hold_override_by_name := NULL;
      NEW.issue_hold_override_at := NULL;
      NEW.issue_hold_nc_refs := NULL;
      RETURN NEW;
    END IF;
    IF v_uid IS NULL THEN
      -- Scripts: allowed, the open NCs are recorded.
      NEW.issue_hold_nc_refs := v_refs;
      RETURN NEW;
    END IF;
    IF v_reason IS NULL OR NOT public.app_is_laboratory_director() THEN
      RAISE EXCEPTION 'Report issue is on hold: open nonconforming work % is linked to this sample. Close the NC or record the resumption authorization; only the Laboratory Director can override, with a reason.', v_refs
        USING ERRCODE = '42501', HINT = 'issue_hold';
    END IF;
    NEW.issue_hold_override_reason := v_reason;
    NEW.issue_hold_override_by := v_uid;
    NEW.issue_hold_override_by_name := public.app_profile_name(v_uid);
    NEW.issue_hold_override_at := now();
    NEW.issue_hold_nc_refs := v_refs;
    RETURN NEW;
  END IF;

  -- Any other change: the override record is written only by the issue itself.
  IF v_uid IS NOT NULL THEN
    NEW.issue_hold_override_reason := OLD.issue_hold_override_reason;
    NEW.issue_hold_override_by := OLD.issue_hold_override_by;
    NEW.issue_hold_override_by_name := OLD.issue_hold_override_by_name;
    NEW.issue_hold_override_at := OLD.issue_hold_override_at;
    NEW.issue_hold_nc_refs := OLD.issue_hold_nc_refs;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.samples_issue_hold() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS samples_issue_hold ON public.samples;
CREATE TRIGGER samples_issue_hold
  BEFORE INSERT OR UPDATE ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.samples_issue_hold();

CREATE OR REPLACE FUNCTION public.samples_opinions_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check jsonb;
BEGIN
  NEW.opinions_text := nullif(btrim(NEW.opinions_text), '');
  NEW.opinions_basis := nullif(btrim(NEW.opinions_basis), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW.opinions_text IS NULL AND NEW.opinions_basis IS NULL THEN
      NEW.opinions_by := NULL;
      NEW.opinions_by_name := NULL;
      NEW.opinions_at := NULL;
    ELSIF NEW.opinions_by IS NULL OR NEW.opinions_at IS NULL OR NEW.opinions_at > now() THEN
      -- New text: the author is whoever is signed in. (A copied record keeps its author.)
      NEW.opinions_by := coalesce(v_uid, NEW.opinions_by);
      NEW.opinions_by_name := CASE WHEN v_uid IS NOT NULL THEN public.app_profile_name(v_uid) ELSE NEW.opinions_by_name END;
      NEW.opinions_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.opinions_text IS NOT DISTINCT FROM OLD.opinions_text
     AND NEW.opinions_basis IS NOT DISTINCT FROM OLD.opinions_basis THEN
    IF v_uid IS NOT NULL THEN
      NEW.opinions_by := OLD.opinions_by;
      NEW.opinions_by_name := OLD.opinions_by_name;
      NEW.opinions_at := OLD.opinions_at;
    END IF;
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.opinions_text IS NULL AND NEW.opinions_basis IS NULL THEN
    NEW.opinions_by := NULL;
    NEW.opinions_by_name := NULL;
    NEW.opinions_at := NULL;
    RETURN NEW;
  END IF;

  -- Authorization Matrix (7.8.7.1, 6.2.6): when it is in use for opinions,
  -- only an authorized person or the Laboratory Director may write them.
  IF to_regprocedure('public.app_authorization_check(uuid, text, uuid[], uuid[], date)') IS NOT NULL
     AND NOT public.app_is_laboratory_director() THEN
    EXECUTE 'SELECT public.app_authorization_check($1, ''give_opinion'', ''{}''::uuid[], ''{}''::uuid[], current_date)'
      INTO v_check USING v_uid;
    IF coalesce((v_check ->> 'enforced')::boolean, false)
       AND NOT coalesce((v_check ->> 'authorized')::boolean, false) THEN
      RAISE EXCEPTION 'You are not on the Authorization Matrix to give opinions and interpretations'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.opinions_by := v_uid;
  NEW.opinions_by_name := public.app_profile_name(v_uid);
  NEW.opinions_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.samples_opinions_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS samples_opinions_stamp ON public.samples;
CREATE TRIGGER samples_opinions_stamp
  BEFORE INSERT OR UPDATE ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.samples_opinions_stamp();

-- ---------------------------------------------------------------------------
-- 3. Who entered each result (7.5.1)
-- ---------------------------------------------------------------------------

ALTER TABLE public.test_allocation_parameters ADD COLUMN IF NOT EXISTS entered_by uuid;
ALTER TABLE public.test_allocation_parameters ADD COLUMN IF NOT EXISTS entered_by_name text;
ALTER TABLE public.test_allocation_parameters ADD COLUMN IF NOT EXISTS entered_at timestamptz;

COMMENT ON COLUMN public.test_allocation_parameters.entered_by IS
  'Who last entered / changed results (set by trigger tap_stamp_result_entry).';

CREATE OR REPLACE FUNCTION public.tap_stamp_result_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF nullif(btrim(NEW.results), '') IS NULL THEN
      NEW.entered_by := NULL;
      NEW.entered_by_name := NULL;
      NEW.entered_at := NULL;
    ELSIF NEW.entered_by IS NOT NULL AND NEW.entered_at IS NOT NULL AND NEW.entered_at <= now() THEN
      -- Copied observation (report amendment): keeps who entered it.
      NEW.entered_by_name := coalesce(nullif(btrim(NEW.entered_by_name), ''), public.app_profile_name(NEW.entered_by));
    ELSIF v_uid IS NOT NULL THEN
      NEW.entered_by := v_uid;
      NEW.entered_by_name := public.app_profile_name(v_uid);
      NEW.entered_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.results IS DISTINCT FROM OLD.results THEN
    IF v_uid IS NOT NULL THEN
      NEW.entered_by := v_uid;
      NEW.entered_by_name := public.app_profile_name(v_uid);
      NEW.entered_at := now();
    END IF;
  ELSIF v_uid IS NOT NULL THEN
    NEW.entered_by := OLD.entered_by;
    NEW.entered_by_name := OLD.entered_by_name;
    NEW.entered_at := OLD.entered_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tap_stamp_result_entry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tap_stamp_result_entry ON public.test_allocation_parameters;
CREATE TRIGGER tap_stamp_result_entry
  BEFORE INSERT OR UPDATE ON public.test_allocation_parameters
  FOR EACH ROW EXECUTE FUNCTION public.tap_stamp_result_entry();

-- ---------------------------------------------------------------------------
-- 4. Raw data attachments per result (7.5.1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.result_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_allocation_parameter_id uuid NOT NULL
    REFERENCES public.test_allocation_parameters (id) ON DELETE CASCADE,
  sample_id uuid REFERENCES public.samples (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  caption text,
  uploaded_by uuid DEFAULT auth.uid(),
  uploaded_by_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT result_attachments_path_key UNIQUE (storage_path),
  CONSTRAINT result_attachments_name_check CHECK (btrim(file_name) <> ''),
  CONSTRAINT result_attachments_size_check CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_result_attachments_param
  ON public.result_attachments (test_allocation_parameter_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_result_attachments_sample
  ON public.result_attachments (sample_id);

CREATE OR REPLACE FUNCTION public.result_attachments_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sample uuid;
  v_stage text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF v_uid IS NOT NULL AND (
      NEW.test_allocation_parameter_id IS DISTINCT FROM OLD.test_allocation_parameter_id
      OR NEW.sample_id IS DISTINCT FROM OLD.sample_id
      OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
      OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
      OR NEW.uploaded_by_name IS DISTINCT FROM OLD.uploaded_by_name
      OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
    ) THEN
      RAISE EXCEPTION 'Only the caption of a result attachment can be changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT ta.sample_id, s.stage INTO v_sample, v_stage
    FROM public.test_allocation_parameters p
    JOIN public.test_allocations ta ON ta.id = p.test_allocation_id
    LEFT JOIN public.samples s ON s.id = ta.sample_id
   WHERE p.id = NEW.test_allocation_parameter_id;
  NEW.sample_id := v_sample;
  NEW.file_name := btrim(NEW.file_name);
  IF v_uid IS NOT NULL THEN
    IF v_sample IS NULL THEN
      RAISE EXCEPTION 'Result row not found' USING ERRCODE = '23503';
    END IF;
    IF NEW.storage_path NOT LIKE v_sample::text || '/' || NEW.test_allocation_parameter_id::text || '/%' THEN
      RAISE EXCEPTION 'Attachment path must start with <sample id>/<result id>/' USING ERRCODE = '22023';
    END IF;
    IF v_stage IS NOT DISTINCT FROM 'completed' AND NOT public.app_is_laboratory_director() THEN
      RAISE EXCEPTION 'The test report is issued: attachments can only be added by the Laboratory Director'
        USING ERRCODE = '42501';
    END IF;
    NEW.uploaded_by := v_uid;
    NEW.uploaded_by_name := public.app_profile_name(v_uid);
    NEW.uploaded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.result_attachments_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_result_attachments_before_write ON public.result_attachments;
CREATE TRIGGER trg_result_attachments_before_write
  BEFORE INSERT OR UPDATE ON public.result_attachments
  FOR EACH ROW EXECUTE FUNCTION public.result_attachments_before_write();

-- May the signed-in user remove this attachment?
CREATE OR REPLACE FUNCTION public.app_result_attachment_can_delete(p_uploaded_by uuid, p_sample uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_is_laboratory_director()
    OR (
      p_uploaded_by = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.samples s WHERE s.id = p_sample AND s.stage = 'completed')
    );
$$;

REVOKE ALL ON FUNCTION public.app_result_attachment_can_delete(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_result_attachment_can_delete(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Sample custody log (7.4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sample_custody_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples (id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  handed_by uuid,
  handed_by_name text,
  received_by uuid,
  received_by_name text,
  received_at timestamptz,
  at timestamptz NOT NULL DEFAULT now(),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sample_custody_log_sample
  ON public.sample_custody_log (sample_id, at);

CREATE OR REPLACE FUNCTION public.samples_custody_log_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.sample_custody_log (sample_id, from_stage, to_stage, handed_by, handed_by_name, at)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage END,
    coalesce(NEW.stage, 'receiving'),
    v_uid,
    CASE WHEN v_uid IS NOT NULL THEN public.app_profile_name(v_uid) END,
    now()
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.samples_custody_log_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS samples_custody_log ON public.samples;
CREATE TRIGGER samples_custody_log
  AFTER INSERT OR UPDATE OF stage ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.samples_custody_log_write();

-- Receipt acknowledgement: once, by the signed-in user; remarks with it.
CREATE OR REPLACE FUNCTION public.sample_custody_log_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.received_by IS NOT NULL THEN
    RAISE EXCEPTION 'This hand-over has already been acknowledged' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['received_by', 'received_by_name', 'received_at', 'remarks'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['received_by', 'received_by_name', 'received_at', 'remarks']) THEN
    RAISE EXCEPTION 'Custody log entries cannot be changed' USING ERRCODE = '42501';
  END IF;
  NEW.received_by := v_uid;
  NEW.received_by_name := public.app_profile_name(v_uid);
  NEW.received_at := now();
  NEW.remarks := nullif(btrim(NEW.remarks), '');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sample_custody_log_before_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sample_custody_log_before_update ON public.sample_custody_log;
CREATE TRIGGER trg_sample_custody_log_before_update
  BEFORE UPDATE ON public.sample_custody_log
  FOR EACH ROW EXECUTE FUNCTION public.sample_custody_log_before_update();

-- ---------------------------------------------------------------------------
-- 6. Row level security and grants for the new tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.result_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_custody_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS result_attachments_select ON public.result_attachments;
CREATE POLICY result_attachments_select ON public.result_attachments
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS result_attachments_insert ON public.result_attachments;
CREATE POLICY result_attachments_insert ON public.result_attachments
  FOR INSERT TO authenticated WITH CHECK (public.app_is_known_staff());
DROP POLICY IF EXISTS result_attachments_update ON public.result_attachments;
CREATE POLICY result_attachments_update ON public.result_attachments
  FOR UPDATE TO authenticated
  USING (public.app_result_attachment_can_delete(uploaded_by, sample_id))
  WITH CHECK (public.app_result_attachment_can_delete(uploaded_by, sample_id));
DROP POLICY IF EXISTS result_attachments_delete ON public.result_attachments;
CREATE POLICY result_attachments_delete ON public.result_attachments
  FOR DELETE TO authenticated USING (public.app_result_attachment_can_delete(uploaded_by, sample_id));

DROP POLICY IF EXISTS sample_custody_log_select ON public.sample_custody_log;
CREATE POLICY sample_custody_log_select ON public.sample_custody_log
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS sample_custody_log_update ON public.sample_custody_log;
CREATE POLICY sample_custody_log_update ON public.sample_custody_log
  FOR UPDATE TO authenticated
  USING (public.app_is_known_staff() AND received_by IS NULL)
  WITH CHECK (public.app_is_known_staff());

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['result_attachments', 'sample_custody_log'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', rel);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
  END LOOP;
END $$;

GRANT SELECT, INSERT, DELETE ON public.result_attachments TO authenticated;
GRANT UPDATE (caption) ON public.result_attachments TO authenticated;
GRANT SELECT ON public.sample_custody_log TO authenticated;
GRANT UPDATE (received_by, received_by_name, received_at, remarks) ON public.sample_custody_log TO authenticated;

-- Audit trail (7.5). Recreated so a re-run keeps one trigger.
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: result_attachments / sample_custody_log are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['result_attachments', 'sample_custody_log'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Storage bucket for raw printouts / photos
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema missing; result-attachments bucket skipped.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'result-attachments',
    'result-attachments',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
      'text/csv',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS lims_result_attachments_select ON storage.objects;
  CREATE POLICY lims_result_attachments_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'result-attachments' AND public.app_is_known_staff());

  DROP POLICY IF EXISTS lims_result_attachments_insert ON storage.objects;
  CREATE POLICY lims_result_attachments_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'result-attachments' AND public.app_is_known_staff());

  -- Files of an issued report stay, except for the Laboratory Director.
  DROP POLICY IF EXISTS lims_result_attachments_delete ON storage.objects;
  CREATE POLICY lims_result_attachments_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'result-attachments'
      AND public.app_is_known_staff()
      AND (
        public.app_is_laboratory_director()
        OR NOT EXISTS (
          SELECT 1
          FROM public.result_attachments ra
          JOIN public.samples s ON s.id = ra.sample_id
          WHERE ra.storage_path = storage.objects.name
            AND (s.stage = 'completed' OR ra.uploaded_by IS DISTINCT FROM auth.uid())
        )
      )
    );
END $$;

-- ---------------------------------------------------------------------------
-- 8. Unified CAPA register (8.7)
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.capa_register_v;
CREATE VIEW public.capa_register_v WITH (security_invoker = true) AS
WITH base AS (
  -- Internal / external audit nonconformities.
  SELECT
    'audit'::text AS source,
    ci.id AS source_id,
    'audit_nc_actions'::text AS action_table,
    a.id AS action_id,
    (coalesce(nullif(btrim(ap.audit_id), ''), 'Audit') || ' · Cl ' || ci.clause_no)::text AS ref,
    coalesce(nullif(btrim(ci.non_conformity), ''), nullif(btrim(ci.remark), ''), ci.clause_matter)::text AS description,
    (CASE WHEN ap.audit_type = 'external' THEN 'External audit' ELSE 'Internal audit' END)::text AS origin,
    ci.created_at AS raised_at,
    a.capa_owner_user_id AS owner_user_id,
    a.capa_owner_name AS owner_name,
    a.capa_due_on AS due_on,
    (CASE
      WHEN a.capa_closed_on IS NOT NULL OR nullif(btrim(a.verification_closure), '') IS NOT NULL THEN 'closed'
      WHEN a.id IS NOT NULL AND (btrim(a.immediate_correction) <> '' OR btrim(a.root_cause_analysis) <> ''
                                 OR btrim(a.corrective_action_plan) <> '') THEN 'in_progress'
      ELSE 'open'
    END)::text AS status,
    a.capa_closed_on AS closed_on,
    a.effectiveness_review_due_on,
    a.effectiveness_outcome,
    a.effectiveness_verified_on,
    a.effectiveness_verified_by_name,
    NULL::uuid AS nc_record_id,
    NULL::uuid AS sample_id
  FROM public.audit_checklist_items ci
  JOIN public.audit_plans ap ON ap.id = ci.audit_plan_id AND ap.deleted_at IS NULL
  LEFT JOIN public.audit_nc_actions a ON a.checklist_item_id = ci.id AND a.deleted_at IS NULL
  WHERE ci.conformity = 'no' AND ci.deleted_at IS NULL

  UNION ALL

  -- Nonconforming work records (7.10) that need or have a corrective action,
  -- or came from a complaint / PT result / environmental excursion.
  SELECT
    'ncw',
    r.id,
    'nc_work_corrective_actions',
    a.id,
    r.nc_id,
    r.description,
    coalesce(o.origin, r.source_area),
    r.detected_at,
    a.capa_owner_user_id,
    a.capa_owner_name,
    a.capa_due_on,
    CASE
      WHEN a.capa_closed_on IS NOT NULL OR nullif(btrim(a.verification_closure), '') IS NOT NULL THEN 'closed'
      WHEN r.status = 'Closed' AND NOT r.corrective_action_required THEN 'closed'
      WHEN (a.id IS NOT NULL AND (btrim(a.immediate_correction) <> '' OR btrim(a.root_cause_analysis) <> ''
                                  OR btrim(a.corrective_action_plan) <> ''))
           OR r.status IN ('Under Evaluation', 'Decision Pending') THEN 'in_progress'
      ELSE 'open'
    END,
    a.capa_closed_on,
    a.effectiveness_review_due_on,
    a.effectiveness_outcome,
    a.effectiveness_verified_on,
    a.effectiveness_verified_by_name,
    r.id,
    r.sample_id
  FROM public.nc_work_records r
  LEFT JOIN public.nc_work_corrective_actions a ON a.nc_work_record_id = r.id AND a.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT string_agg(x.label, '; ' ORDER BY x.label) AS origin
    FROM (
      SELECT 'Complaint ' || cc.complaint_id AS label
        FROM public.customer_complaints cc
       WHERE cc.nc_record_id = r.id AND cc.deleted_at IS NULL
      UNION
      SELECT 'PT ' || coalesce(nullif(btrim(pt.round_code), ''), nullif(btrim(pt.scheme_name), ''), pt.parameter)
        FROM public.pt_participations pt
       WHERE pt.nc_record_id = r.id
      UNION
      SELECT 'Environment ' || coalesce(la.code, '')
        FROM public.environment_readings er
        LEFT JOIN public.lab_areas la ON la.id = er.area_id
       WHERE er.nc_record_id = r.id
    ) x
  ) o ON true
  WHERE r.deleted_at IS NULL
    AND (r.corrective_action_required OR r.status = 'CAPA Required' OR a.id IS NOT NULL OR o.origin IS NOT NULL)

  UNION ALL

  -- Complaints (7.9) handled on the complaint itself (no NC raised).
  SELECT
    'complaint',
    cc.id,
    'customer_complaints',
    cc.id,
    cc.complaint_id,
    cc.description,
    coalesce(nullif(btrim(cc.complainant_org), ''), cc.complainant_name),
    cc.received_at,
    coalesce(cc.capa_owner_user_id, cc.reviewed_by_employee_id),
    coalesce(cc.capa_owner_name, cc.reviewed_by_name),
    cc.capa_due_on,
    CASE
      WHEN cc.closed_at IS NOT NULL OR cc.status IN ('Closed', 'Not Related') THEN 'closed'
      WHEN cc.status IN ('Under Investigation', 'Decision Pending') THEN 'in_progress'
      ELSE 'open'
    END,
    cc.closed_at::date,
    cc.effectiveness_review_due_on,
    cc.effectiveness_outcome,
    cc.effectiveness_verified_on,
    cc.effectiveness_verified_by_name,
    NULL::uuid,
    NULL::uuid
  FROM public.customer_complaints cc
  WHERE cc.nc_record_id IS NULL AND cc.deleted_at IS NULL

  UNION ALL

  -- Unsatisfactory PT results (7.7.3) still waiting for an NC.
  SELECT
    'pt',
    pt.id,
    'pt_participations',
    NULL::uuid,
    coalesce(nullif(btrim(pt.scheme_name), ''), 'PT') || coalesce(' ' || nullif(btrim(pt.round_code), ''), ''),
    'Unsatisfactory PT result: ' || pt.parameter,
    coalesce(pt.provider_name, 'Proficiency testing'),
    coalesce(pt.reported_on::timestamptz, pt.created_at),
    pt.analyst_user_id,
    pt.analyst_name,
    NULL::date,
    CASE WHEN pt.status = 'closed' THEN 'closed' ELSE 'open' END,
    NULL::date,
    NULL::date,
    NULL::text,
    NULL::date,
    NULL::text,
    NULL::uuid,
    NULL::uuid
  FROM public.pt_participations pt
  WHERE pt.performance = 'unsatisfactory' AND pt.nc_record_id IS NULL

  UNION ALL

  -- Management review actions (8.9.3).
  SELECT
    'mrm',
    m.id,
    'mrm_actions',
    m.id,
    coalesce(mt.meeting_no, 'MRM') || ' #' || (m.sort_order + 1)::text,
    m.action,
    'Management review' || CASE WHEN btrim(m.capa_ref) <> '' THEN ' (CAPA ' || btrim(m.capa_ref) || ')' ELSE '' END,
    coalesce(mt.held_on::timestamptz, m.created_at),
    m.owner_user_id,
    nullif(btrim(m.owner_name), ''),
    m.due_on,
    CASE WHEN m.status = 'done' THEN 'closed' ELSE 'open' END,
    m.closed_on,
    NULL::date,
    NULL::text,
    NULL::date,
    NULL::text,
    NULL::uuid,
    NULL::uuid
  FROM public.mrm_actions m
  LEFT JOIN public.mrm_meetings mt ON mt.id = m.meeting_id
)
SELECT
  b.source,
  b.source_id,
  b.action_table,
  b.action_id,
  b.ref,
  b.description,
  b.origin,
  b.raised_at,
  b.owner_user_id,
  b.owner_name,
  b.due_on,
  b.status,
  b.closed_on,
  (b.status <> 'closed' AND b.due_on IS NOT NULL AND b.due_on < current_date) AS overdue,
  b.effectiveness_review_due_on,
  b.effectiveness_outcome,
  b.effectiveness_verified_on,
  b.effectiveness_verified_by_name,
  (b.effectiveness_outcome IS NOT NULL) AS effectiveness_done,
  (b.status = 'closed' AND b.effectiveness_outcome IS NULL
    AND b.effectiveness_review_due_on IS NOT NULL AND b.effectiveness_review_due_on < current_date) AS effectiveness_overdue,
  b.nc_record_id,
  b.sample_id
FROM base b;

COMMENT ON VIEW public.capa_register_v IS
  'Unified corrective action register (ISO/IEC 17025 8.7): audit NCs, NC work, complaints, PT, management review. Row level security of the source tables applies (security_invoker).';

REVOKE ALL ON public.capa_register_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.capa_register_v TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Module access (20261029100200): result attachments and the custody log
-- belong to the sample-handling family: every sample stage screen shows them
-- (SRF view dialog, result entry) and any sample stage editor may write, like
-- samples itself. capa_register_v is a security_invoker view: the module
-- access policies of its source tables apply. Skipped before 20261029100200.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_installed int;
BEGIN
  IF to_regclass('public.module_table_map') IS NULL
     OR to_regprocedure('public.app_module_access_install()') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.module_table_map WHERE source = 'seed:20261029100300';
  INSERT INTO public.module_table_map (table_name, module_path, write_requires, read_requires, source, note)
  SELECT t, p, w, 'view', 'seed:20261029100300', n
  FROM unnest(ARRAY['result_attachments', 'sample_custody_log']) AS t,
  (VALUES
    ('/samples/receiving', 'edit', 'sample handling stages'),
    ('/samples/allocation', 'edit', 'sample handling stages'),
    ('/samples/test-allocation', 'edit', 'sample handling stages'),
    ('/samples/under-testing', 'edit', 'sample handling stages'),
    ('/samples/results-review', 'edit', 'sample handling stages'),
    ('/samples/report-preparation', 'edit', 'sample handling stages'),
    ('/samples/completed', 'edit', 'sample handling stages'),
    ('/samples/retain-disposed', 'edit', 'sample handling stages')
  ) AS v(p, w, n)
  ON CONFLICT (table_name, module_path) DO NOTHING;
  SELECT count(*) INTO v_installed FROM public.app_module_access_install() WHERE status = 'installed';
  RAISE NOTICE 'module access re-installed on % tables', v_installed;
END $$;

NOTIFY pgrst, 'reload schema';
