ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS class_of_instrument text;

COMMENT ON COLUMN public.equipment_for_calibration.class_of_instrument IS
  'Instrument class / accuracy class for calibration records.';
