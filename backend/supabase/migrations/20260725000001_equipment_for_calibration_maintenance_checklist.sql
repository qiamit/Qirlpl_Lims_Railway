-- Equipment for Calibration: maintenance checklist + history (same pattern as equipment_master)

ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS maintenance_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS maintenance_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.equipment_for_calibration.maintenance_checklist IS
  'Current maintenance checklist [{ checkPoint, status, repairIfAny }]';

COMMENT ON COLUMN public.equipment_for_calibration.maintenance_history IS
  'Past maintenance records [{ id, conductedOn, doneBy, doneByName, checklist, nextDueDate }]';
