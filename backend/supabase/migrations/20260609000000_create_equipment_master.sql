-- Migration: Create or Update equipment_master table safely and set RLS

-- 1. Create table if not exists with ID
CREATE TABLE IF NOT EXISTS public.equipment_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- 2. Safely add missing columns and constraints using PL/pgSQL
DO $$
BEGIN
    -- asset_code (text, unique, not null)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'asset_code') THEN
        ALTER TABLE public.equipment_master ADD COLUMN asset_code text NOT NULL;
        ALTER TABLE public.equipment_master ADD CONSTRAINT equipment_master_asset_code_key UNIQUE (asset_code);
    END IF;

    -- equipment_name (text, not null)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'equipment_name') THEN
        ALTER TABLE public.equipment_master ADD COLUMN equipment_name text NOT NULL;
    END IF;

    -- manufacturer (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'manufacturer') THEN
        ALTER TABLE public.equipment_master ADD COLUMN manufacturer text;
    END IF;

    -- model_number (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'model_number') THEN
        ALTER TABLE public.equipment_master ADD COLUMN model_number text;
    END IF;

    -- serial_number (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'serial_number') THEN
        ALTER TABLE public.equipment_master ADD COLUMN serial_number text;
    END IF;

    -- date_of_purchase (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'date_of_purchase') THEN
        ALTER TABLE public.equipment_master ADD COLUMN date_of_purchase date;
    END IF;

    -- purchased_from (uuid referencing clients(id))
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'purchased_from') THEN
        ALTER TABLE public.equipment_master ADD COLUMN purchased_from uuid REFERENCES public.clients(id);
    END IF;

    -- date_placed_in_service (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'date_placed_in_service') THEN
        ALTER TABLE public.equipment_master ADD COLUMN date_placed_in_service date;
    END IF;

    -- current_location (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'current_location') THEN
        ALTER TABLE public.equipment_master ADD COLUMN current_location text;
    END IF;

    -- equipment_status (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'equipment_status') THEN
        ALTER TABLE public.equipment_master ADD COLUMN equipment_status text;
    END IF;

    -- range_capacity (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'range_capacity') THEN
        ALTER TABLE public.equipment_master ADD COLUMN range_capacity text;
    END IF;

    -- resolution_least_count (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'resolution_least_count') THEN
        ALTER TABLE public.equipment_master ADD COLUMN resolution_least_count text;
    END IF;

    -- accuracy_acceptance_criteria (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'accuracy_acceptance_criteria') THEN
        ALTER TABLE public.equipment_master ADD COLUMN accuracy_acceptance_criteria text;
    END IF;

    -- calibration_frequency (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'calibration_frequency') THEN
        ALTER TABLE public.equipment_master ADD COLUMN calibration_frequency text;
    END IF;

    -- last_calibration_date (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'last_calibration_date') THEN
        ALTER TABLE public.equipment_master ADD COLUMN last_calibration_date date;
    END IF;

    -- next_calibration_due (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'next_calibration_due') THEN
        ALTER TABLE public.equipment_master ADD COLUMN next_calibration_due date;
    END IF;

    -- calibration_certificate_number (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'calibration_certificate_number') THEN
        ALTER TABLE public.equipment_master ADD COLUMN calibration_certificate_number text;
    END IF;

    -- external_calibration_agency (uuid referencing clients(id))
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'external_calibration_agency') THEN
        ALTER TABLE public.equipment_master ADD COLUMN external_calibration_agency uuid REFERENCES public.clients(id);
    END IF;

    -- intermediate_check_frequency (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'intermediate_check_frequency') THEN
        ALTER TABLE public.equipment_master ADD COLUMN intermediate_check_frequency text;
    END IF;

    -- last_intermediate_check_date (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'last_intermediate_check_date') THEN
        ALTER TABLE public.equipment_master ADD COLUMN last_intermediate_check_date date;
    END IF;

    -- next_intermediate_check_date (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'next_intermediate_check_date') THEN
        ALTER TABLE public.equipment_master ADD COLUMN next_intermediate_check_date date;
    END IF;

    -- intermediate_check_result (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'intermediate_check_result') THEN
        ALTER TABLE public.equipment_master ADD COLUMN intermediate_check_result text;
    END IF;

    -- maintenance_schedule_frequency (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'maintenance_schedule_frequency') THEN
        ALTER TABLE public.equipment_master ADD COLUMN maintenance_schedule_frequency text;
    END IF;

    -- last_maintenance_date (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'last_maintenance_date') THEN
        ALTER TABLE public.equipment_master ADD COLUMN last_maintenance_date date;
    END IF;

    -- next_maintenance_date (date)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'next_maintenance_date') THEN
        ALTER TABLE public.equipment_master ADD COLUMN next_maintenance_date date;
    END IF;

    -- maintenance_done_by (uuid referencing user_profiles(id))
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'maintenance_done_by') THEN
        ALTER TABLE public.equipment_master ADD COLUMN maintenance_done_by uuid REFERENCES public.user_profiles(id);
    END IF;

    -- history_of_damage (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'history_of_damage') THEN
        ALTER TABLE public.equipment_master ADD COLUMN history_of_damage text;
    END IF;

    -- upload_certificate_path (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'upload_certificate_path') THEN
        ALTER TABLE public.equipment_master ADD COLUMN upload_certificate_path text;
    END IF;

    -- upload_manual_sop_path (text)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'upload_manual_sop_path') THEN
        ALTER TABLE public.equipment_master ADD COLUMN upload_manual_sop_path text;
    END IF;

    -- custodian_employee_id (uuid referencing user_profiles(id))
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'custodian_employee_id') THEN
        ALTER TABLE public.equipment_master ADD COLUMN custodian_employee_id uuid REFERENCES public.user_profiles(id);
    END IF;

    -- created_at (timestamp with time zone, default now())
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'created_at') THEN
        ALTER TABLE public.equipment_master ADD COLUMN created_at timestamp with time zone DEFAULT now();
    END IF;

    -- updated_at (timestamp with time zone, default now())
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'equipment_master' AND column_name = 'updated_at') THEN
        ALTER TABLE public.equipment_master ADD COLUMN updated_at timestamp with time zone DEFAULT now();
    END IF;
END $$;

-- 3. Set up triggers for updated_at
DROP TRIGGER IF EXISTS trg_equipment_master_updated_at ON public.equipment_master;
CREATE TRIGGER trg_equipment_master_updated_at
    BEFORE UPDATE ON public.equipment_master
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.equipment_master ENABLE ROW LEVEL SECURITY;

-- 5. Add RLS policy for authenticated users
DROP POLICY IF EXISTS lims_equipment_master_authenticated_all ON public.equipment_master;
CREATE POLICY lims_equipment_master_authenticated_all ON public.equipment_master
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
