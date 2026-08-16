-- ISO 17025 §7.9 Complaints Management

-- 1) Customer Complaints Records (§7.9.1–7.9.7)
CREATE TABLE IF NOT EXISTS public.customer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  complainant_name text NOT NULL DEFAULT '',
  complainant_org text,
  complainant_contact text,
  description text NOT NULL DEFAULT '',
  related_activity text,
  relates_to_lab boolean NOT NULL DEFAULT true,
  validated boolean NOT NULL DEFAULT false,
  validation_notes text,
  investigation_notes text,
  actions_taken text,
  decision_outcome text,
  acknowledged_at timestamptz,
  progress_reported_at timestamptz,
  outcome_communicated_at timestamptz,
  formal_closure_notice_sent boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  reviewed_by_employee_id uuid,
  reviewed_by_name text,
  reviewer_not_involved boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Received',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_complaints_complaint_id_key UNIQUE (complaint_id),
  CONSTRAINT customer_complaints_status_check CHECK (
    status = ANY (
      ARRAY[
        'Received'::text,
        'Under Investigation'::text,
        'Decision Pending'::text,
        'Closed'::text,
        'Not Related'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_customer_complaints_received_at
  ON public.customer_complaints (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_status
  ON public.customer_complaints (status);

DROP TRIGGER IF EXISTS trg_customer_complaints_updated_at ON public.customer_complaints;
CREATE TRIGGER trg_customer_complaints_updated_at
  BEFORE UPDATE ON public.customer_complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_customer_complaints_authenticated_all ON public.customer_complaints;
CREATE POLICY lims_customer_complaints_authenticated_all
  ON public.customer_complaints
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2) Customer Feedback (+ evaluation fields for Feedback Evaluation module)
CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  customer_name text NOT NULL DEFAULT '',
  customer_org text,
  customer_contact text,
  feedback_type text NOT NULL DEFAULT 'Suggestion',
  description text NOT NULL DEFAULT '',
  related_service text,
  status text NOT NULL DEFAULT 'Open',
  evaluation_notes text,
  significance text,
  actions_decided text,
  improvement_actions text,
  evaluated_by_employee_id uuid,
  evaluated_by_name text,
  evaluated_at timestamptz,
  evaluation_status text NOT NULL DEFAULT 'Pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_feedback_feedback_id_key UNIQUE (feedback_id),
  CONSTRAINT customer_feedback_type_check CHECK (
    feedback_type = ANY (
      ARRAY[
        'Praise'::text,
        'Suggestion'::text,
        'Concern'::text,
        'Other'::text
      ]
    )
  ),
  CONSTRAINT customer_feedback_status_check CHECK (
    status = ANY (
      ARRAY[
        'Open'::text,
        'Under Evaluation'::text,
        'Closed'::text
      ]
    )
  ),
  CONSTRAINT customer_feedback_eval_status_check CHECK (
    evaluation_status = ANY (
      ARRAY[
        'Pending'::text,
        'In Progress'::text,
        'Completed'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_received_at
  ON public.customer_feedback (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_status
  ON public.customer_feedback (status);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_eval_status
  ON public.customer_feedback (evaluation_status);

DROP TRIGGER IF EXISTS trg_customer_feedback_updated_at ON public.customer_feedback;
CREATE TRIGGER trg_customer_feedback_updated_at
  BEFORE UPDATE ON public.customer_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_customer_feedback_authenticated_all ON public.customer_feedback;
CREATE POLICY lims_customer_feedback_authenticated_all
  ON public.customer_feedback
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
