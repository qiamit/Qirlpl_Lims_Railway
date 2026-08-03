-- Link Calibration Equipment (UUC) to Master / reference standard used for calibration

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS master_equipment_id uuid
    REFERENCES public.equipment_for_calibration (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_master_master_equipment_id
  ON public.equipment_master (master_equipment_id);

COMMENT ON COLUMN public.equipment_master.master_equipment_id IS
  'Reference / master equipment (equipment_for_calibration) used when calibrating this UUC.';
