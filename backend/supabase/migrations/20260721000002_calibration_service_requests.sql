-- Calibration Handling · Service Request (ISO 17025:2017 Clause 7.1 review of requests)

CREATE TABLE IF NOT EXISTS public.calibration_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  srf_number text NOT NULL,
  srf_date date NOT NULL DEFAULT (CURRENT_DATE),
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  client_name text,
  calibration_location text NOT NULL DEFAULT 'In Lab'
    CHECK (calibration_location IN ('In Lab', 'On Site')),
  equipment_description text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  required_completion_date date,
  -- Clause 7.1 review checklist
  req_defined_understood boolean NOT NULL DEFAULT false,
  capability_resources_ok boolean NOT NULL DEFAULT false,
  external_provider_used boolean NOT NULL DEFAULT false,
  external_provider_customer_approved boolean NOT NULL DEFAULT false,
  external_provider_details text,
  methods_selected_ok boolean NOT NULL DEFAULT false,
  method_notes text,
  method_outdated_customer_informed boolean NOT NULL DEFAULT false,
  statement_of_conformity_requested boolean NOT NULL DEFAULT false,
  specification_standard text,
  decision_rule text,
  differences_resolved boolean NOT NULL DEFAULT false,
  contract_accepted boolean NOT NULL DEFAULT false,
  deviations_customer_informed boolean NOT NULL DEFAULT false,
  review_remarks text,
  status text NOT NULL DEFAULT 'Under Review'
    CHECK (status IN ('Draft', 'Under Review', 'Accepted', 'Rejected', 'Closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calibration_service_requests_srf_number_key UNIQUE (srf_number)
);

CREATE INDEX IF NOT EXISTS idx_calibration_service_requests_srf_date
  ON public.calibration_service_requests (srf_date DESC);

CREATE INDEX IF NOT EXISTS idx_calibration_service_requests_client_id
  ON public.calibration_service_requests (client_id);

CREATE INDEX IF NOT EXISTS idx_calibration_service_requests_status
  ON public.calibration_service_requests (status);

DROP TRIGGER IF EXISTS trg_calibration_service_requests_updated_at
  ON public.calibration_service_requests;
CREATE TRIGGER trg_calibration_service_requests_updated_at
  BEFORE UPDATE ON public.calibration_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.calibration_service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_calibration_service_requests_authenticated_all
  ON public.calibration_service_requests;
CREATE POLICY lims_calibration_service_requests_authenticated_all
  ON public.calibration_service_requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.calibration_service_requests IS
  'Calibration Handling — Service Request with ISO 17025 Clause 7.1 contract review fields.';
