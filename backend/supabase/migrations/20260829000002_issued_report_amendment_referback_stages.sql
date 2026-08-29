-- Issued Test Report amendment referback: allow all Sample Handling stages.

ALTER TABLE public.issued_report_amendments
  DROP CONSTRAINT IF EXISTS issued_report_amendments_target_stage_check;

ALTER TABLE public.issued_report_amendments
  ADD CONSTRAINT issued_report_amendments_target_stage_check
  CHECK (
    target_stage = ANY (
      ARRAY[
        'receiving'::text,
        'allocation'::text,
        'test_allocation'::text,
        'under_testing'::text,
        'results_review'::text,
        'report_preparation'::text
      ]
    )
  );
