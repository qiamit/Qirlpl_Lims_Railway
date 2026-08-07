-- Free-text place where calibration is performed (Conduct Inside/Outside).
-- Distinct from calibration_location which stores In Lab / On Site.
ALTER TABLE public.calibration_jobs
  ADD COLUMN IF NOT EXISTS location_of_calibration text;

COMMENT ON COLUMN public.calibration_jobs.location_of_calibration IS
  'Place/site of calibration entered in Calibration Conduct before opening Raw Data Sheet';
