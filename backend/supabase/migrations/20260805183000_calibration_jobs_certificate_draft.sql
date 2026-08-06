-- Certificate Preparation draft (header fields + notes) on calibration_jobs

ALTER TABLE public.calibration_jobs
  ADD COLUMN IF NOT EXISTS certificate_draft jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.calibration_jobs.certificate_draft IS
  'Certificate Preparation draft: version, certificateNumber, ulrNumber, dateOfCalibration, dueDateOfCalibration, notes, updatedAt. Snapshot sections (equipment/masters/env/raw data) are loaded live from job + raw data sheet.';
