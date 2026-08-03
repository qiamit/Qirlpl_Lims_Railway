-- In-app document drafting body (Option 2: Draft the Document)
ALTER TABLE public.management_documents
  ADD COLUMN IF NOT EXISTS draft_content TEXT;
