-- Company logo for signed-out visitors (go-live smoke test, 25 Oct 2026).
-- Migration 46 (storage lockdown) revoked every storage privilege from anon,
-- so the existing policy lims_laboratory_company_logo_public_select
-- (laboratory-files, company/%) could no longer apply: the sign-in page and
-- the public site could not load the company logo (signed URL 400).
--
-- Gives anon back only what that policy needs: SELECT on storage.objects
-- (rows limited by the policy to laboratory-files/company/%) and SELECT on
-- the laboratory-files bucket row. No other privilege, table or bucket.
-- Safe to run more than once.

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage missing; nothing to do.';
    RETURN;
  END IF;
  GRANT SELECT ON TABLE storage.objects TO anon;
  GRANT SELECT ON TABLE storage.buckets TO anon;

  DROP POLICY IF EXISTS lims_storage_buckets_logo_anon_read ON storage.buckets;
  CREATE POLICY lims_storage_buckets_logo_anon_read ON storage.buckets
    FOR SELECT TO anon
    USING (id = 'laboratory-files');
END $$;
