-- Calibration environment conditions recorded on master equipment certificate form.
ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS calibration_temperature text,
  ADD COLUMN IF NOT EXISTS calibration_humidity text;

COMMENT ON COLUMN public.equipment_for_calibration.calibration_temperature IS
  'Temperature at calibration (Equipment for Calibration · Calibration Form)';
COMMENT ON COLUMN public.equipment_for_calibration.calibration_humidity IS
  'Humidity at calibration (Equipment for Calibration · Calibration Form)';
