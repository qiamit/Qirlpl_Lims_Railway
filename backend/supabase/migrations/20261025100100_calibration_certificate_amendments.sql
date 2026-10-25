-- ISO/IEC 17025 gap P1-12b: amendments to issued calibration certificates
-- (clause 7.8.8). NOT applied automatically. Apply on Railway Postgres only
-- when Amit asks. Safe to run more than once. Until it is applied the
-- frontend behaves as before (no Amend action, no history).
--
-- How a calibration certificate is issued: Certificate Preparation saves the
-- certificate header in calibration_jobs.certificate_draft (certificateNumber,
-- ulrNumber, issueDate, ...) and "Issue & Forward" moves the job to
-- stage = 'certificates'. Nothing stopped later edits before this migration.
--
-- What it adds:
--   * Guard: once a job is at stage 'certificates' nobody can change the job
--     row (certificate_draft, stage, result-related fields) or delete it, and
--     its raw data sheet (calibration result data) cannot be inserted, changed
--     or deleted. The only way back into editing is start_certificate_amendment().
--     Exception: back-filling equipment_master_id from NULL (done silently when
--     an old job is viewed). Scripts without a signed-in user (service role,
--     psql) are not blocked.
--   * calibration_certificate_amendments: one row per amendment. The original
--     certificate (draft, key job fields, raw data sheet) is copied into
--     original_snapshot, which can never be changed. Rows are written only by
--     the functions below; staff can read them.
--   * start_certificate_amendment(job, type, reason): snapshots the issued
--     certificate, opens the amendment, puts the job back at Certificate
--     Preparation and pre-sets the new certificate number
--     "<original>/A<n>" (Revised: /R<n>, Supplementary: /S<n>, the same letters
--     the testing side uses for amended / revised / supplementary reports).
--     Allowed for the Laboratory Director, the Quality Manager and Technical
--     Managers (the testing side lets only the Director / QM reopen an issued
--     report; Technical Managers are added because they sign calibration work).
--   * issue_certificate_amendment(amendment): issues the amended certificate
--     (job back to 'certificates') and records approved_by / approved_at.
--   * cancel_certificate_amendment(amendment): withdraws an amendment that was
--     opened by mistake and restores the original certificate, only while the
--     result data is unchanged.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Amendment register
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.calibration_certificate_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_job_id uuid NOT NULL
    REFERENCES public.calibration_jobs (id) ON DELETE RESTRICT,
  original_certificate_number text NOT NULL,
  original_ulr text,
  original_issued_at timestamptz,
  original_issue_date date,
  amendment_type text NOT NULL,
  amendment_no integer NOT NULL,
  reason text NOT NULL,
  new_certificate_number text NOT NULL,
  requested_by uuid DEFAULT auth.uid(),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  original_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calibration_certificate_amendments_type_chk
    CHECK (amendment_type IN ('amendment', 'revised', 'supplementary')),
  CONSTRAINT calibration_certificate_amendments_status_chk
    CHECK (status IN ('open', 'issued', 'cancelled')),
  CONSTRAINT calibration_certificate_amendments_reason_chk
    CHECK (length(btrim(reason)) > 0),
  CONSTRAINT calibration_certificate_amendments_no_chk
    CHECK (amendment_no >= 1),
  CONSTRAINT calibration_certificate_amendments_snapshot_chk
    CHECK (jsonb_typeof(original_snapshot) = 'object'),
  CONSTRAINT calibration_certificate_amendments_issued_chk
    CHECK (status <> 'issued' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT calibration_certificate_amendments_job_no_key
    UNIQUE (calibration_job_id, amendment_no)
);

COMMENT ON TABLE public.calibration_certificate_amendments IS
  'Amendments / revisions / supplements to issued calibration certificates (ISO/IEC 17025 7.8.8). original_snapshot is the certificate as issued before the change and cannot be modified.';

