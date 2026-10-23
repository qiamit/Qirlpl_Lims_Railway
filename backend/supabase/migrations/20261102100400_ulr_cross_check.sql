-- One ULR, one document: a test report ULR and a calibration certificate ULR
-- may never share a number (NABL ULR rules; OQ-02 staging run, 23 Oct 2026).
-- On production, certificates QI/CC/2026/0001 and 0002 carry TC…248F and
-- TC…252F, which test reports SR260714/104-001 and SR260806/121-001 also
-- carry: certificates took the testing prefix, and the test report
-- generator did not look at certificate ULRs. The app now gives
-- certificates their own CC series and both generators read every ULR in
-- use through app_used_ulr_numbers(); the trigger below makes the database
-- refuse a clash. NOT applied automatically. Safe to run more than once.
--
-- The base of a ULR (before a "-Rn" revision suffix) is compared: an amended
-- test report (TC…F-R1) shares its base with the report it replaces, which
-- samples_nabl_ulr_uidx already allows; across the two tables, and between
-- two calibration jobs, the same base is refused. Rows that already clash
-- are left as they are (the guard runs only when a ULR is set or changed),
-- so the two certificates above are listed for the lab, not changed.

CREATE OR REPLACE FUNCTION public.app_ulr_base(p_ulr text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(upper(regexp_replace(split_part(btrim(coalesce(p_ulr, '')), '-', 1), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- Lookups by base for the guard below.
CREATE INDEX IF NOT EXISTS samples_ulr_base_idx
  ON public.samples (public.app_ulr_base(test_report_nabl_ulr_number))
  WHERE test_report_nabl_ulr_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS calibration_jobs_ulr_base_idx
  ON public.calibration_jobs (public.app_ulr_base(certificate_draft->>'ulrNumber'))
  WHERE certificate_draft ? 'ulrNumber';

-- Every ULR in use (deleted samples and superseded certificates included),
-- for the number generators. Staff only; it shows numbers, not records.
CREATE OR REPLACE FUNCTION public.app_used_ulr_numbers()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT u
  FROM (
    SELECT btrim(test_report_nabl_ulr_number) AS u FROM public.samples
    UNION ALL
    SELECT btrim(certificate_draft->>'ulrNumber') FROM public.calibration_jobs
    UNION ALL
    SELECT btrim(original_ulr) FROM public.calibration_certificate_amendments
  ) x
  WHERE public.app_is_known_staff() AND coalesce(u, '') <> '';
$$;

REVOKE ALL ON FUNCTION public.app_used_ulr_numbers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_used_ulr_numbers() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_ulr_cross_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new text;
  v_old text;
  v_hit text;
BEGIN
  IF TG_TABLE_NAME = 'samples' THEN
    v_new := public.app_ulr_base(NEW.test_report_nabl_ulr_number);
    IF TG_OP = 'UPDATE' THEN
      v_old := public.app_ulr_base(OLD.test_report_nabl_ulr_number);
    END IF;
  ELSE
    v_new := public.app_ulr_base(NEW.certificate_draft->>'ulrNumber');
    IF TG_OP = 'UPDATE' THEN
      v_old := public.app_ulr_base(OLD.certificate_draft->>'ulrNumber');
    END IF;
  END IF;
  IF v_new IS NULL OR v_new IS NOT DISTINCT FROM v_old THEN
    RETURN NEW;
  END IF;

  -- Two documents taking the same number at the same moment wait for each other.
  PERFORM pg_advisory_xact_lock(hashtext('ulr:' || v_new));

  IF TG_TABLE_NAME = 'calibration_jobs' THEN
    SELECT s.srf_number INTO v_hit FROM public.samples s
    WHERE public.app_ulr_base(s.test_report_nabl_ulr_number) = v_new LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ULR % is already used by test report %.', v_new, coalesce(v_hit, '(no SRF number)')
        USING ERRCODE = '23505', DETAIL = 'nabl_ulr_cross_check';
    END IF;
    SELECT j.srf_number INTO v_hit FROM public.calibration_jobs j
    WHERE j.id <> NEW.id AND public.app_ulr_base(j.certificate_draft->>'ulrNumber') = v_new LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ULR % is already used by the calibration certificate of %.', v_new, coalesce(v_hit, '(no SRF number)')
        USING ERRCODE = '23505', DETAIL = 'nabl_ulr_cross_check';
    END IF;
  ELSE
    SELECT j.srf_number INTO v_hit FROM public.calibration_jobs j
    WHERE public.app_ulr_base(j.certificate_draft->>'ulrNumber') = v_new LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'ULR % is already used by the calibration certificate of %.', v_new, coalesce(v_hit, '(no SRF number)')
        USING ERRCODE = '23505', DETAIL = 'nabl_ulr_cross_check';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ulr_cross_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS samples_guard_ulr_cross_check ON public.samples;
CREATE TRIGGER samples_guard_ulr_cross_check
  BEFORE INSERT OR UPDATE OF test_report_nabl_ulr_number ON public.samples
  FOR EACH ROW EXECUTE FUNCTION public.guard_ulr_cross_check();

DROP TRIGGER IF EXISTS calibration_jobs_guard_ulr_cross_check ON public.calibration_jobs;
CREATE TRIGGER calibration_jobs_guard_ulr_cross_check
  BEFORE INSERT OR UPDATE OF certificate_draft ON public.calibration_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_ulr_cross_check();
