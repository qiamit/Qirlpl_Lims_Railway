-- Company Setting: show/hide Generate Report Format (Calibration Equipments)
-- and Generate Report (Calibration Conduct / Raw Data Sheet).

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS generate_report_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.lab_settings.generate_report_enabled IS
  'When true, show Generate Report Format on Calibration Equipments and Generate Report on Calibration Conduct Raw Data Sheet.';
