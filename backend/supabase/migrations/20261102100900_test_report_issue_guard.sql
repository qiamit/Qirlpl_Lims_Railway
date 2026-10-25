-- Issuing a test report is checked by the database (security re-check,
-- 23 Oct 2026; ISO/IEC 17025 7.8.1.2, 6.2.6, 7.11.3). NOT applied
-- automatically. Safe to run more than once.
--
-- Before this, the password confirmation was checked only when the browser
-- sent issued_reauthenticated_at, and nothing checked who issued: any
-- signed-in staff member could set samples.stage = 'completed' through the
-- API without a password. Now, when a signed-in user issues a test report
-- (a sample becomes 'completed'):
--   * their session must come from a password sign-in of the last 15
--     minutes (the "Confirm password" step signs in again; the time is the
--     password entry in the token's amr claim, which the browser cannot set);
--   * they must be allowed to sign test reports:
--       - the Laboratory Director always;
--       - once the Authorization Matrix is in use for "Sign test reports"
--         (an active grant valid today for anyone), only people holding that
--         grant;
--       - until then, the Quality Manager or a user with Edit access to Test
--         Report Preparation in Module Access.
-- issued_reauthenticated_at is set to that password time. Reports issued
-- before this migration are not touched; scripts without a signed-in user
-- are not affected.

CREATE OR REPLACE FUNCTION public.guard_test_report_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pw_at timestamptz;
BEGIN
  IF v_uid IS NULL OR NEW.stage IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.stage IS NOT DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  v_pw_at := public.app_jwt_password_auth_at();
  IF v_pw_at IS NULL OR v_pw_at < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'Confirm your password to issue this test report.'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.app_is_laboratory_director() THEN
    IF EXISTS (
      SELECT 1 FROM public.personnel_authorizations a
       WHERE a.activity = 'sign_report'
         AND a.status = 'active'
         AND a.valid_from <= current_date
         AND (a.valid_to IS NULL OR a.valid_to >= current_date)
    ) THEN
      IF NOT public.app_is_authorized(v_uid, 'sign_report') THEN
        RAISE EXCEPTION 'You are not on the Authorization Matrix to sign test reports. Ask the Quality Manager to update the matrix, or the Laboratory Director to issue.'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NOT (public.app_is_quality_manager()
               OR public.app_can_edit('/samples/report-preparation')) THEN
      RAISE EXCEPTION 'You are not allowed to issue test reports. Issuing needs Edit access to Test Report Preparation.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.issued_reauthenticated_at := v_pw_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_test_report_issue() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS samples_guard_report_issue ON public.samples;
CREATE TRIGGER samples_guard_report_issue
  BEFORE INSERT OR UPDATE OF stage ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.guard_test_report_issue();
