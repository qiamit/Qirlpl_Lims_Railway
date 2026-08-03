-- Management Documentation (ISO 17025 Level 1–4 document register)

CREATE TABLE IF NOT EXISTS public.management_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
    doc_number TEXT NOT NULL,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'Policy',
    revision TEXT NOT NULL DEFAULT '00',
    effective_date DATE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'under_review', 'active', 'obsolete')),
    owner_name TEXT,
    remark TEXT,
    file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT management_documents_level_doc_number_unique UNIQUE (level, doc_number)
);

CREATE INDEX IF NOT EXISTS idx_management_documents_level
    ON public.management_documents (level);

CREATE INDEX IF NOT EXISTS idx_management_documents_status
    ON public.management_documents (status);

CREATE INDEX IF NOT EXISTS idx_management_documents_created_at
    ON public.management_documents (created_at DESC);

DROP TRIGGER IF EXISTS trg_management_documents_updated_at ON public.management_documents;
CREATE TRIGGER trg_management_documents_updated_at
    BEFORE UPDATE ON public.management_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.management_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_management_documents_authenticated_all ON public.management_documents;
CREATE POLICY lims_management_documents_authenticated_all ON public.management_documents
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Storage bucket for management document PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'management-documents',
    'management-documents',
    false,
    52428800,
    ARRAY[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS lims_management_documents_files_select ON storage.objects;
CREATE POLICY lims_management_documents_files_select ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'management-documents');

DROP POLICY IF EXISTS lims_management_documents_files_insert ON storage.objects;
CREATE POLICY lims_management_documents_files_insert ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'management-documents');

DROP POLICY IF EXISTS lims_management_documents_files_update ON storage.objects;
CREATE POLICY lims_management_documents_files_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'management-documents')
    WITH CHECK (bucket_id = 'management-documents');

DROP POLICY IF EXISTS lims_management_documents_files_delete ON storage.objects;
CREATE POLICY lims_management_documents_files_delete ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'management-documents');
