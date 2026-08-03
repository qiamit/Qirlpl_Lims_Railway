-- Calibration Handling — unified stages (Job Allocation → Conduct → Review → Cert Prep → Certificates)

-- Map legacy Inside/Outside pipeline stages onto the new unified flow
UPDATE public.calibration_jobs
SET stage = CASE stage
  WHEN 'inside_receiving' THEN 'job_allocation'
  WHEN 'outside_master_dispatch' THEN 'job_allocation'
  WHEN 'inside_verification' THEN 'calibration_conduct'
  WHEN 'inside_raw_data' THEN 'calibration_conduct'
  WHEN 'outside_site_raw_data' THEN 'calibration_conduct'
  WHEN 'outside_master_return' THEN 'calibration_conduct'
  WHEN 'inside_review' THEN 'review_data'
  WHEN 'outside_review' THEN 'review_data'
  WHEN 'inside_certificate' THEN 'certificate_preparation'
  WHEN 'outside_certificate' THEN 'certificate_preparation'
  ELSE stage
END
WHERE stage IN (
  'inside_receiving',
  'inside_verification',
  'inside_raw_data',
  'inside_review',
  'inside_certificate',
  'outside_master_dispatch',
  'outside_site_raw_data',
  'outside_master_return',
  'outside_review',
  'outside_certificate'
);

ALTER TABLE public.calibration_jobs
  DROP CONSTRAINT IF EXISTS calibration_jobs_stage_check;

ALTER TABLE public.calibration_jobs
  ADD CONSTRAINT calibration_jobs_stage_check
  CHECK (stage IN (
    'job_allocation',
    'calibration_conduct',
    'review_data',
    'certificate_preparation',
    'certificates'
  ));

ALTER TABLE public.calibration_jobs
  ADD COLUMN IF NOT EXISTS allocated_engineer_id uuid,
  ADD COLUMN IF NOT EXISTS allocated_engineer_name text;

COMMENT ON TABLE public.calibration_jobs IS
  'Calibration Handling — one job per DUC; unified stages; Inside/Outside set at Job Allocation; Conduct filtered by allocated engineer.';

COMMENT ON COLUMN public.calibration_jobs.allocated_engineer_id IS
  'Engineer assigned at Job Allocation; Calibration Conduct lists jobs for this engineer.';
