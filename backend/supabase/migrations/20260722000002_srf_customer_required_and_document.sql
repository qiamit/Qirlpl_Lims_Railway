-- Service Request: customer required date + customer document upload

ALTER TABLE public.calibration_service_requests
  ADD COLUMN IF NOT EXISTS customer_required_date date,
  ADD COLUMN IF NOT EXISTS customer_document_path text,
  ADD COLUMN IF NOT EXISTS customer_document_name text;

COMMENT ON COLUMN public.calibration_service_requests.customer_required_date IS
  'Date requested by the customer for completion.';
COMMENT ON COLUMN public.calibration_service_requests.required_completion_date IS
  'Lab (our) required / committed completion date.';
COMMENT ON COLUMN public.calibration_service_requests.customer_document_path IS
  'Storage path in calibration-srf-documents bucket.';
COMMENT ON COLUMN public.calibration_service_requests.customer_document_name IS
  'Original customer document file name for display.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'calibration-srf-documents',
  'calibration-srf-documents',
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

DROP POLICY IF EXISTS lims_calibration_srf_documents_select ON storage.objects;
CREATE POLICY lims_calibration_srf_documents_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'calibration-srf-documents');

DROP POLICY IF EXISTS lims_calibration_srf_documents_insert ON storage.objects;
CREATE POLICY lims_calibration_srf_documents_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'calibration-srf-documents');

DROP POLICY IF EXISTS lims_calibration_srf_documents_update ON storage.objects;
CREATE POLICY lims_calibration_srf_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'calibration-srf-documents')
  WITH CHECK (bucket_id = 'calibration-srf-documents');

DROP POLICY IF EXISTS lims_calibration_srf_documents_delete ON storage.objects;
CREATE POLICY lims_calibration_srf_documents_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'calibration-srf-documents');
