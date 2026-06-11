-- Allow Test Report Prepare (Part A) to temporarily unlock Sample Receiving edit
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS sample_receiving_edit_unlocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.samples.sample_receiving_edit_unlocked IS
  'When true, Sample Receiving edit is allowed even if the SRF is in Sample Allocation (set from Test Report Prepare Part A).';
