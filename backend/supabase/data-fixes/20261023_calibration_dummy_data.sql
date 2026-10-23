-- Remove the dummy calibration records from production before calibration
-- starts (lab, 23 Oct 2026: the calibration module has not started; only
-- testing is live; certificates QI/CC/2026/0001 and 0002 are dummy and were
-- never sent to anyone). A one-off data fix, not a migration. Run it at
-- go-live, after 20261023_duplicate_cleanup.sql, as one transaction, without
-- a signed-in user, after a fresh backup:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261023_calibration_dummy_data.sql
--
-- Removed: SRF-2026-0001 (BR Stainless India Limited), SRF-2026-0002 (Ajay
-- Ingot Rolling Mill Private Limited), SRF-2026-0003 (Aishwaryam Steels
-- Private Limited), their 5 calibration jobs (with the 2 dummy certificates)
-- and 5 raw data sheets. The rows are purged, not sent to the Recycle Bin,
-- so the first real SRF, certificate number and calibration ULR start from
-- 0001 and the dummy certificates no longer hold the test report ULRs
-- TC1544226000000248F and TC1544226000000252F. The audit trail keeps a
-- record of each removed row with the reason.
--
-- Not touched: equipment master, calibration equipment, templates, clients
-- and anything in testing.
--
-- Each SRF is checked first by id, number and client, its jobs by count and
-- certificate number; certificate amendments or an invoice stop the fix
-- without changing anything. An SRF already removed is skipped. Safe to run
-- more than once.

DO $$
DECLARE
  k record;
  v_jobs uuid[];
  v_certs text[];
  v_n integer;
  v_srfs integer := 0;
  v_jobs_n integer := 0;
  v_sheets_n integer := 0;
  v_reason constant text := 'Dummy calibration data removed before calibration started (lab, 23 Oct 2026)';
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Run this without a signed-in user (psql / Railway console).';
  END IF;
  PERFORM set_config('app.audit_annotate', 'on', true);

  FOR k IN
    SELECT *
    FROM (VALUES
      ('0497f724-3657-4cfb-8ef3-0cb4f2aa0cec'::uuid, 'SRF-2026-0001', 'BR Stainless India Limited', 2, ARRAY['QI/CC/2026/0001']),
      ('afef5389-c219-4912-bfd9-dc2bcff0d790'::uuid, 'SRF-2026-0002', 'Ajay Ingot Rolling Mill Private Limited', 1, ARRAY['QI/CC/2026/0002']),
      ('5625e61b-b6cb-4806-b999-0d78eda34487'::uuid, 'SRF-2026-0003', 'Aishwaryam Steels Private Limited', 2, ARRAY[]::text[])
    ) AS t(id, srf_number, client_name, job_count, certificates)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.calibration_service_requests WHERE id = k.id) THEN
      RAISE NOTICE '% already removed', k.srf_number;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.calibration_service_requests
      WHERE id = k.id AND srf_number = k.srf_number AND client_name = k.client_name
        AND coalesce(btrim(invoice_no), '') = ''
    ) THEN
      RAISE EXCEPTION '% is no longer the dummy SRF of % without an invoice; nothing removed', k.srf_number, k.client_name;
    END IF;

    SELECT array_agg(id), array_remove(array_agg(nullif(btrim(certificate_draft ->> 'certificateNumber'), '')), NULL)
      INTO v_jobs, v_certs
      FROM public.calibration_jobs WHERE service_request_id = k.id;
    IF coalesce(cardinality(v_jobs), 0) <> k.job_count THEN
      RAISE EXCEPTION '% has % calibration job(s), expected %; nothing removed', k.srf_number, coalesce(cardinality(v_jobs), 0), k.job_count;
    END IF;
    IF (SELECT array_agg(c ORDER BY c) FROM unnest(coalesce(v_certs, '{}')) c)
       IS DISTINCT FROM (SELECT array_agg(c ORDER BY c) FROM unnest(k.certificates) c) THEN
      RAISE EXCEPTION '% has certificate(s) %, expected %; nothing removed', k.srf_number, v_certs, k.certificates;
    END IF;
    IF EXISTS (SELECT 1 FROM public.calibration_certificate_amendments WHERE calibration_job_id = ANY (v_jobs)) THEN
      RAISE EXCEPTION '% has certificate amendments; nothing removed', k.srf_number;
    END IF;

    DELETE FROM public.calibration_raw_data_sheets WHERE calibration_job_id = ANY (v_jobs);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_sheets_n := v_sheets_n + v_n;
    DELETE FROM public.calibration_jobs WHERE id = ANY (v_jobs);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_jobs_n := v_jobs_n + v_n;
    DELETE FROM public.calibration_service_requests WHERE id = k.id;
    v_srfs := v_srfs + 1;
    RAISE NOTICE '% (%) removed with % job(s)', k.srf_number, k.client_name, k.job_count;
  END LOOP;

  UPDATE public.audit_log
     SET reason = v_reason
   WHERE table_name IN ('calibration_service_requests', 'calibration_jobs', 'calibration_raw_data_sheets')
     AND action = 'DELETE' AND actor IS NULL AND reason IS NULL AND at >= now();

  RAISE NOTICE 'removed: % SRF(s), % job(s), % raw data sheet(s)', v_srfs, v_jobs_n, v_sheets_n;
END $$;
