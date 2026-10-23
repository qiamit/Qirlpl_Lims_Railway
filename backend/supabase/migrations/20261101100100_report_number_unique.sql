-- A test report number is never stored on two samples (URS-RPT-03, calculation
-- validation case RN-03, lab decision 23 Oct 2026).
-- NOT applied automatically. Safe to run more than once.
--
-- Unique index on lower(btrim(samples.test_report_number)) for every sample
-- that has a number. Issued report numbers are never renamed here: when
-- duplicates already exist, each duplicate group is listed with RAISE NOTICE
-- and the index is skipped (as 20261009063000 did for SRF / ULR). Resolve the
-- listed samples by hand (amendment / referback), then run this file again.
-- The app reports a clash on save as "Report number … was just used by another
-- report" (isTestReportNumberConflictError, index name below).

DO $$
DECLARE
  dup record;
  dup_groups integer := 0;
BEGIN
  IF to_regclass('public.samples') IS NULL THEN
    RAISE NOTICE 'public.samples missing. Skipped.';
    RETURN;
  END IF;

  IF to_regclass('public.samples_test_report_number_uidx') IS NOT NULL THEN
    RAISE NOTICE 'samples_test_report_number_uidx already exists. Nothing to do.';
    RETURN;
  END IF;

  FOR dup IN
    SELECT lower(btrim(test_report_number)) AS report_no,
           count(*) AS copies,
           string_agg(
             coalesce(srf_number, '?') || ' (' || coalesce(stage, '?') || ', sample ' || id::text || ')',
             '; ' ORDER BY test_report_issued_at NULLS LAST, created_at, id
           ) AS holders
    FROM public.samples
    WHERE test_report_number IS NOT NULL AND btrim(test_report_number) <> ''
    GROUP BY lower(btrim(test_report_number))
    HAVING count(*) > 1
    ORDER BY 1
  LOOP
    dup_groups := dup_groups + 1;
    RAISE NOTICE 'Duplicate report number % on % samples: %', upper(dup.report_no), dup.copies, dup.holders;
  END LOOP;

  IF dup_groups > 0 THEN
    RAISE NOTICE 'samples_test_report_number_uidx skipped: % duplicate report number(s). Issued numbers were not changed.', dup_groups;
    RETURN;
  END IF;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS samples_test_report_number_uidx
      ON public.samples (lower(btrim(test_report_number)))
      WHERE test_report_number IS NOT NULL AND btrim(test_report_number) <> '';
  EXCEPTION
    WHEN unique_violation THEN
      -- A duplicate written between the check above and the index build.
      RAISE NOTICE 'samples_test_report_number_uidx skipped because duplicate report numbers already exist';
  END;
END $$;

NOTIFY pgrst, 'reload schema';
