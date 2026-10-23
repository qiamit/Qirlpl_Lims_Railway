-- Issuing a calibration certificate (OQ-02 staging run, 23 Oct 2026; lab
-- decision): the issuer confirms their password, as for test reports, and is
-- recorded on the certificate; a certificate is not issued without its
-- measurement uncertainty (ISO/IEC 17025 7.8.4.1 b, 7.8.2.1, 7.5). NOT
-- applied automatically. Safe to run more than once.
--
-- When a signed-in user moves a job from Certificate Preparation to
-- Certificates (Issue & Forward, or issue_certificate_amendment):
--   * certificate_draft.issuedBy.reauthenticatedAt must be set and at most 15
--     minutes old (the app sets it after the password is checked again);
--   * certificate_draft.uncertaintyReported must not be empty;
--   * certificate_draft.issuedBy is stamped with the signed-in user, their
--     name and designation from user_profiles and the time, whatever the
--     browser sent.
-- Certificates issued before this migration are not touched. Scripts
-- without a signed-in user are not affected.

CREATE OR REPLACE FUNCTION public.guard_calibration_certificate_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reauth timestamptz;
  v_name text;
  v_desig text;
BEGIN
  IF v_uid IS NULL
     OR OLD.stage IS DISTINCT FROM 'certificate_preparation'
     OR NEW.stage IS DISTINCT FROM 'certificates' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_reauth := nullif(btrim(NEW.certificate_draft #>> '{issuedBy,reauthenticatedAt}'), '')::timestamptz;
  EXCEPTION WHEN others THEN
    v_reauth := NULL;
  END;
  IF v_reauth IS NULL OR v_reauth < now() - interval '15 minutes' OR v_reauth > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Confirm your password to issue this calibration certificate.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(NEW.certificate_draft ->> 'uncertaintyReported'), '') = '' THEN
    RAISE EXCEPTION 'The certificate has no measurement uncertainty. Use the MU sheet result ("Use U on the certificate") before issuing (ISO/IEC 17025 7.8.4.1).'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(nullif(btrim(full_name), ''), email), btrim(coalesce(designation, ''))
    INTO v_name, v_desig
    FROM public.user_profiles WHERE id = v_uid;

  NEW.certificate_draft := jsonb_set(
    coalesce(NEW.certificate_draft, '{}'::jsonb),
    '{issuedBy}',
    jsonb_build_object(
      'userId', v_uid,
      'name', coalesce(v_name, ''),
      'designation', coalesce(v_desig, ''),
      'issuedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'reauthenticatedAt', to_char(v_reauth AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_calibration_certificate_issue() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calibration_jobs_guard_certificate_issue ON public.calibration_jobs;
CREATE TRIGGER calibration_jobs_guard_certificate_issue
  BEFORE UPDATE OF stage ON public.calibration_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_calibration_certificate_issue();
