-- ISO/IEC 17025 7.5.1 / 7.8.3.1 a), gap items P1-6 + P1-8: environmental
-- conditions recorded with each test result.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261026100200_environmental_monitoring.sql (lab_areas) and
-- 20261026100100_equipment_traceability.sql, while the lab is idle.
-- Safe to run more than once.
--
-- test_allocation_parameters
--   environment_area_id   The lab area / room the test was done in
--                         (lab_areas). Nullable: results entered before this
--                         migration, or with no area chosen, have none.
--                         ON DELETE RESTRICT: an area used by results is set
--                         inactive instead of being deleted.
--   environment_snapshot  The conditions in that area for the test period
--                         (test start date -> test end date), taken from
--                         environment_conditions_for() when the results are
--                         saved, so later readings or limit changes never
--                         rewrite the record:
--                           { area_id, area_code, area_name, period_from,
--                             period_to, reading_count, temperature_min,
--                             temperature_max, temperature_avg, humidity_min,
--                             humidity_max, humidity_avg, any_out_of_limits,
--                             out_of_limit_count, limits {temp_min, temp_max,
--                             rh_min, rh_max}, captured_at,
--                             acknowledgement {reason, by, by_name, at} | null }
--                         acknowledgement is set when a reading in the period
--                         was outside the area limits and the analyst
--                         acknowledged it with a reason.
--
-- No new policies or grants: the columns follow the table's existing RLS and
-- column grants, and the existing audit trigger (write_audit_log) records
-- every change of them.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.lab_areas') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261026100200_environmental_monitoring.sql first (lab_areas is missing)';
  END IF;
  IF to_regclass('public.test_allocation_parameters') IS NULL THEN
    RAISE EXCEPTION 'test_allocation_parameters must exist first';
  END IF;
END $$;

ALTER TABLE public.test_allocation_parameters
  ADD COLUMN IF NOT EXISTS environment_area_id uuid,
  ADD COLUMN IF NOT EXISTS environment_snapshot jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'test_allocation_parameters_environment_area_id_fkey'
      AND conrelid = 'public.test_allocation_parameters'::regclass
  ) THEN
    ALTER TABLE public.test_allocation_parameters
      ADD CONSTRAINT test_allocation_parameters_environment_area_id_fkey
      FOREIGN KEY (environment_area_id) REFERENCES public.lab_areas (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'test_allocation_parameters_environment_snapshot_object'
      AND conrelid = 'public.test_allocation_parameters'::regclass
  ) THEN
    ALTER TABLE public.test_allocation_parameters
      ADD CONSTRAINT test_allocation_parameters_environment_snapshot_object
      CHECK (environment_snapshot IS NULL OR jsonb_typeof(environment_snapshot) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_test_allocation_parameters_environment_area
  ON public.test_allocation_parameters (environment_area_id)
  WHERE environment_area_id IS NOT NULL;

COMMENT ON COLUMN public.test_allocation_parameters.environment_area_id IS
  'ISO 17025 7.5.1: lab area (lab_areas) where this result was obtained.';
COMMENT ON COLUMN public.test_allocation_parameters.environment_snapshot IS
  'ISO 17025 7.5.1 / 7.8.3.1 a): environmental conditions in the area for the test period, snapshot at save time.';

NOTIFY pgrst, 'reload schema';
