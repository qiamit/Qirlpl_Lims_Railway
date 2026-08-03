-- MU Calculation Sheet template on Calibration Equipment (UUC)

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS mu_calculation_template jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.equipment_master.mu_calculation_template IS
  'Measurement Uncertainty (MU) calculation sheet: instrument family, Type A/B components, coverage factor. GUM-based template for Calibration Equipments.';
