-- Backfill reviewer identity cleared by legacy "Approved" name migration.
-- Mechanical / Chemical Technical Manager = Kunal Patle (separate user_profiles per dept).

WITH reviewers AS (
  SELECT 'chemical'::text AS dept_key, 'b86f9841-2907-4009-9467-42aa527f306b'::uuid AS uid, 'Kunal Patle'::text AS uname
  UNION ALL
  SELECT 'mechanical', '51e0271b-668e-4309-911f-df923db3daa6'::uuid, 'Kunal Patle'
)
UPDATE public.test_allocation_parameters p
SET
  results_reviewer_id = r.uid,
  results_reviewer_name = r.uname
FROM public.test_allocations ta
JOIN public.sample_allocations sa ON sa.id = ta.sample_allocation_id
JOIN reviewers r ON r.dept_key = LOWER(TRIM(COALESCE(sa.department, '')))
WHERE p.test_allocation_id = ta.id
  AND p.results_reviewer_id IS NULL
  AND COALESCE(NULLIF(TRIM(p.results_reviewer_name), ''), '') = ''
  AND p.results_review_status = 'approved';
