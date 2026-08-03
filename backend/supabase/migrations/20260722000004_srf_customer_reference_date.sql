-- Service Request: customer reference date on request details

ALTER TABLE public.calibration_service_requests
  ADD COLUMN IF NOT EXISTS customer_reference_date date;

COMMENT ON COLUMN public.calibration_service_requests.customer_reference_date IS
  'Date on the customer PO / enquiry / reference document.';