-- At most one amendment in progress per job.
CREATE UNIQUE INDEX IF NOT EXISTS calibration_certificate_amendments_one_open
  ON public.calibration_certificate_amendments (calibration_job_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS calibration_certificate_amendments_job_idx
  ON public.calibration_certificate_amendments (calibration_job_id, amendment_no DESC);

-- Append-only: identity, original and reason never change; status only moves
-- open -> issued | cancelled; rows are never deleted.
CREATE OR REPLACE FUNCTION public.guard_calibration_certificate_amendment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Calibration certificate amendments cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.calibration_job_id IS DISTINCT FROM OLD.calibration_job_id
     OR NEW.original_certificate_number IS DISTINCT FROM OLD.original_certificate_number
     OR NEW.original_ulr IS DISTINCT FROM OLD.original_ulr
     OR NEW.original_issued_at IS DISTINCT FROM OLD.original_issued_at
     OR NEW.original_issue_date IS DISTINCT FROM OLD.original_issue_date
     OR NEW.amendment_type IS DISTINCT FROM OLD.amendment_type
     OR NEW.amendment_no IS DISTINCT FROM OLD.amendment_no
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.original_snapshot IS DISTINCT FROM OLD.original_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'The original certificate and reason of an amendment cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'This amendment is already %', OLD.status
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calibration_certificate_amendments_guard
  ON public.calibration_certificate_amendments;
CREATE TRIGGER calibration_certificate_amendments_guard
  BEFORE UPDATE OR DELETE ON public.calibration_certificate_amendments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_calibration_certificate_amendment();

DROP TRIGGER IF EXISTS calibration_certificate_amendments_no_truncate
  ON public.calibration_certificate_amendments;
CREATE TRIGGER calibration_certificate_amendments_no_truncate
  BEFORE TRUNCATE ON public.calibration_certificate_amendments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.guard_calibration_certificate_amendment();

ALTER TABLE public.calibration_certificate_amendments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calibration_certificate_amendments_select
  ON public.calibration_certificate_amendments;
CREATE POLICY calibration_certificate_amendments_select
  ON public.calibration_certificate_amendments
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_known_staff()));

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    DROP POLICY IF EXISTS lims_known_staff_only ON public.calibration_certificate_amendments;
    CREATE POLICY lims_known_staff_only ON public.calibration_certificate_amendments
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.app_is_known_staff())
      WITH CHECK (public.app_is_known_staff());
  END IF;
END $$;

-- Writes go through the SECURITY DEFINER functions below only.
REVOKE ALL ON public.calibration_certificate_amendments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.calibration_certificate_amendments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.calibration_certificate_amendments TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS calibration_certificate_amendments_audit_log
      ON public.calibration_certificate_amendments;
    CREATE TRIGGER calibration_certificate_amendments_audit_log
      AFTER INSERT OR UPDATE ON public.calibration_certificate_amendments
      FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Freeze issued certificates
-- ---------------------------------------------------------------------------

