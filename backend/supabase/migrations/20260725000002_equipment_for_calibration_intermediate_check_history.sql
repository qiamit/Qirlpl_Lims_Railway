-- Equipment for Calibration: intermediate check history + performed by (same pattern as equipment_master)

ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS intermediate_check_history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS intermediate_check_performed_by text;

COMMENT ON COLUMN public.equipment_for_calibration.intermediate_check_history IS
  'Past intermediate check records [{ id, conductedOn, doneBy, doneByName, status, resultSummary, readings, nextDueDate, temperature, humidity, masters }]';

COMMENT ON COLUMN public.equipment_for_calibration.intermediate_check_performed_by IS
  'Employee name who performs intermediate checks (free text, mirrors maintenance_done_by)';
