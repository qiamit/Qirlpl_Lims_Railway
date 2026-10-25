-- Results review in the database (ISO/IEC 17025:2017 7.7.1, 7.8.1.1; lab
-- request of 25 Oct 2026). Until now the screens decided who may approve a
-- section's results; any user who could update test_allocation_parameters
-- could set results_review_status = 'approved', approve their own results,
-- or change results while they were under review.
--
-- Rules, for signed-in users (auth.uid() set; migrations, data fixes and
-- SECURITY DEFINER functions are not affected):
--
--   1. Nobody reviews their own results: the reviewer set on a row cannot be
--      the person who entered its result (entered_by; for older rows without
--      it, the engineer the section is assigned to).
--   2. Approving a result needs the row to have been sent for review
--      (status 'under_review') and the caller to be its assigned reviewer.
--      The Laboratory Director may approve any row, but never one whose
--      result they entered.
--   3. While a row is under review or approved, its result fields (results,
--      test dates, equipment, environment) cannot change; refer the section
--      back first. The Director is not locked (as with issued results), and
--      every change is in the Audit Trail.
--   4. A row inserted as already approved (report amendment copy) cannot be
--      inserted by the person who entered its result.
--
-- The trigger runs after tap_stamp_result_entry (BEFORE triggers fire in name
-- order), so entered_by is final when the rules are checked. Safe to run more
-- than once.

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
          OR NEW.environment_snapshot IS DISTINCT FROM OLD.environment_snapshot) THEN
    RAISE EXCEPTION 'Results % cannot be changed. Refer the section back from review first.',
      CASE WHEN OLD.results_review_status = 'approved' THEN 'already approved' ELSE 'under review' END
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tap_verify_review_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tap_verify_review_rules ON public.test_allocation_parameters;
CREATE TRIGGER tap_verify_review_rules
  BEFORE INSERT OR UPDATE ON public.test_allocation_parameters
  FOR EACH ROW EXECUTE FUNCTION public.tap_verify_review_rules();