-- True while one of the amendment functions below is changing this job.
CREATE OR REPLACE FUNCTION public.calibration_amendment_in_progress(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_job_id IS NOT NULL
     AND COALESCE(current_setting('app.calibration_certificate_amendment', true), '')
         = p_job_id::text;
$$;

REVOKE ALL ON FUNCTION public.calibration_amendment_in_progress(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_issued_calibration_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  -- Maintenance scripts without a signed-in user are not blocked.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.stage = 'certificates' THEN
      RAISE EXCEPTION 'An issued calibration certificate cannot be deleted'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF public.calibration_amendment_in_progress(OLD.id) THEN
    RETURN NEW;
  END IF;

  IF OLD.stage = 'certificates' THEN
    v_old := to_jsonb(OLD) - 'updated_at';
    v_new := to_jsonb(NEW) - 'updated_at';
    -- Back-fill of the equipment link for older jobs (no effect on results).
    IF v_old -> 'equipment_master_id' = 'null'::jsonb THEN
      v_old := v_old - 'equipment_master_id';
      v_new := v_new - 'equipment_master_id';
    END IF;
    IF v_new IS DISTINCT FROM v_old THEN
      RAISE EXCEPTION 'This calibration certificate has been issued. Use "Amend certificate" to change it (ISO/IEC 17025 7.8.8).'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- An amendment in progress is issued through issue_certificate_amendment().
  IF NEW.stage = 'certificates' AND OLD.stage IS DISTINCT FROM 'certificates' AND EXISTS (
    SELECT 1 FROM public.calibration_certificate_amendments a
     WHERE a.calibration_job_id = OLD.id AND a.status = 'open'
  ) THEN
    RAISE EXCEPTION 'This job has an open certificate amendment. Issue it with "Issue amendment".'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_issued_calibration_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calibration_jobs_guard_issued ON public.calibration_jobs;
CREATE TRIGGER calibration_jobs_guard_issued
  BEFORE UPDATE OR DELETE ON public.calibration_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_issued_calibration_job();

CREATE OR REPLACE FUNCTION public.guard_issued_calibration_raw_data_sheet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM public.calibration_jobs j
     WHERE j.id = OLD.calibration_job_id AND j.stage = 'certificates'
  ) THEN
    RAISE EXCEPTION 'The calibration certificate for this raw data sheet has been issued. Use "Amend certificate" to change it.'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM public.calibration_jobs j
     WHERE j.id = NEW.calibration_job_id AND j.stage = 'certificates'
  ) THEN
    RAISE EXCEPTION 'The calibration certificate for this raw data sheet has been issued. Use "Amend certificate" to change it.'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_issued_calibration_raw_data_sheet() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calibration_raw_data_sheets_guard_issued
  ON public.calibration_raw_data_sheets;
CREATE TRIGGER calibration_raw_data_sheets_guard_issued
  BEFORE INSERT OR UPDATE OR DELETE ON public.calibration_raw_data_sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_issued_calibration_raw_data_sheet();

-- ---------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------

-- Who may reopen an issued calibration certificate.
CREATE OR REPLACE FUNCTION public.app_can_amend_calibration_certificate()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_is_laboratory_director()
      OR public.app_is_quality_manager()
      OR EXISTS (
        SELECT 1 FROM public.user_profiles up
         WHERE up.id = auth.uid()
           AND lower(btrim(coalesce(up.designation, ''))) = 'technical manager'
           AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
      );
$$;

REVOKE ALL ON FUNCTION public.app_can_amend_calibration_certificate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_can_amend_calibration_certificate() TO authenticated;

