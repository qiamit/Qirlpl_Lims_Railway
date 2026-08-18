-- Public marketing header: company logo path only (no lab bank/GST fields).
-- Storage: guests may read files under laboratory-files/company/.

CREATE OR REPLACE FUNCTION public.get_public_company_brand()
RETURNS TABLE (logo_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(BTRIM(ls.logo_path), '')
  FROM public.lab_settings ls
  ORDER BY
    CASE WHEN ls.id = '00000000-0000-0000-0000-000000000001'::uuid THEN 0 ELSE 1 END,
    ls.updated_at DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_company_brand() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_company_brand() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

DROP POLICY IF EXISTS lims_laboratory_company_logo_public_select ON storage.objects;
CREATE POLICY lims_laboratory_company_logo_public_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'laboratory-files'
    AND name LIKE 'company/%'
  );
