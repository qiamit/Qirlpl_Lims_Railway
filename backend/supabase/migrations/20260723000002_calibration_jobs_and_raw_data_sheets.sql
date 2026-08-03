-- Calibration Handling — per-DUC jobs + 1:1 raw data sheets (Inside / Outside pipelines)

CREATE TABLE IF NOT EXISTS public.calibration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL
    REFERENCES public.calibration_service_requests (id) ON DELETE CASCADE,
  equipment_line_index integer NOT NULL CHECK (equipment_line_index >= 0),
  srf_number text NOT NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  client_name text,
  equipment_label text NOT NULL DEFAULT '',
  equipment_detail text NOT NULL DEFAULT '',
  calibration_location text NOT NULL DEFAULT 'In Lab'
    CHECK (calibration_location IN ('In Lab', 'On Site')),
  stage text NOT NULL
    CHECK (stage IN (
      'inside_receiving',
      'inside_verification',
      'inside_raw_data',
      'inside_review',
      'inside_certificate',
      'outside_master_dispatch',
      'outside_site_raw_data',
      'outside_master_return',
      'outside_review',
      'outside_certificate'
    )),
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calibration_jobs_srf_line_key UNIQUE (service_request_id, equipment_line_index)
);

CREATE INDEX IF NOT EXISTS idx_calibration_jobs_stage
  ON public.calibration_jobs (stage);

CREATE INDEX IF NOT EXISTS idx_calibration_jobs_srf_number
  ON public.calibration_jobs (srf_number);

CREATE INDEX IF NOT EXISTS idx_calibration_jobs_location
  ON public.calibration_jobs (calibration_location);

CREATE INDEX IF NOT EXISTS idx_calibration_jobs_service_request_id
  ON public.calibration_jobs (service_request_id);

DROP TRIGGER IF EXISTS trg_calibration_jobs_updated_at ON public.calibration_jobs;
CREATE TRIGGER trg_calibration_jobs_updated_at
  BEFORE UPDATE ON public.calibration_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.calibration_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_calibration_jobs_authenticated_all
  ON public.calibration_jobs;
CREATE POLICY lims_calibration_jobs_authenticated_all
  ON public.calibration_jobs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.calibration_jobs IS
  'Calibration Handling — one job per DUC/equipment line; stage drives Inside/Outside pipeline pages.';

-- 1:1 raw data sheet per DUC job (Inside and Outside)
CREATE TABLE IF NOT EXISTS public.calibration_raw_data_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_job_id uuid NOT NULL UNIQUE
    REFERENCES public.calibration_jobs (id) ON DELETE CASCADE,
  sheet_status text NOT NULL DEFAULT 'draft'
    CHECK (sheet_status IN ('draft', 'under_review', 'approved')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_raw_data_sheets_status
  ON public.calibration_raw_data_sheets (sheet_status);

DROP TRIGGER IF EXISTS trg_calibration_raw_data_sheets_updated_at
  ON public.calibration_raw_data_sheets;
CREATE TRIGGER trg_calibration_raw_data_sheets_updated_at
  BEFORE UPDATE ON public.calibration_raw_data_sheets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.calibration_raw_data_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_calibration_raw_data_sheets_authenticated_all
  ON public.calibration_raw_data_sheets;
CREATE POLICY lims_calibration_raw_data_sheets_authenticated_all
  ON public.calibration_raw_data_sheets
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.calibration_raw_data_sheets IS
  'Per-DUC calibration raw data sheet (1:1 with calibration_jobs).';
