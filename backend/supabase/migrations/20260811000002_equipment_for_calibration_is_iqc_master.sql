-- Split Master Equipments vs Masters for IQC in the same table.

ALTER TABLE public.equipment_for_calibration
  ADD COLUMN IF NOT EXISTS is_iqc_master boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_equipment_for_calibration_is_iqc_master
  ON public.equipment_for_calibration (is_iqc_master);

COMMENT ON COLUMN public.equipment_for_calibration.is_iqc_master IS
  'true = Calibration LIMS / Masters for IQC; false = Master Equipments.';
