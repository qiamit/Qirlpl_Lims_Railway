-- Store completed maintenance sessions (history) on equipment_master

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'equipment_master'
          AND column_name = 'maintenance_history'
    ) THEN
        ALTER TABLE public.equipment_master ADD COLUMN maintenance_history jsonb;
    END IF;
END $$;
