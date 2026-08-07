-- Coefficient of thermal expansion (α) for temperature corrections / calculations.
ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS coefficient_of_thermal_expansion text;

COMMENT ON COLUMN public.equipment_for_calibration.coefficient_of_thermal_expansion IS
  'Coefficient of thermal expansion α, stored as scientific text e.g. 11.5e-6 or 11.5×10^-6/°C (Equipment for Calibration form). Numeric value used in temp-corrected reading formulas.';