-- "<root>/A<n>" where root is the first-issue number (earlier /A1, /R2, /S3 removed).
CREATE OR REPLACE FUNCTION public.calibration_amended_certificate_number(
  p_original text,
  p_type text,
  p_no integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(btrim(p_original), '/[ARS][0-9]+$', '')
      || '/'
      || CASE p_type WHEN 'revised' THEN 'R' WHEN 'supplementary' THEN 'S' ELSE 'A' END
      || p_no::text;
$$;

GRANT EXECUTE ON FUNCTION public.calibration_amended_certificate_number(text, text, integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_certificate_amendment(
  p_job_id uuid,
  p_type text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text := lower(btrim(COALESCE(p_type, '')));
  v_reason text := btrim(COALESCE(p_reason, ''));
  j public.calibration_jobs;
  v_sheet jsonb;
  v_orig_no text;
  v_orig_ulr text;
  v_orig_date date;
  v_no integer;
  v_new_no text;
  v_id uuid := gen_random_uuid();
  v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.app_can_amend_calibration_certificate() THEN
    RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can amend an issued certificate'
      USING ERRCODE = '42501';
  END IF;
  IF v_type NOT IN ('amendment', 'revised', 'supplementary') THEN
    RAISE EXCEPTION 'Amendment type must be amendment, revised or supplementary'
      USING ERRCODE = '22023';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A reason for the amendment is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO j FROM public.calibration_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calibration job not found' USING ERRCODE = 'P0002';
  END IF;
  IF j.stage IS DISTINCT FROM 'certificates' THEN
    RAISE EXCEPTION 'Only an issued certificate can be amended' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.calibration_certificate_amendments
     WHERE calibration_job_id = j.id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'This certificate already has an amendment in progress' USING ERRCODE = '22023';
  END IF;

  v_orig_no := nullif(btrim(COALESCE(j.certificate_draft ->> 'certificateNumber',
                                     j.certificate_draft ->> 'certificate_number', '')), '');
  IF v_orig_no IS NULL THEN
    RAISE EXCEPTION 'The issued certificate has no certificate number' USING ERRCODE = '22023';
  END IF;
  v_orig_ulr := nullif(btrim(COALESCE(j.certificate_draft ->> 'ulrNumber',
                                      j.certificate_draft ->> 'ulr_number', '')), '');
  BEGIN
    v_orig_date := nullif(left(btrim(COALESCE(j.certificate_draft ->> 'issueDate',
                                              j.certificate_draft ->> 'issue_date', '')), 10), '')::date;
  EXCEPTION WHEN others THEN
    v_orig_date := NULL;
  END;
  v_orig_date := COALESCE(v_orig_date, (j.stage_entered_at AT TIME ZONE 'Asia/Kolkata')::date);

  SELECT jsonb_build_object(
           'id', s.id,
           'sheet_status', s.sheet_status,
           'payload', s.payload,
           'reviewed_at', s.reviewed_at,
           'reviewed_by', s.reviewed_by,
           'updated_at', s.updated_at)
    INTO v_sheet
    FROM public.calibration_raw_data_sheets s
   WHERE s.calibration_job_id = j.id;

  v_snapshot := jsonb_build_object(
    'snapshot_version', 1,
    'snapshot_at', now(),
    'certificate_draft', j.certificate_draft,
    'job', to_jsonb(j) - 'certificate_draft',
    'raw_data_sheet', COALESCE(v_sheet, 'null'::jsonb));

  SELECT COALESCE(max(amendment_no), 0) + 1 INTO v_no
    FROM public.calibration_certificate_amendments
   WHERE calibration_job_id = j.id;
  v_new_no := public.calibration_amended_certificate_number(v_orig_no, v_type, v_no);

  INSERT INTO public.calibration_certificate_amendments (
    id, calibration_job_id, original_certificate_number, original_ulr,
    original_issued_at, original_issue_date, amendment_type, amendment_no,
    reason, new_certificate_number, requested_by, status, original_snapshot
  ) VALUES (
    v_id, j.id, v_orig_no, v_orig_ulr,
    j.stage_entered_at, v_orig_date, v_type, v_no,
    v_reason, v_new_no, v_uid, 'open', v_snapshot
  );

  PERFORM set_config('app.calibration_certificate_amendment', j.id::text, true);
  UPDATE public.calibration_jobs
     SET stage = 'certificate_preparation',
         stage_entered_at = now(),
         certificate_draft = COALESCE(j.certificate_draft, '{}'::jsonb)
           || jsonb_build_object(
                'certificateNumber', v_new_no,
                'issueDate', '',
                'updatedAt', now(),
                'amendment', jsonb_build_object(
                  'id', v_id,
                  'amendmentNo', v_no,
                  'type', v_type,
                  'reason', v_reason,
                  'replacesCertificateNumber', v_orig_no,
                  'replacesUlrNumber', v_orig_ulr,
                  'replacesIssueDate', to_char(v_orig_date, 'YYYY-MM-DD')))
   WHERE id = j.id;
  PERFORM set_config('app.calibration_certificate_amendment', '', true);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_certificate_amendment(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_certificate_amendment(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_certificate_amendment(p_amendment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  a public.calibration_certificate_amendments;
  j public.calibration_jobs;
  v_no text;
  v_issue_date text;
BEGIN
  IF v_uid IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM public.calibration_certificate_amendments
   WHERE id = p_amendment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Amendment not found' USING ERRCODE = 'P0002';
  END IF;
  IF a.status <> 'open' THEN
    RAISE EXCEPTION 'This amendment is already %', a.status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO j FROM public.calibration_jobs WHERE id = a.calibration_job_id FOR UPDATE;
  IF j.stage IS DISTINCT FROM 'certificate_preparation' THEN
    RAISE EXCEPTION 'Bring the job to Certificate Preparation before issuing the amendment'
      USING ERRCODE = '22023';
  END IF;

  v_no := nullif(btrim(COALESCE(j.certificate_draft ->> 'certificateNumber', '')), '');
  IF v_no IS NULL THEN
    RAISE EXCEPTION 'The amended certificate has no certificate number' USING ERRCODE = '22023';
  END IF;
  IF v_no = a.original_certificate_number THEN
    RAISE EXCEPTION 'The amended certificate needs a new certificate number (it must not reuse %)',
      a.original_certificate_number USING ERRCODE = '22023';
  END IF;
  v_issue_date := nullif(left(btrim(COALESCE(j.certificate_draft ->> 'issueDate', '')), 10), '');

  PERFORM set_config('app.calibration_certificate_amendment', j.id::text, true);
  UPDATE public.calibration_jobs
     SET stage = 'certificates',
         stage_entered_at = now(),
         certificate_draft = COALESCE(j.certificate_draft, '{}'::jsonb)
           || jsonb_build_object(
                'issueDate', COALESCE(v_issue_date,
                                      to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD')),
                'amendment', jsonb_build_object(
                  'id', a.id,
                  'amendmentNo', a.amendment_no,
                  'type', a.amendment_type,
                  'reason', a.reason,
                  'replacesCertificateNumber', a.original_certificate_number,
                  'replacesUlrNumber', a.original_ulr,
                  'replacesIssueDate', to_char(a.original_issue_date, 'YYYY-MM-DD')))
   WHERE id = j.id;
  PERFORM set_config('app.calibration_certificate_amendment', '', true);

  UPDATE public.calibration_certificate_amendments
     SET status = 'issued',
         new_certificate_number = v_no,
         approved_by = v_uid,
         approved_at = now()
   WHERE id = a.id;

  RETURN a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_certificate_amendment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_certificate_amendment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_certificate_amendment(p_amendment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  a public.calibration_certificate_amendments;
  v_sheet jsonb;
  v_orig_sheet jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.app_can_amend_calibration_certificate() THEN
    RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can cancel an amendment'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM public.calibration_certificate_amendments
   WHERE id = p_amendment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Amendment not found' USING ERRCODE = 'P0002';
  END IF;
  IF a.status <> 'open' THEN
    RAISE EXCEPTION 'This amendment is already %', a.status USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.calibration_jobs WHERE id = a.calibration_job_id FOR UPDATE;

  SELECT s.payload INTO v_sheet
    FROM public.calibration_raw_data_sheets s
   WHERE s.calibration_job_id = a.calibration_job_id;
  v_orig_sheet := a.original_snapshot -> 'raw_data_sheet' -> 'payload';
  IF v_sheet IS DISTINCT FROM v_orig_sheet
     AND NOT (v_sheet IS NULL AND (v_orig_sheet IS NULL OR v_orig_sheet = 'null'::jsonb)) THEN
    RAISE EXCEPTION 'The calibration results were changed after the amendment started. Issue the amendment instead of cancelling it.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.calibration_certificate_amendment', a.calibration_job_id::text, true);
  UPDATE public.calibration_jobs
     SET stage = 'certificates',
         stage_entered_at = COALESCE(a.original_issued_at, now()),
         certificate_draft = COALESCE(a.original_snapshot -> 'certificate_draft', '{}'::jsonb)
   WHERE id = a.calibration_job_id;
  PERFORM set_config('app.calibration_certificate_amendment', '', true);

  UPDATE public.calibration_certificate_amendments
     SET status = 'cancelled',
         cancelled_by = v_uid,
         cancelled_at = now()
   WHERE id = a.id;

  RETURN a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_certificate_amendment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_certificate_amendment(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
