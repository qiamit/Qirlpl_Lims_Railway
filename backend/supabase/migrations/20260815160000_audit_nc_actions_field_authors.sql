-- Per CAPA field authorship metadata (who filled each action field)

ALTER TABLE public.audit_nc_actions
  ADD COLUMN IF NOT EXISTS field_authors jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.audit_nc_actions.field_authors IS
  'Per CAPA field authorship: { fieldKey: { userId, name, designation, department, division, date } }. After stamp, field is view-only except Laboratory Director.';
