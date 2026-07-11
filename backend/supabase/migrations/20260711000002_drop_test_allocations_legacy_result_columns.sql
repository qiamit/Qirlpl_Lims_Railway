-- Legacy section-level result fields; per-parameter values live on test_allocation_parameters.
ALTER TABLE public.test_allocations
  DROP COLUMN IF EXISTS test_start_date,
  DROP COLUMN IF EXISTS results,
  DROP COLUMN IF EXISTS test_end_date;
