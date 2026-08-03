-- Allow Yes / No / N/A (null) for ISO 17025 review check columns on service requests.
ALTER TABLE public.calibration_service_requests
  ALTER COLUMN req_defined_understood DROP NOT NULL,
  ALTER COLUMN capability_resources_ok DROP NOT NULL,
  ALTER COLUMN external_provider_used DROP NOT NULL,
  ALTER COLUMN external_provider_customer_approved DROP NOT NULL,
  ALTER COLUMN methods_selected_ok DROP NOT NULL,
  ALTER COLUMN method_outdated_customer_informed DROP NOT NULL,
  ALTER COLUMN differences_resolved DROP NOT NULL,
  ALTER COLUMN contract_accepted DROP NOT NULL,
  ALTER COLUMN deviations_customer_informed DROP NOT NULL;
