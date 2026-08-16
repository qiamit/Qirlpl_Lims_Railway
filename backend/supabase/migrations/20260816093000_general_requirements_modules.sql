-- ISO 17025 General Requirements + related management system registers

-- 4.1 Impartiality — risks to impartiality & mitigation
CREATE TABLE IF NOT EXISTS public.gr_impartiality_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id text NOT NULL,
  identified_at date NOT NULL DEFAULT CURRENT_DATE,
  risk_description text NOT NULL DEFAULT '',
  risk_source text NOT NULL DEFAULT 'Activities',
  relationship_details text,
  mitigation_actions text,
  residual_risk text,
  reviewed_by_name text,
  status text NOT NULL DEFAULT 'Open',
  next_review_date date,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gr_impartiality_risks_risk_id_key UNIQUE (risk_id),
  CONSTRAINT gr_impartiality_risks_source_check CHECK (
    risk_source = ANY (ARRAY['Activities'::text, 'Relationships'::text, 'Personnel'::text, 'Other'::text])
  ),
  CONSTRAINT gr_impartiality_risks_status_check CHECK (
    status = ANY (ARRAY['Open'::text, 'Mitigated'::text, 'Closed'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_gr_impartiality_status ON public.gr_impartiality_risks (status);

DROP TRIGGER IF EXISTS trg_gr_impartiality_risks_updated_at ON public.gr_impartiality_risks;
CREATE TRIGGER trg_gr_impartiality_risks_updated_at
  BEFORE UPDATE ON public.gr_impartiality_risks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gr_impartiality_risks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lims_gr_impartiality_risks_authenticated_all ON public.gr_impartiality_risks;
CREATE POLICY lims_gr_impartiality_risks_authenticated_all ON public.gr_impartiality_risks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4.2 Confidentiality
CREATE TABLE IF NOT EXISTS public.gr_confidentiality_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id text NOT NULL,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  record_type text NOT NULL DEFAULT 'Commitment',
  subject_party text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  customer_notified boolean NOT NULL DEFAULT false,
  legal_basis text,
  status text NOT NULL DEFAULT 'Active',
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gr_confidentiality_records_record_id_key UNIQUE (record_id),
  CONSTRAINT gr_confidentiality_records_type_check CHECK (
    record_type = ANY (
      ARRAY[
        'Commitment'::text,
        'Public Disclosure'::text,
        'Legal Release'::text,
        'Third Party Info'::text,
        'Personnel Acknowledgement'::text
      ]
    )
  ),
  CONSTRAINT gr_confidentiality_records_status_check CHECK (
    status = ANY (ARRAY['Active'::text, 'Closed'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_gr_confidentiality_status ON public.gr_confidentiality_records (status);

DROP TRIGGER IF EXISTS trg_gr_confidentiality_records_updated_at ON public.gr_confidentiality_records;
CREATE TRIGGER trg_gr_confidentiality_records_updated_at
  BEFORE UPDATE ON public.gr_confidentiality_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gr_confidentiality_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lims_gr_confidentiality_records_authenticated_all ON public.gr_confidentiality_records;
CREATE POLICY lims_gr_confidentiality_records_authenticated_all ON public.gr_confidentiality_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- List of Objectives
CREATE TABLE IF NOT EXISTS public.gr_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text,
  owner_name text,
  target_metric text,
  target_date date,
  status text NOT NULL DEFAULT 'Planned',
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gr_objectives_objective_id_key UNIQUE (objective_id),
  CONSTRAINT gr_objectives_status_check CHECK (
    status = ANY (
      ARRAY['Planned'::text, 'In Progress'::text, 'Achieved'::text, 'Deferred'::text]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_gr_objectives_status ON public.gr_objectives (status);

DROP TRIGGER IF EXISTS trg_gr_objectives_updated_at ON public.gr_objectives;
CREATE TRIGGER trg_gr_objectives_updated_at
  BEFORE UPDATE ON public.gr_objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gr_objectives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lims_gr_objectives_authenticated_all ON public.gr_objectives;
CREATE POLICY lims_gr_objectives_authenticated_all ON public.gr_objectives
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8.5 Risks & Opportunities
CREATE TABLE IF NOT EXISTS public.gr_risk_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL,
  identified_at date NOT NULL DEFAULT CURRENT_DATE,
  item_type text NOT NULL DEFAULT 'Risk',
  description text NOT NULL DEFAULT '',
  potential_impact text,
  planned_actions text,
  integration_notes text,
  effectiveness_evaluation text,
  status text NOT NULL DEFAULT 'Open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gr_risk_opportunities_item_id_key UNIQUE (item_id),
  CONSTRAINT gr_risk_opportunities_type_check CHECK (
    item_type = ANY (ARRAY['Risk'::text, 'Opportunity'::text])
  ),
  CONSTRAINT gr_risk_opportunities_status_check CHECK (
    status = ANY (ARRAY['Open'::text, 'In Progress'::text, 'Closed'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_gr_risk_opportunities_status ON public.gr_risk_opportunities (status);

DROP TRIGGER IF EXISTS trg_gr_risk_opportunities_updated_at ON public.gr_risk_opportunities;
CREATE TRIGGER trg_gr_risk_opportunities_updated_at
  BEFORE UPDATE ON public.gr_risk_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gr_risk_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lims_gr_risk_opportunities_authenticated_all ON public.gr_risk_opportunities;
CREATE POLICY lims_gr_risk_opportunities_authenticated_all ON public.gr_risk_opportunities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8.6 Improvement
CREATE TABLE IF NOT EXISTS public.gr_improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id text NOT NULL,
  identified_at date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'Other',
  description text NOT NULL DEFAULT '',
  planned_actions text,
  customer_feedback_notes text,
  status text NOT NULL DEFAULT 'Identified',
  effectiveness_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gr_improvements_improvement_id_key UNIQUE (improvement_id),
  CONSTRAINT gr_improvements_source_check CHECK (
    source = ANY (
      ARRAY[
        'Procedure Review'::text,
        'Policy'::text,
        'Objectives'::text,
        'Audit'::text,
        'Corrective Action'::text,
        'Management Review'::text,
        'Personnel Suggestion'::text,
        'Risk Assessment'::text,
        'Data Analysis'::text,
        'Proficiency Testing'::text,
        'Customer Feedback'::text,
        'Other'::text
      ]
    )
  ),
  CONSTRAINT gr_improvements_status_check CHECK (
    status = ANY (
      ARRAY['Identified'::text, 'In Progress'::text, 'Implemented'::text, 'Closed'::text]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_gr_improvements_status ON public.gr_improvements (status);

DROP TRIGGER IF EXISTS trg_gr_improvements_updated_at ON public.gr_improvements;
CREATE TRIGGER trg_gr_improvements_updated_at
  BEFORE UPDATE ON public.gr_improvements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gr_improvements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lims_gr_improvements_authenticated_all ON public.gr_improvements;
CREATE POLICY lims_gr_improvements_authenticated_all ON public.gr_improvements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
