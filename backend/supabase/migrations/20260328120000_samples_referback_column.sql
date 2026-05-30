-- Sample Handling: referback flag used by Test Allocation / Sample Under Testing UIs.
-- A missing column causes PostgREST PATCH ... samples to return 400.

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS referback_from_allocation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.samples.referback_from_allocation IS 'When true, Sample Allocation may be edited again for this SRF (refer-back workflow).';

-- If PATCH on samples returns 400 for stage values, samples.stage may be a PostgreSQL enum.
-- In Supabase SQL editor, add any missing values the app uses, e.g.:
--   ALTER TYPE <your_samples_stage_enum> ADD VALUE IF NOT EXISTS 'under_testing';
--   ALTER TYPE <your_samples_stage_enum> ADD VALUE IF NOT EXISTS 'test_allocation';
-- (Enum type name: check Table Editor → samples.stage column type, or pg_catalog.)
