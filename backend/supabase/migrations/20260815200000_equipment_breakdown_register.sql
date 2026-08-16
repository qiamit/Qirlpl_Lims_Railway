-- Equipment Breakdown Register (ISO 17025 §6.4) — downtime, repair, return-to-service

CREATE TABLE IF NOT EXISTS public.equipment_breakdown_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_no text NOT NULL,
  equipment_source text NOT NULL DEFAULT 'testing',
  equipment_id uuid,
  asset_code text NOT NULL,
  equipment_name text NOT NULL,
  manufacturer text,
  model_number text,
  serial_number text,
  current_location text,
  breakdown_date date NOT NULL,
  breakdown_time time without time zone,
  reported_by_employee_id uuid,
  reported_by_name text,
  nature_of_breakdown text NOT NULL DEFAULT '',
  symptoms text,
  impact_on_work text,
  immediate_action text,
  downtime_from timestamptz,
  downtime_to timestamptz,
  repair_action text,
  repaired_by text,
  spare_parts_used text,
  repair_cost numeric,
  status text NOT NULL DEFAULT 'Open',
  return_to_service_date date,
  authorized_by_employee_id uuid,
  authorized_by_name text,
  verification_notes text,
  post_repair_check_required boolean NOT NULL DEFAULT true,
  post_repair_check_done boolean NOT NULL DEFAULT false,
  remarks text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_breakdown_register_register_no_key UNIQUE (register_no),
  CONSTRAINT equipment_breakdown_register_source_check CHECK (
    equipment_source = ANY (ARRAY['testing'::text, 'calibration'::text])
  ),
  CONSTRAINT equipment_breakdown_register_status_check CHECK (
    status = ANY (
      ARRAY[
        'Open'::text,
        'Under Repair'::text,
        'Awaiting Verification'::text,
        'Closed'::text,
        'Scrapped'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_equipment_breakdown_register_date
  ON public.equipment_breakdown_register (breakdown_date DESC);

CREATE INDEX IF NOT EXISTS idx_equipment_breakdown_register_asset
  ON public.equipment_breakdown_register (asset_code);

CREATE INDEX IF NOT EXISTS idx_equipment_breakdown_register_status
  ON public.equipment_breakdown_register (status);

CREATE INDEX IF NOT EXISTS idx_equipment_breakdown_register_equipment
  ON public.equipment_breakdown_register (equipment_source, equipment_id);

DROP TRIGGER IF EXISTS trg_equipment_breakdown_register_updated_at ON public.equipment_breakdown_register;
CREATE TRIGGER trg_equipment_breakdown_register_updated_at
  BEFORE UPDATE ON public.equipment_breakdown_register
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.equipment_breakdown_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_equipment_breakdown_register_authenticated_all
  ON public.equipment_breakdown_register;
CREATE POLICY lims_equipment_breakdown_register_authenticated_all
  ON public.equipment_breakdown_register
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.equipment_breakdown_register IS
  'Equipment breakdown / downtime register with repair actions and return-to-service authorization (ISO 17025 §6.4)';
