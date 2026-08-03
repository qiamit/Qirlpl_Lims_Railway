-- Document control: revision/issue/amendment/sign-off + version history

-- 1) Extend master list columns
ALTER TABLE public.management_documents
  ADD COLUMN IF NOT EXISTS revision_no TEXT,
  ADD COLUMN IF NOT EXISTS revision_date DATE,
  ADD COLUMN IF NOT EXISTS issue_no TEXT,
  ADD COLUMN IF NOT EXISTS issue_date DATE,
  ADD COLUMN IF NOT EXISTS amendment_no TEXT,
  ADD COLUMN IF NOT EXISTS amendment_date DATE,
  ADD COLUMN IF NOT EXISTS prepared_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

-- Backfill from legacy columns
UPDATE public.management_documents
SET
  revision_no = COALESCE(NULLIF(revision_no, ''), NULLIF(revision, ''), '00'),
  revision_date = COALESCE(revision_date, effective_date),
  issue_no = COALESCE(NULLIF(issue_no, ''), '00'),
  amendment_no = COALESCE(NULLIF(amendment_no, ''), '00')
WHERE TRUE;

ALTER TABLE public.management_documents
  ALTER COLUMN revision_no SET DEFAULT '00',
  ALTER COLUMN issue_no SET DEFAULT '00',
  ALTER COLUMN amendment_no SET DEFAULT '00';

UPDATE public.management_documents
SET revision_no = '00'
WHERE revision_no IS NULL;

ALTER TABLE public.management_documents
  ALTER COLUMN revision_no SET NOT NULL;

-- Drop legacy columns after backfill
ALTER TABLE public.management_documents
  DROP COLUMN IF EXISTS revision,
  DROP COLUMN IF EXISTS effective_date;

-- 2) Version history (audit trail)
CREATE TABLE IF NOT EXISTS public.management_document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.management_documents(id) ON DELETE CASCADE,
    doc_number TEXT NOT NULL,
    title TEXT NOT NULL,
    doc_type TEXT,
    status TEXT,
    revision_no TEXT,
    revision_date DATE,
    issue_no TEXT,
    issue_date DATE,
    amendment_no TEXT,
    amendment_date DATE,
    prepared_by TEXT,
    reviewed_by TEXT,
    approved_by TEXT,
    owner_name TEXT,
    remark TEXT,
    file_path TEXT,
    change_type TEXT NOT NULL
        CHECK (change_type IN ('revision', 'issue', 'amendment', 'manual_save')),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_management_document_versions_document_id
    ON public.management_document_versions (document_id);

CREATE INDEX IF NOT EXISTS idx_management_document_versions_changed_at
    ON public.management_document_versions (changed_at DESC);

ALTER TABLE public.management_document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_management_document_versions_authenticated_all
    ON public.management_document_versions;
CREATE POLICY lims_management_document_versions_authenticated_all
    ON public.management_document_versions
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
