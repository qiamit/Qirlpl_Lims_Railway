-- Drop legacy equipment_master columns left from the older schema.
-- Current app uses: asset_code, manufacturer, model_number, serial_number,
-- equipment_status, range_capacity, resolution_least_count, etc.
-- Legacy duplicates (equipment_code, status, make, …) are unused after the redesign.

DO $$
BEGIN
  -- Best-effort backfill only when legacy columns still exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'equipment_code'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET asset_code = COALESCE(NULLIF(btrim(asset_code), ''), NULLIF(btrim(equipment_code), ''), asset_code)
      WHERE NULLIF(btrim(COALESCE(asset_code, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(equipment_code, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'make'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET manufacturer = COALESCE(NULLIF(btrim(manufacturer), ''), NULLIF(btrim(make), ''))
      WHERE NULLIF(btrim(COALESCE(manufacturer, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(make, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'status'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET equipment_status = COALESCE(NULLIF(btrim(equipment_status), ''), NULLIF(btrim(status), ''))
      WHERE NULLIF(btrim(COALESCE(equipment_status, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(status, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'least_count'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET resolution_least_count = COALESCE(NULLIF(btrim(resolution_least_count), ''), NULLIF(btrim(least_count), ''))
      WHERE NULLIF(btrim(COALESCE(resolution_least_count, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(least_count, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'range_of_instrument'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET range_capacity = COALESCE(NULLIF(btrim(range_capacity), ''), NULLIF(btrim(range_of_instrument), ''))
      WHERE NULLIF(btrim(COALESCE(range_capacity, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(range_of_instrument, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'location'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET current_location = COALESCE(NULLIF(btrim(current_location), ''), NULLIF(btrim(location), ''))
      WHERE NULLIF(btrim(COALESCE(current_location, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(location, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'placed_date'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET date_placed_in_service = COALESCE(date_placed_in_service, placed_date)
      WHERE date_placed_in_service IS NULL AND placed_date IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'uncertainty_mu'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET calibration_certificate_uncertainty = COALESCE(
        NULLIF(btrim(calibration_certificate_uncertainty), ''),
        uncertainty_mu::text
      )
      WHERE NULLIF(btrim(COALESCE(calibration_certificate_uncertainty, '')), '') IS NULL
        AND uncertainty_mu IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'acceptance_criteria'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET accuracy_acceptance_criteria = COALESCE(
        NULLIF(btrim(accuracy_acceptance_criteria), ''),
        acceptance_criteria::text
      )
      WHERE NULLIF(btrim(COALESCE(accuracy_acceptance_criteria, '')), '') IS NULL
        AND acceptance_criteria IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'remarks'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET history_of_damage = COALESCE(NULLIF(btrim(history_of_damage), ''), NULLIF(btrim(remarks), ''))
      WHERE NULLIF(btrim(COALESCE(history_of_damage, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(remarks, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'calibration_link'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET upload_certificate_path = COALESCE(
        NULLIF(btrim(upload_certificate_path), ''),
        NULLIF(btrim(calibration_link), '')
      )
      WHERE NULLIF(btrim(COALESCE(upload_certificate_path, '')), '') IS NULL
        AND NULLIF(btrim(COALESCE(calibration_link, '')), '') IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'model_serial_no'
  ) THEN
    EXECUTE $sql$
      UPDATE public.equipment_master
      SET
        model_number = CASE
          WHEN NULLIF(btrim(COALESCE(model_number, '')), '') IS NOT NULL THEN model_number
          WHEN NULLIF(btrim(COALESCE(model_serial_no, '')), '') IS NULL THEN model_number
          WHEN position('/' in model_serial_no) > 0 THEN btrim(split_part(model_serial_no, '/', 1))
          ELSE btrim(model_serial_no)
        END,
        serial_number = CASE
          WHEN NULLIF(btrim(COALESCE(serial_number, '')), '') IS NOT NULL THEN serial_number
          WHEN NULLIF(btrim(COALESCE(model_serial_no, '')), '') IS NULL THEN serial_number
          WHEN position('/' in model_serial_no) > 0 THEN btrim(split_part(model_serial_no, '/', 2))
          ELSE serial_number
        END
      WHERE NULLIF(btrim(COALESCE(model_serial_no, '')), '') IS NOT NULL
        AND (
          NULLIF(btrim(COALESCE(model_number, '')), '') IS NULL
          OR NULLIF(btrim(COALESCE(serial_number, '')), '') IS NULL
        )
    $sql$;
  END IF;
END $$;

ALTER TABLE public.equipment_master
  DROP COLUMN IF EXISTS equipment_code,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS make,
  DROP COLUMN IF EXISTS model_serial_no,
  DROP COLUMN IF EXISTS least_count,
  DROP COLUMN IF EXISTS range_of_instrument,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS placed_date,
  DROP COLUMN IF EXISTS uncertainty_mu,
  DROP COLUMN IF EXISTS acceptance_criteria,
  DROP COLUMN IF EXISTS remarks,
  DROP COLUMN IF EXISTS calibration_link,
  DROP COLUMN IF EXISTS intermediate_link;
