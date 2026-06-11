-- Persist Part C conformity remarks edited in Test Report Preparation
ALTER TABLE public.test_allocation_parameters
  ADD COLUMN IF NOT EXISTS report_remark text;

COMMENT ON COLUMN public.test_allocation_parameters.report_remark IS
  'Test report Part C remark (Confirm / Not Confirm / Not Applicable); overrides auto evaluation when set.';
