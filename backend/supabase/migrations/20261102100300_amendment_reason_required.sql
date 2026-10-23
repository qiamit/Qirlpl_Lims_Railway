-- An amended / revised / supplementary report needs its reason (ISO/IEC
-- 17025 7.8.8; lab decision 23 Oct 2026). Until now the app filled a blank
-- remark with "… created from Issued Test Report …", so none of the earlier
-- amendments records why. The app now asks for the reason; this makes the
-- database refuse an amendment record without one. NOT applied
-- automatically. Safe to run more than once.
--
-- Existing rows all have a remark (the generated text), so the check
-- validates against them as they are.

ALTER TABLE public.issued_report_amendments
  DROP CONSTRAINT IF EXISTS issued_report_amendments_remark_required;

ALTER TABLE public.issued_report_amendments
  ADD CONSTRAINT issued_report_amendments_remark_required
  CHECK (remark IS NOT NULL AND btrim(remark) <> '');
