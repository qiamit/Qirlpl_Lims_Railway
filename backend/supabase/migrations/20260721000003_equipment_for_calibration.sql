-- Equipment used TO calibrate (reference / working standards) — Calibration LIMS
-- Distinct from equipment_master UUC items in "Calibration Equipments"

CREATE TABLE IF NOT EXISTS public.equipment_for_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL,
  equipment_name text NOT NULL,
  manufacturer text,
  model_number text,
  serial_number text,
  current_location text,
  equipment_status text NOT NULL DEFAULT 'Active'
    CHECK (equipment_status IN ('Active', 'In Repair', 'Idle')),
  range_capacity text,
  resolution_least_count text,
  accuracy_acceptance_criteria text,
  -- Calibration
  calibration_frequency text,
  last_calibration_date date,
  next_calibration_due date,
  calibration_certificate_number text,
  calibration_certificate_uncertainty text,
  calibration_uncertainty_unit text,
  calibration_coverage_factor text,
  external_calibration_agency_name text,
  -- Intermediate check
  intermediate_check_frequency text,
  last_intermediate_check_date date,
  next_intermediate_check_date date,
  intermediate_check_result text,
  -- Maintenance
  maintenance_schedule_frequency text,
  last_maintenance_date date,
  next_maintenance_date date,
  maintenance_done_by text,
  -- Calibration points (nominal / actual / correction / uncertainty)
  calibration_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_for_calibration_asset_code_key UNIQUE (asset_code)
);

CREATE INDEX IF NOT EXISTS idx_equipment_for_calibration_name
  ON public.equipment_for_calibration (equipment_name);

CREATE INDEX IF NOT EXISTS idx_equipment_for_calibration_status
  ON public.equipment_for_calibration (equipment_status);

DROP TRIGGER IF EXISTS trg_equipment_for_calibration_updated_at
  ON public.equipment_for_calibration;
CREATE TRIGGER trg_equipment_for_calibration_updated_at
  BEFORE UPDATE ON public.equipment_for_calibration
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.equipment_for_calibration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_equipment_for_calibration_authenticated_all
  ON public.equipment_for_calibration;
CREATE POLICY lims_equipment_for_calibration_authenticated_all
  ON public.equipment_for_calibration
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.equipment_for_calibration IS
  'Calibration LIMS — standards / equipment used TO perform calibration (incl. calibration points).';
