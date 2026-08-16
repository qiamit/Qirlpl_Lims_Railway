-- CRM uncertainty: multi-row element / range / uncertainty table
ALTER TABLE public.equipment_crms
  ADD COLUMN IF NOT EXISTS uncertainty_rows jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Seed one row from legacy single uncertainty text when present and rows empty
UPDATE public.equipment_crms
SET uncertainty_rows = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'selected', false,
    'elementName', '',
    'rangeMin', '',
    'rangeMax', '',
    'uncertainty', COALESCE(NULLIF(btrim(uncertainty), ''), '')
  )
)
WHERE COALESCE(jsonb_array_length(uncertainty_rows), 0) = 0
  AND NULLIF(btrim(uncertainty), '') IS NOT NULL;
