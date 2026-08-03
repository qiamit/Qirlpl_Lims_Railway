-- Multi-range support for calibration / equipment master
-- Each equipment can have multiple range+least-count pairs (e.g. dual-range instruments).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'equipment_master'
      AND column_name = 'measurement_ranges'
  ) THEN
    ALTER TABLE public.equipment_master
      ADD COLUMN measurement_ranges jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.equipment_master.measurement_ranges IS
  'Array of {range_capacity, resolution_least_count} objects for multi-range instruments.';

-- Backfill from legacy single-range columns where JSON is still empty
UPDATE public.equipment_master
SET measurement_ranges = jsonb_build_array(
  jsonb_build_object(
    'range_capacity', COALESCE(range_capacity, ''),
    'resolution_least_count', COALESCE(resolution_least_count, '')
  )
)
WHERE (measurement_ranges IS NULL OR measurement_ranges = '[]'::jsonb)
  AND (
    NULLIF(TRIM(COALESCE(range_capacity, '')), '') IS NOT NULL
    OR NULLIF(TRIM(COALESCE(resolution_least_count, '')), '') IS NOT NULL
  );
