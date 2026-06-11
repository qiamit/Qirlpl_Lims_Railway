-- Migration: Create iqc_masters table, triggers, and add prefix

-- 1. Create table if not exists with ID
CREATE TABLE IF NOT EXISTS public.iqc_masters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_code text NOT NULL UNIQUE,
    equipment_name text NOT NULL,
    manufacturer text,
    model_number text,
    serial_number text,
    date_of_purchase date,
    purchased_from uuid REFERENCES public.clients(id),
    date_placed_in_service date,
    current_location text,
    equipment_status text,
    range_capacity text,
    resolution_least_count text,
    accuracy_acceptance_criteria text,
    calibration_frequency text,
    last_calibration_date date,
    next_calibration_due date,
    calibration_certificate_number text,
    external_calibration_agency uuid REFERENCES public.clients(id),
    intermediate_check_frequency text,
    last_intermediate_check_date date,
    next_intermediate_check_date date,
    intermediate_check_result text,
    maintenance_schedule_frequency text,
    last_maintenance_date date,
    next_maintenance_date date,
    maintenance_done_by uuid REFERENCES public.user_profiles(id),
    history_of_damage text,
    upload_certificate_path text,
    upload_manual_sop_path text,
    custodian_employee_id uuid REFERENCES public.user_profiles(id),
    calibration_points jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. Set up triggers for updated_at
DROP TRIGGER IF EXISTS trg_iqc_masters_updated_at ON public.iqc_masters;
CREATE TRIGGER trg_iqc_masters_updated_at
    BEFORE UPDATE ON public.iqc_masters
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.iqc_masters ENABLE ROW LEVEL SECURITY;

-- 4. Add RLS policy for authenticated users
DROP POLICY IF EXISTS lims_iqc_masters_authenticated_all ON public.iqc_masters;
CREATE POLICY lims_iqc_masters_authenticated_all ON public.iqc_masters
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 5. Insert LIMS prefix for IQC Master ID safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.lab_prefixes WHERE name = 'IQC Master ID') THEN
        INSERT INTO public.lab_prefixes (name, prefix, last_number)
        VALUES ('IQC Master ID', 'QI/IQC-', 0);
    END IF;
END $$;
