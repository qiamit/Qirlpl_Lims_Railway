-- Keep Testing Engineer visibility on issued reports:
-- results status = Approved, sent_for_testing remains true so sections stay
-- visible in Sample Under Testing with status "Test Report Issued".
--
-- Restore any completed allocations cleared by the earlier cleanup.

UPDATE public.test_allocation_parameters p
SET
  results_reviewer_id = NULL,
  results_reviewer_name = 'Approved'
FROM public.test_allocations ta
JOIN public.sample_allocations sa ON sa.id = ta.sample_allocation_id
JOIN public.samples s ON s.id = sa.sample_id
WHERE p.test_allocation_id = ta.id
  AND s.stage = 'completed'
  AND p.results_reviewer_id IS NULL
  AND COALESCE(NULLIF(TRIM(p.results_reviewer_name), ''), '') = '';

UPDATE public.test_allocations ta
SET
  sent_for_testing = true,
  referred_back_from_review = false
FROM public.sample_allocations sa
JOIN public.samples s ON s.id = sa.sample_id
WHERE ta.sample_allocation_id = sa.id
  AND s.stage = 'completed'
  AND ta.sent_for_testing = false
  AND EXISTS (
    SELECT 1
    FROM public.test_allocation_parameters p
    WHERE p.test_allocation_id = ta.id
      AND (
        NULLIF(TRIM(p.results), '') IS NOT NULL
        OR NULLIF(TRIM(p.results_reviewer_name), '') IS NOT NULL
      )
  );
