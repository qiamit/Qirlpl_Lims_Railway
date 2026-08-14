-- Ambient conditions recorded with IQC calibration certificate
ALTER TABLE public.iqc_masters
  ADD COLUMN IF NOT EXISTS calibration_temperature text,
  ADD COLUMN IF NOT EXISTS calibration_humidity text;

COMMENT ON COLUMN public.iqc_masters.calibration_temperature IS
  'Ambient temperature recorded with calibration certificate (e.g. 23 °C)';
COMMENT ON COLUMN public.iqc_masters.calibration_humidity IS
  'Ambient humidity recorded with calibration certificate (e.g. 55 %RH)';
