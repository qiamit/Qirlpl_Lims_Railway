-- Mode of calibration for reference / master equipment (Internal vs External)

ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS mode_of_calibration text;

COMMENT ON COLUMN public.equipment_for_calibration.mode_of_calibration IS
  'How this equipment is calibrated: Internal or External.';
