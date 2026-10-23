-- Lab policy (Amit, 23 Oct 2026): every record is kept for at least 3 years.
-- NOT applied automatically. Apply after 20261028100000_document_control_and_retention.sql.
-- All seeded rules are already 6 years or longer; this only stops a shorter
-- period being saved later.

DO $$
BEGIN
  IF to_regclass('public.record_retention_rules') IS NULL THEN
    RAISE NOTICE 'record_retention_rules missing; apply 20261028100000 first. Skipped.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.record_retention_rules WHERE retention_years < 3) THEN
    RAISE NOTICE 'Raising % retention rule(s) below 3 years to 3 years',
      (SELECT count(*) FROM public.record_retention_rules WHERE retention_years < 3);
    UPDATE public.record_retention_rules SET retention_years = 3 WHERE retention_years < 3;
  END IF;

  ALTER TABLE public.record_retention_rules
    DROP CONSTRAINT IF EXISTS record_retention_rules_years_check;
  ALTER TABLE public.record_retention_rules
    ADD CONSTRAINT record_retention_rules_years_check
    CHECK (retention_years >= 3 AND retention_years <= 100);
END $$;

NOTIFY pgrst, 'reload schema';
