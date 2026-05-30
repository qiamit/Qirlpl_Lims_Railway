-- Sample handling: ISO 17025 Clause 7.8 — test report preparation stage & optional report metadata.
-- If `samples.stage` is a PostgreSQL ENUM, add 'report_preparation' to that type in the Supabase SQL editor
-- before relying on this migration (e.g. ALTER TYPE ... ADD VALUE 'report_preparation').

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS test_report_number text,
  ADD COLUMN IF NOT EXISTS test_report_draft_notes text,
  ADD COLUMN IF NOT EXISTS test_report_issued_at timestamptz;

COMMENT ON COLUMN public.samples.test_report_number IS 'Issued test report identifier (Clause 7.8)';
COMMENT ON COLUMN public.samples.test_report_draft_notes IS 'Internal notes during test report preparation';
COMMENT ON COLUMN public.samples.test_report_issued_at IS 'When the test report was marked issued / finalized';
