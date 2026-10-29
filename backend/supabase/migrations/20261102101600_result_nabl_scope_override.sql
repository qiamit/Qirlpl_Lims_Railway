-- NABL scope of one result (lab request of 26 Oct 2026). A test parameter that
-- is in the NABL scope can give a result outside the range the laboratory is
-- accredited for; that result is then reported as not accredited (NABL 133,
-- ISO/IEC 17025:2017 8.1.1 / 7.8.1: accredited and non-accredited results are
-- distinguished). The test parameter master stays as it is; the result row
-- records the change.
--
--   test_allocation_parameters.nabl_scope_override: NULL = as the master says;
--   'Non NABL' = report this result as not accredited. Only this direction is
--   possible: a result can never be made "NABL" when the master is not.
--
-- The value is a result field: it is locked with the results while they are
-- under review or approved (migration 53 rule 3, extended below), frozen after
-- issue (guard_issued_parameter_update compares the whole row) and in the
-- Audit Trail. Safe to run more than once.

ALTER TABLE public.test_allocation_parameters
  ADD COLUMN IF NOT EXISTS nabl_scope_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'test_allocation_parameters_nabl_scope_override_check'
       AND conrelid = 'public.test_allocation_parameters'::regclass
  ) THEN
    ALTER TABLE public.test_allocation_parameters
      ADD CONSTRAINT test_allocation_parameters_nabl_scope_override_check
      CHECK (nabl_scope_override IS NULL OR nabl_scope_override = 'Non NABL');
  END IF;
END $$;

COMMENT ON COLUMN public.test_allocation_parameters.nabl_scope_override IS
  'NULL = scope as in the test parameter master; ''Non NABL'' = this result is reported as not accredited (e.g. outside the accredited range).';

-- Migration 53 rule 3 also locks the scope of a result under review or approved.
CREATE OR REPLACE FUNCTION public.tap_verify_review_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_director boolean;
  v_tester uuid;
  v_has_result boolean := nullif(btrim(coalesce(NEW.results, '')), '') IS NOT NULL;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  v_director := public.app_is_laboratory_director();

  v_tester := NEW.entered_by;
  IF v_tester IS NULL AND TG_OP = 'UPDATE' THEN
    v_tester := OLD.entered_by;
  END IF;
  IF v_tester IS NULL THEN
    SELECT ta.assigned_employee_id INTO v_tester
      FROM public.test_allocations ta
     WHERE ta.id = NEW.test_allocation_id;
  END IF;

  -- 1. Reviewer is never the tester.
  IF NEW.results_reviewer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.results_reviewer_id IS DISTINCT FROM OLD.results_reviewer_id)
     AND v_tester IS NOT NULL AND NEW.results_reviewer_id = v_tester THEN
    RAISE EXCEPTION 'The person who entered the results cannot review them. Choose another reviewer.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 4. An approved copy is not inserted by its own tester.
    IF NEW.results_review_status = 'approved' AND v_has_result AND v_tester = v_uid THEN
      RAISE EXCEPTION 'Results cannot be approved by the person who entered them.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- 2. Approval.
  IF NEW.results_review_status = 'approved'
     AND OLD.results_review_status IS DISTINCT FROM 'approved'
     AND v_has_result THEN
    IF v_tester IS NOT NULL AND v_tester = v_uid THEN
      RAISE EXCEPTION 'Results cannot be approved by the person who entered them.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT v_director THEN
      IF OLD.results_review_status IS DISTINCT FROM 'under_review' THEN
        RAISE EXCEPTION 'These results have not been sent for review yet.'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.results_reviewer_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Only the assigned reviewer (%) can approve these results.',
          coalesce(nullif(btrim(OLD.results_reviewer_name), ''), 'not set')
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 3. Results locked while under review or approved.
  IF NOT v_director
     AND OLD.results_review_status IN ('under_review', 'approved')
     AND NEW.results_review_status IS NOT DISTINCT FROM OLD.results_review_status
     AND (NEW.results IS DISTINCT FROM OLD.results
          OR NEW.test_start_date IS DISTINCT FROM OLD.test_start_date
          OR NEW.test_end_date IS DISTINCT FROM OLD.test_end_date
          OR NEW.equipment_used IS DISTINCT FROM OLD.equipment_used
          OR NEW.environment_area_id IS DISTINCT FROM OLD.environment_area_id
          OR NEW.environment_snapshot IS DISTINCT FROM OLD.environment_snapshot
          OR NEW.nabl_scope_override IS DISTINCT FROM OLD.nabl_scope_override) THEN
    RAISE EXCEPTION 'Results % cannot be changed. Refer the section back from review first.',
      CASE WHEN OLD.results_review_status = 'approved' THEN 'already approved' ELSE 'under review' END
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


NOTIFY pgrst, 'reload schema';
