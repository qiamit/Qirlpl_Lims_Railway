-- Update IQC plan default acceptance criteria wording.

UPDATE public.iqc_plan_items
SET acceptance_criteria = 'Within Uncertainty Limit'
WHERE acceptance_criteria IS NULL
   OR trim(acceptance_criteria) = ''
   OR lower(trim(acceptance_criteria)) = 'as per predefined criteria';
