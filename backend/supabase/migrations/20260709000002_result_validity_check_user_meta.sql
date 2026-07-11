-- Snapshot department & designation for performed/reviewed users on validity checks.

ALTER TABLE public.result_validity_checks
    ADD COLUMN IF NOT EXISTS performed_by_department text,
    ADD COLUMN IF NOT EXISTS performed_by_designation text,
    ADD COLUMN IF NOT EXISTS reviewed_by_department text,
    ADD COLUMN IF NOT EXISTS reviewed_by_designation text;

COMMENT ON COLUMN public.result_validity_checks.performed_by_department IS
    'Department snapshot for performed_by user at time of record.';
COMMENT ON COLUMN public.result_validity_checks.performed_by_designation IS
    'Designation snapshot for performed_by user at time of record.';
COMMENT ON COLUMN public.result_validity_checks.reviewed_by_department IS
    'Department snapshot for reviewed_by user at time of record.';
COMMENT ON COLUMN public.result_validity_checks.reviewed_by_designation IS
    'Designation snapshot for reviewed_by user at time of record.';
