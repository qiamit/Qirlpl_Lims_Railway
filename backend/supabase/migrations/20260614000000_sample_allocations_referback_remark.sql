-- Reason recorded when a section is referred back from Test Report Preparation (or similar).
ALTER TABLE public.sample_allocations
  ADD COLUMN IF NOT EXISTS referback_remark text;

COMMENT ON COLUMN public.sample_allocations.referback_remark IS
  'Latest refer-back reason for this section code; set when referring back from a later workflow stage.';
