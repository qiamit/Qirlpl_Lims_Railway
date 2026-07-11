-- Persist uncertainty calculation worksheet on test_parameters

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'test_parameters' AND column_name = 'uncertainty_calculation_data'
    ) THEN
        ALTER TABLE public.test_parameters ADD COLUMN uncertainty_calculation_data jsonb;
    END IF;
END $$;
