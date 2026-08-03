-- Service Request: customer reference number on request details

ALTER TABLE public.calibration_service_requests
  ADD COLUMN IF NOT EXISTS customer_reference_no text;

COMMENT ON COLUMN public.calibration_service_requests.customer_reference_no IS
  'Customer reference / PO / enquiry number from the client.';
