-- ISO/IEC 17025 gap P1-2 (part 1): authenticated release of test reports and
-- a frozen record of what was issued (clauses 7.8.1, 7.8.2, 7.11).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks.
-- Safe to run more than once. The frontend works with or without it: until it
-- is applied, issuing behaves exactly as before (no issuer columns, no archive).
--
-- What it adds:
--   * samples.issued_by / issued_by_name / issued_signature_meaning /
--     issued_reauthenticated_at. They are written in the same UPDATE that
--     issues the report (stage -> 'completed'). The trigger
--     samples_stamp_report_issuer sets issued_by = auth.uid() and the name from
--     user_profiles at that moment, so the browser cannot claim someone else
--     issued the report. The password re-entry time is taken from the JWT
--     (GoTrue "amr" password timestamp) when present, else the browser's value
--     capped at now(). Once issued, nobody (not even the Laboratory Director)
--     can change these four columns; before issue the browser cannot set them.
--   * issued_report_archive: append-only copy of the report data as issued
--     (snapshot jsonb + SHA-256 of its canonical JSON), one row per issue
--     event. Rows are added by archive_issued_test_report(), which copies the
--     report number, ULR, issue time and issuer from the issued sample itself.
--     Nobody can UPDATE or DELETE a row (grants + trigger), and an archived
--     sample cannot be deleted (FK RESTRICT).
--
-- Why no single issue_test_report() RPC: the issue UPDATE also writes Part B,
-- letterheads, retention dates and has a fallback for older schemas. Copying
-- all of that into SQL would duplicate the frontend logic, so the issuer is
-- stamped by a trigger inside the issue UPDATE itself, and the snapshot is
-- archived right after the successful issue by the RPC below.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Issuer signature on samples
-- ---------------------------------------------------------------------------

ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issued_by uuid;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issued_by_name text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issued_signature_meaning text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS issued_reauthenticated_at timestamptz;

COMMENT ON COLUMN public.samples.issued_by IS
  'auth.uid() of the person who issued the test report (set by trigger samples_stamp_report_issuer).';
COMMENT ON COLUMN public.samples.issued_by_name IS
  'Name of the issuer at the time of issue (user_profiles.full_name).';
COMMENT ON COLUMN public.samples.issued_signature_meaning IS
  'Meaning of the electronic signature, e.g. "Authorized for release".';
COMMENT ON COLUMN public.samples.issued_reauthenticated_at IS
  'When the issuer re-entered their password before issuing.';

-- Password sign-in time from the request JWT (GoTrue amr claim), or NULL.
CREATE OR REPLACE FUNCTION public.app_jwt_password_auth_at()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims jsonb;
  v_epoch numeric;
BEGIN
  BEGIN
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF v_claims IS NULL OR jsonb_typeof(v_claims -> 'amr') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;
  SELECT max((e ->> 'timestamp')::numeric)
    INTO v_epoch
    FROM jsonb_array_elements(v_claims -> 'amr') e
   WHERE jsonb_typeof(e) = 'object'
     AND e ->> 'method' = 'password'
     AND (e ->> 'timestamp') ~ '^[0-9]+(\.[0-9]+)?$';
  RETURN CASE WHEN v_epoch IS NULL THEN NULL ELSE to_timestamp(v_epoch) END;
END;
$$;

REVOKE ALL ON FUNCTION public.app_jwt_password_auth_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_jwt_password_auth_at() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stamp_report_issuer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_pw_at timestamptz;
BEGIN
  -- Already issued: the signature is part of the frozen record.
  IF TG_OP = 'UPDATE' AND OLD.stage IS NOT DISTINCT FROM 'completed' THEN
    IF v_uid IS NOT NULL AND (
      NEW.issued_by IS DISTINCT FROM OLD.issued_by
      OR NEW.issued_by_name IS DISTINCT FROM OLD.issued_by_name
      OR NEW.issued_signature_meaning IS DISTINCT FROM OLD.issued_signature_meaning
      OR NEW.issued_reauthenticated_at IS DISTINCT FROM OLD.issued_reauthenticated_at
    ) THEN
      RAISE EXCEPTION 'The issuer signature of an issued test report cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Scripts run without a user (service role / psql) are left alone.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.stage IS NOT DISTINCT FROM 'completed' THEN
    -- This statement issues the report: the signer is whoever is signed in.
    SELECT nullif(btrim(up.full_name), '') INTO v_name
      FROM public.user_profiles up
     WHERE up.id = v_uid;
    NEW.issued_by := v_uid;
    NEW.issued_by_name := COALESCE(v_name, nullif(btrim(NEW.issued_by_name), ''));
    NEW.issued_signature_meaning := nullif(btrim(NEW.issued_signature_meaning), '');

    IF NEW.issued_reauthenticated_at IS NOT NULL THEN
      v_pw_at := public.app_jwt_password_auth_at();
      IF v_pw_at IS NOT NULL THEN
        IF v_pw_at < now() - interval '15 minutes' THEN
          RAISE EXCEPTION 'Password confirmation has expired. Confirm your password again to issue the report.'
            USING ERRCODE = '28000';
        END IF;
        NEW.issued_reauthenticated_at := v_pw_at;
      ELSE
        NEW.issued_reauthenticated_at := LEAST(NEW.issued_reauthenticated_at, now());
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Not issued (yet, or copied for an amendment): the browser cannot set a signature.
  IF TG_OP = 'INSERT' THEN
    NEW.issued_by := NULL;
    NEW.issued_by_name := NULL;
    NEW.issued_signature_meaning := NULL;
    NEW.issued_reauthenticated_at := NULL;
  ELSE
    -- Keep the last issuer when a report is referred back for amendment.
    NEW.issued_by := OLD.issued_by;
    NEW.issued_by_name := OLD.issued_by_name;
    NEW.issued_signature_meaning := OLD.issued_signature_meaning;
    NEW.issued_reauthenticated_at := OLD.issued_reauthenticated_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_report_issuer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS samples_stamp_report_issuer ON public.samples;
