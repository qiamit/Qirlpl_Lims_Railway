-- Section-scoped specified requirement override (does not change test_parameters master).
ALTER TABLE public.test_allocation_parameters
  ADD COLUMN IF NOT EXISTS specific_requirement text;

COMMENT ON COLUMN public.test_allocation_parameters.specific_requirement IS
  'Per-section override for specified requirement on this allocation parameter row.';
