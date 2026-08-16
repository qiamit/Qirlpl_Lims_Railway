-- Per-field evidence attachments for NC action form

ALTER TABLE public.audit_nc_actions
  ADD COLUMN IF NOT EXISTS evidence_by_field JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audit-nc-evidence',
  'audit-nc-evidence',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lims_audit_nc_evidence_select ON storage.objects;
CREATE POLICY lims_audit_nc_evidence_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'audit-nc-evidence');

DROP POLICY IF EXISTS lims_audit_nc_evidence_insert ON storage.objects;
CREATE POLICY lims_audit_nc_evidence_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audit-nc-evidence');

DROP POLICY IF EXISTS lims_audit_nc_evidence_update ON storage.objects;
CREATE POLICY lims_audit_nc_evidence_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'audit-nc-evidence')
  WITH CHECK (bucket_id = 'audit-nc-evidence');

DROP POLICY IF EXISTS lims_audit_nc_evidence_delete ON storage.objects;
CREATE POLICY lims_audit_nc_evidence_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'audit-nc-evidence');
