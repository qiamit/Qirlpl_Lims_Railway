-- Sample retention & disposal (90 days from test report issue per ISO 17025 lab practice)
ALTER TABLE samples
  ADD COLUMN IF NOT EXISTS sample_retention_due_date date,
  ADD COLUMN IF NOT EXISTS quantity_retained text,
  ADD COLUMN IF NOT EXISTS quantity_disposed text,
  ADD COLUMN IF NOT EXISTS sample_disposed_at date,
  ADD COLUMN IF NOT EXISTS sample_disposal_outcome text,
  ADD COLUMN IF NOT EXISTS sample_retention_status text;

COMMENT ON COLUMN samples.sample_retention_due_date IS 'Retention end date: test_report_issued_at + 90 days';
COMMENT ON COLUMN samples.quantity_retained IS 'Quantity retained in lab during retention period';
COMMENT ON COLUMN samples.quantity_disposed IS 'Quantity disposed or returned quantity recorded at closure';
COMMENT ON COLUMN samples.sample_disposed_at IS 'Date sample was disposed or returned to customer';
COMMENT ON COLUMN samples.sample_disposal_outcome IS 'disposed | returned_to_customer';
COMMENT ON COLUMN samples.sample_retention_status IS 'retained | due | disposed | returned';

-- Backfill issued SRFs
UPDATE samples
SET
  sample_retention_due_date = (test_report_issued_at::date + interval '90 days')::date,
  sample_retention_status = COALESCE(NULLIF(trim(sample_retention_status), ''), 'retained'),
  quantity_retained = COALESCE(NULLIF(trim(quantity_retained), ''), NULLIF(trim(sample_quantity), ''))
WHERE stage = 'completed'
  AND test_report_issued_at IS NOT NULL
  AND sample_retention_due_date IS NULL;
