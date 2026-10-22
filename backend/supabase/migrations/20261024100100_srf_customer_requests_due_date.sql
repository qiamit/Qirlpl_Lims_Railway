-- ISO/IEC 17025:2017 clause 7.8.4.3 (gap item P1-12): a calibration certificate
-- must not recommend a calibration interval / due date unless this has been
-- agreed with the customer.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks.
--
-- Adds the customer's request to the Calibration Service Request Form (SRF):
--   * customer_requests_due_date: true only when the customer asked for a
--     recommended calibration due date on the certificate. Defaults to false;
--     existing SRFs are NOT backfilled to true, so certificates for them stop
--     printing a due date until the SRF is updated.
--   * due_date_interval: optional interval the customer asked for
--     (e.g. 'Yearly', 'Half Yearly', '180 Days'). Blank = use the job's
--     Raw Data Sheet frequency (default Yearly).
--
-- Idempotent: safe to run more than once. The frontend treats a missing column
-- as false, so it keeps working before this is applied.

ALTER TABLE public.calibration_service_requests
  ADD COLUMN IF NOT EXISTS customer_requests_due_date boolean NOT NULL DEFAULT false;

ALTER TABLE public.calibration_service_requests
  ADD COLUMN IF NOT EXISTS due_date_interval text;

COMMENT ON COLUMN public.calibration_service_requests.customer_requests_due_date IS
  'ISO 17025 7.8.4.3: customer asked for a recommended calibration due date on the certificate. When false the certificate prints no due date.';

COMMENT ON COLUMN public.calibration_service_requests.due_date_interval IS
  'Calibration interval the customer asked for (e.g. Yearly, Half Yearly, 180 Days). Blank = Raw Data Sheet frequency.';

NOTIFY pgrst, 'reload schema';
