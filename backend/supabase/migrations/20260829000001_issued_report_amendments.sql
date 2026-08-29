-- Issued Test Report: Amendment / Revised / Supplementary issue + referback history.

ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_receiving_report_type_check;
ALTER TABLE public.samples ADD CONSTRAINT samples_receiving_report_type_check
  CHECK (
    receiving_report_type IS NULL
    OR receiving_report_type = ANY (
      ARRAY[
        'New Report'::text,
        'Amendment Report'::text,
        'Supplementary Report'::text,
        'Revised Report'::text
      ]
    )
  );

CREATE TABLE IF NOT EXISTS public.issued_report_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples (id) ON DELETE CASCADE,
  srf_number text,
  issue_kind text NOT NULL,
  section_code text,
  sample_allocation_id uuid,
  test_allocation_id uuid,
  department text,
  designation text,
  employee_id uuid,
  employee_name text,
  target_stage text NOT NULL,
  remark text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issued_report_amendments_issue_kind_check CHECK (
    issue_kind = ANY (ARRAY['amendment'::text, 'revised'::text, 'supplementary'::text])
  ),
  CONSTRAINT issued_report_amendments_target_stage_check CHECK (
    target_stage = ANY (
      ARRAY[
        'under_testing'::text,
        'results_review'::text,
        'report_preparation'::text
      ]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_issued_report_amendments_sample_id
  ON public.issued_report_amendments (sample_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issued_report_amendments_employee_id
  ON public.issued_report_amendments (employee_id);

COMMENT ON TABLE public.issued_report_amendments IS
  'History of Amendment / Revised / Supplementary issues from Issued Test Report, including the section and employee referred back.';

ALTER TABLE public.issued_report_amendments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lims_issued_report_amendments_authenticated_all ON public.issued_report_amendments;
CREATE POLICY lims_issued_report_amendments_authenticated_all
  ON public.issued_report_amendments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.issued_report_amendments TO authenticated;
GRANT SELECT ON public.issued_report_amendments TO anon;
GRANT ALL ON public.issued_report_amendments TO service_role;
