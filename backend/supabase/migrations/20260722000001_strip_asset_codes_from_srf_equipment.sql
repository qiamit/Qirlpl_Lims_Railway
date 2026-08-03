-- Remove embedded equipment asset codes from service request descriptions.
-- Old format: "Vernier Caliper (QE-EQ-0001) · LC ..."
-- New format: "Vernier Caliper · LC ..." (no asset code)

UPDATE public.calibration_service_requests
SET equipment_description = trim(
  both ' '
  from regexp_replace(
    equipment_description,
    '\s*\([A-Za-z0-9._/-]+\)(?=\s*·|\s*$)',
    '',
    'g'
  )
)
WHERE equipment_description IS NOT NULL
  AND equipment_description ~ '\([A-Za-z0-9._/-]+\)';

COMMENT ON COLUMN public.calibration_service_requests.equipment_description IS
  'Selected calibration equipment summary text (name + LC/range/make/etc). Asset codes are not stored.';
