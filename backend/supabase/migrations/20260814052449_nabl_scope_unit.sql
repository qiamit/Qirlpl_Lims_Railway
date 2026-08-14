-- Unit of measurement for NABL scope range (shared measurement_units master via UI)

ALTER TABLE public.nabl_scope
  ADD COLUMN IF NOT EXISTS unit text NULL;

COMMENT ON COLUMN public.nabl_scope.unit IS 'Unit of measurement for range (from measurement units master)';
