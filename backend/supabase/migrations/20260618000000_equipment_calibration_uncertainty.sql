-- Add calibration certificate uncertainty fields to equipment_master

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'calibration_certificate_uncertainty'
    ) THEN
        ALTER TABLE public.equipment_master ADD COLUMN calibration_certificate_uncertainty text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'calibration_uncertainty_unit'
    ) THEN
        ALTER TABLE public.equipment_master ADD COLUMN calibration_uncertainty_unit text;
    END IF;
END $$;
