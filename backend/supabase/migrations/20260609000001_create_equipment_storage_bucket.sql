-- Migration: Create equipment-files bucket and define policies

-- 1. Create storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'equipment-files', 
    'equipment-files', 
    false, 
    52428800, -- 50MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public)
VALUES ('calibration-files', 'calibration-files', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies for equipment-files
DROP POLICY IF EXISTS lims_equipment_files_select ON storage.objects;
CREATE POLICY lims_equipment_files_select ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'equipment-files');

DROP POLICY IF EXISTS lims_equipment_files_insert ON storage.objects;
CREATE POLICY lims_equipment_files_insert ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'equipment-files');

DROP POLICY IF EXISTS lims_equipment_files_update ON storage.objects;
CREATE POLICY lims_equipment_files_update ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'equipment-files') WITH CHECK (bucket_id = 'equipment-files');

DROP POLICY IF EXISTS lims_equipment_files_delete ON storage.objects;
CREATE POLICY lims_equipment_files_delete ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'equipment-files');
