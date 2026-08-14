-- Align report scope letterhead bindings with actual lab_letterheads titles
-- so Consent Letter View/Download can resolve header images.

UPDATE public.lab_settings
SET report_scope_templates = jsonb_set(
  jsonb_set(
    coalesce(report_scope_templates, '{}'::jsonb),
    '{non_nabl,headerName}',
    '"General Letter Header"'::jsonb
  ),
  '{nabl,headerName}',
  '"NABL Letter Header - Testing"'::jsonb
)
WHERE coalesce(report_scope_templates, '{}'::jsonb) <> '{}'::jsonb;
