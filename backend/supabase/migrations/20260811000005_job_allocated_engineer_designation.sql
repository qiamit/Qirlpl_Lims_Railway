-- Snapshot designation chosen at Job Allocation so later stages can display it.

ALTER TABLE public.calibration_jobs
  ADD COLUMN IF NOT EXISTS allocated_engineer_designation text;

COMMENT ON COLUMN public.calibration_jobs.allocated_engineer_designation IS
  'Designation selected during job allocation (snapshot).';

UPDATE public.calibration_jobs j
SET allocated_engineer_designation = NULLIF(TRIM(p.designation), '')
FROM public.user_profiles p
WHERE j.allocated_engineer_id = p.id
  AND (j.allocated_engineer_designation IS NULL OR TRIM(j.allocated_engineer_designation) = '')
  AND NULLIF(TRIM(p.designation), '') IS NOT NULL;
