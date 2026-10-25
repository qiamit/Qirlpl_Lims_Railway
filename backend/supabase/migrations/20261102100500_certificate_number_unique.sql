-- One calibration certificate number, one job (OQ staging run, 23 Oct 2026).
-- The number generator did not recognise an amended number
-- (QI/CC/2026/0003/A1) and did not read the amendment register, so after an
-- amendment the next new certificate got the replaced number again
-- (QI/CC/2026/0003 issued twice on staging). The app now counts every number
-- through app_used_certificate_numbers(); the trigger below makes the
-- database refuse a number whose base is held by another job. NOT applied
-- automatically. Safe to run more than once.
--
-- The base is the number without its amendment suffix (/A1, /R1, /S1, as
-- calibration_amended_certificate_number writes it): the amendments of one
-- certificate share the base on the same job, which stays allowed. Rows that
-- already clash are left as they are (the guard runs only when a job's
-- number base is set or changed).

CREATE OR REPLACE FUNCTION public.app_certificate_number_base(p_no text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(upper(regexp_replace(btrim(coalesce(p_no, '')), '/[ARSars][0-9]+$', '')), '');
$$;

CREATE INDEX IF NOT EXISTS calibration_jobs_certificate_number_base_idx
  ON public.calibration_jobs (public.app_certificate_number_base(certificate_draft->>'certificateNumber'))
  WHERE certificate_draft ? 'certificateNumber';

-- Every certificate number in use, for the number generator. Staff only.
CREATE OR REPLACE FUNCTION public.app_used_certificate_numbers()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT n
  FROM (
    SELECT btrim(certificate_draft->>'certificateNumber') AS n FROM public.calibration_jobs
    UNION ALL
    SELECT btrim(original_certificate_number) FROM public.calibration_certificate_amendments
    UNION ALL
    SELECT btrim(new_certificate_number) FROM public.calibration_certificate_amendments
  ) x
  WHERE public.app_is_known_staff() AND coalesce(n, '') <> '';
$$;

REVOKE ALL ON FUNCTION public.app_used_certificate_numbers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_used_certificate_numbers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_certificate_number_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new text := public.app_certificate_number_base(NEW.certificate_draft->>'certificateNumber');
  v_old text;
  v_hit text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := public.app_certificate_number_base(OLD.certificate_draft->>'certificateNumber');
  END IF;
  IF v_new IS NULL OR v_new IS NOT DISTINCT FROM v_old THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('certno:' || v_new));

  SELECT j.srf_number INTO v_hit FROM public.calibration_jobs j
  WHERE j.id <> NEW.id
    AND public.app_certificate_number_base(j.certificate_draft->>'certificateNumber') = v_new
  LIMIT 1;
  IF NOT FOUND THEN
    SELECT j.srf_number INTO v_hit
    FROM public.calibration_certificate_amendments a
    JOIN public.calibration_jobs j ON j.id = a.calibration_job_id
    WHERE a.calibration_job_id <> NEW.id
      AND (public.app_certificate_number_base(a.original_certificate_number) = v_new
        OR public.app_certificate_number_base(a.new_certificate_number) = v_new)
    LIMIT 1;
  END IF;
  IF FOUND THEN
    RAISE EXCEPTION 'Certificate number % is already used by the calibration certificate of %.', v_new, coalesce(v_hit, '(no SRF number)')
      USING ERRCODE = '23505', DETAIL = 'calibration_certificate_number_unique';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_certificate_number_unique() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calibration_jobs_guard_certificate_number ON public.calibration_jobs;
CREATE TRIGGER calibration_jobs_guard_certificate_number
  BEFORE INSERT OR UPDATE OF certificate_draft ON public.calibration_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_certificate_number_unique();
