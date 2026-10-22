-- 20261009120000 created sale_documents and compliance_registers with RLS
-- policies but no table privileges, so PostgREST returned
-- "permission denied for table ..." for every request.
-- RLS (app_is_known_staff) still limits rows to known staff; anon gets nothing.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_documents TO authenticated;
GRANT ALL ON public.sale_documents TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_registers TO authenticated;
GRANT ALL ON public.compliance_registers TO service_role;

NOTIFY pgrst, 'reload schema';
