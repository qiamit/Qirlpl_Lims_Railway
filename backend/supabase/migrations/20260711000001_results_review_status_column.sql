-- Review status lives in its own column (do not overwrite results_reviewer_name with 'Approved').
-- results_reviewer_id / results_reviewer_name keep the actual reviewer identity.

ALTER TABLE public.test_allocation_parameters
  ADD COLUMN IF NOT EXISTS results_review_status text;

COMMENT ON COLUMN public.test_allocation_parameters.results_review_status IS
  'Review workflow status: under_review | approved. Reviewer identity stays in results_reviewer_id/name.';

-- Migrate legacy "Approved" marker out of the name column
UPDATE public.test_allocation_parameters
SET
  results_review_status = 'approved',
  results_reviewer_name = NULL
WHERE TRIM(COALESCE(results_reviewer_name, '')) = 'Approved';

-- Active reviewer assignment without status → under_review
UPDATE public.test_allocation_parameters
SET results_review_status = 'under_review'
WHERE results_review_status IS NULL
  AND results_reviewer_id IS NOT NULL;

-- Copy Test Parameter master specified requirement onto allocation rows when empty
UPDATE public.test_allocation_parameters p
SET specific_requirement = tp.specific_requirement
FROM public.test_parameters tp
WHERE p.test_parameter_id = tp.id
  AND COALESCE(NULLIF(TRIM(p.specific_requirement), ''), '') = ''
  AND NULLIF(TRIM(tp.specific_requirement), '') IS NOT NULL;