CREATE TRIGGER samples_stamp_report_issuer
  BEFORE INSERT OR UPDATE ON public.samples
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_report_issuer();

-- ---------------------------------------------------------------------------
-- 2. Frozen copy of each issued report
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.issued_report_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples (id) ON DELETE RESTRICT,
  report_number text,
  ulr_number text,
  issued_at timestamptz NOT NULL,
  issued_by uuid NOT NULL DEFAULT auth.uid(),
  issued_by_name text,
  snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issued_report_archive_sha_chk CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT issued_report_archive_snapshot_chk CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT issued_report_archive_issue_uniq UNIQUE (sample_id, issued_at)
);

COMMENT ON TABLE public.issued_report_archive IS
  'Append-only copy of each test report as issued (ISO/IEC 17025 7.8, 7.11). snapshot_sha256 is the SHA-256 of the snapshot serialised as JSON with sorted keys.';

CREATE INDEX IF NOT EXISTS issued_report_archive_sample_idx
  ON public.issued_report_archive (sample_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_issued_report_archive_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Issued report archive rows cannot be changed or deleted'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS issued_report_archive_append_only ON public.issued_report_archive;
CREATE TRIGGER issued_report_archive_append_only
  BEFORE UPDATE OR DELETE ON public.issued_report_archive
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_issued_report_archive_append_only();

DROP TRIGGER IF EXISTS issued_report_archive_no_truncate ON public.issued_report_archive;
CREATE TRIGGER issued_report_archive_no_truncate
  BEFORE TRUNCATE ON public.issued_report_archive
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.guard_issued_report_archive_append_only();

ALTER TABLE public.issued_report_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS issued_report_archive_select ON public.issued_report_archive;
CREATE POLICY issued_report_archive_select ON public.issued_report_archive
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_known_staff()));

-- Direct inserts: only for yourself, and only for a sample you issued.
DROP POLICY IF EXISTS issued_report_archive_insert ON public.issued_report_archive;
CREATE POLICY issued_report_archive_insert ON public.issued_report_archive
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.app_is_known_staff())
    AND issued_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.samples s
       WHERE s.id = sample_id
         AND s.stage = 'completed'
         AND s.issued_by = (SELECT auth.uid())
    )
  );

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NOT NULL THEN
    DROP POLICY IF EXISTS lims_known_staff_only ON public.issued_report_archive;
    CREATE POLICY lims_known_staff_only ON public.issued_report_archive
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.app_is_known_staff())
      WITH CHECK (public.app_is_known_staff());
  END IF;
END $$;

REVOKE ALL ON public.issued_report_archive FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.issued_report_archive TO authenticated;
GRANT SELECT, INSERT ON public.issued_report_archive TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS issued_report_archive_audit_log ON public.issued_report_archive;
    CREATE TRIGGER issued_report_archive_audit_log
      AFTER INSERT ON public.issued_report_archive
      FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
  END IF;
END $$;

-- Stores the snapshot of a report the caller just issued. Report number, ULR,
-- issue time and issuer come from the sample row, not from the browser.
-- Calling it again for the same issue returns the existing row unchanged.
CREATE OR REPLACE FUNCTION public.archive_issued_test_report(
  p_sample_id uuid,
  p_snapshot jsonb,
  p_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  s record;
  v_sha text := lower(btrim(COALESCE(p_sha256, '')));
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Snapshot must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF v_sha !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'snapshot SHA-256 must be 64 hex characters' USING ERRCODE = '22023';
  END IF;

  SELECT id, stage, test_report_number, test_report_nabl_ulr_number,
         test_report_issued_at, issued_by, issued_by_name
    INTO s
    FROM public.samples
   WHERE id = p_sample_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sample not found' USING ERRCODE = 'P0002';
  END IF;
  IF s.stage IS DISTINCT FROM 'completed' OR s.test_report_issued_at IS NULL THEN
    RAISE EXCEPTION 'The test report has not been issued' USING ERRCODE = '22023';
  END IF;
  IF s.issued_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the person who issued the report can archive it' USING ERRCODE = '42501';
  END IF;

  SELECT a.id INTO v_id
    FROM public.issued_report_archive a
   WHERE a.sample_id = s.id AND a.issued_at = s.test_report_issued_at;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.issued_report_archive (
    sample_id, report_number, ulr_number, issued_at, issued_by, issued_by_name,
    snapshot, snapshot_sha256
  ) VALUES (
    s.id, s.test_report_number, s.test_report_nabl_ulr_number, s.test_report_issued_at,
    s.issued_by, s.issued_by_name, p_snapshot, v_sha
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_issued_test_report(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_issued_test_report(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
