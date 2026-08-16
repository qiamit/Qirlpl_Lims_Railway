-- ISO 17025 §7.10 Nonconforming Work: responsibilities, records, CAPA

-- 1) Responsibilities & Authorities matrix (§7.10.1 a, f)
CREATE TABLE IF NOT EXISTS public.nc_work_responsibility_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_label text NOT NULL,
  authority_type text NOT NULL DEFAULT 'manage_nc',
  employee_id uuid,
  employee_name text,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nc_work_responsibility_matrix_authority_check CHECK (
    authority_type = ANY (ARRAY['manage_nc'::text, 'authorize_resumption'::text, 'both'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_nc_work_resp_active
  ON public.nc_work_responsibility_matrix (is_active);

DROP TRIGGER IF EXISTS trg_nc_work_responsibility_matrix_updated_at ON public.nc_work_responsibility_matrix;
CREATE TRIGGER trg_nc_work_responsibility_matrix_updated_at
  BEFORE UPDATE ON public.nc_work_responsibility_matrix
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nc_work_responsibility_matrix ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_nc_work_responsibility_matrix_authenticated_all
  ON public.nc_work_responsibility_matrix;
CREATE POLICY lims_nc_work_responsibility_matrix_authenticated_all
  ON public.nc_work_responsibility_matrix
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2) Nonconforming work records (§7.10.1 b–f / 7.10.2)
CREATE TABLE IF NOT EXISTS public.nc_work_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  reported_by_employee_id uuid,
  reported_by_name text,
  source_area text NOT NULL DEFAULT 'Other',
  equipment_or_activity text,
  description text NOT NULL DEFAULT '',
  risk_level text NOT NULL DEFAULT 'Medium',
  actions_taken text,
  significance_evaluation text,
  impact_on_previous_results text,
  acceptability_decision text NOT NULL DEFAULT 'pending',
  customer_notified boolean NOT NULL DEFAULT false,
  customer_notify_details text,
  work_recalled boolean NOT NULL DEFAULT false,
  resumption_authorized_by_employee_id uuid,
  resumption_authorized_by_name text,
  resumption_authorized_at timestamptz,
  status text NOT NULL DEFAULT 'Open',
  corrective_action_required boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nc_work_records_nc_id_key UNIQUE (nc_id),
  CONSTRAINT nc_work_records_source_area_check CHECK (
    source_area = ANY (
      ARRAY[
        'Testing'::text,
        'Calibration'::text,
        'Sample Handling'::text,
        'Other'::text
      ]
    )
  ),
  CONSTRAINT nc_work_records_risk_check CHECK (
    risk_level = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])
  ),
  CONSTRAINT nc_work_records_acceptability_check CHECK (
    acceptability_decision = ANY (
      ARRAY['pending'::text, 'accepted'::text, 'not_accepted'::text]
    )
  ),
  CONSTRAINT nc_work_records_status_check CHECK (
    status = ANY (
      ARRAY[
        'Open'::text,
        'Under Evaluation'::text,
        'Decision Pending'::text,
        'Closed'::text,
        'CAPA Required'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_nc_work_records_detected_at
  ON public.nc_work_records (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_nc_work_records_status
  ON public.nc_work_records (status);
CREATE INDEX IF NOT EXISTS idx_nc_work_records_capa
  ON public.nc_work_records (corrective_action_required);

DROP TRIGGER IF EXISTS trg_nc_work_records_updated_at ON public.nc_work_records;
CREATE TRIGGER trg_nc_work_records_updated_at
  BEFORE UPDATE ON public.nc_work_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nc_work_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_nc_work_records_authenticated_all ON public.nc_work_records;
CREATE POLICY lims_nc_work_records_authenticated_all ON public.nc_work_records
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3) NCW CAPA (§7.10.3) — mirrors audit_nc_actions field shape
CREATE TABLE IF NOT EXISTS public.nc_work_corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_work_record_id uuid NOT NULL REFERENCES public.nc_work_records (id) ON DELETE CASCADE,
  description_of_nc text NOT NULL DEFAULT '',
  immediate_correction text NOT NULL DEFAULT '',
  root_cause_analysis text NOT NULL DEFAULT '',
  extent_check text NOT NULL DEFAULT '',
  corrective_action_plan text NOT NULL DEFAULT '',
  corrective_action_implemented text NOT NULL DEFAULT '',
  review_of_effectiveness text NOT NULL DEFAULT '',
  risk_opportunity_review text NOT NULL DEFAULT '',
  changes_to_management_system text NOT NULL DEFAULT '',
  objective_evidence text NOT NULL DEFAULT '',
  verification_closure text NOT NULL DEFAULT '',
  evidence_by_field jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_authors jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nc_work_corrective_actions_record_unique UNIQUE (nc_work_record_id)
);

CREATE INDEX IF NOT EXISTS idx_nc_work_corrective_actions_record
  ON public.nc_work_corrective_actions (nc_work_record_id);

DROP TRIGGER IF EXISTS trg_nc_work_corrective_actions_updated_at ON public.nc_work_corrective_actions;
CREATE TRIGGER trg_nc_work_corrective_actions_updated_at
  BEFORE UPDATE ON public.nc_work_corrective_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nc_work_corrective_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_nc_work_corrective_actions_authenticated_all
  ON public.nc_work_corrective_actions;
CREATE POLICY lims_nc_work_corrective_actions_authenticated_all
  ON public.nc_work_corrective_actions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
