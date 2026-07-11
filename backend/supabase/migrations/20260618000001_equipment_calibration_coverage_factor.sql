-- Add calibration coverage factor to equipment_master

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'calibration_coverage_factor'
    ) THEN
        ALTER TABLE public.equipment_master ADD COLUMN calibration_coverage_factor text;
    END IF;
END $$;
