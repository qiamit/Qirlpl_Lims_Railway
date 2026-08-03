-- Calibration method (IS Code) on equipment_master for Calibration Equipments (UUC)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master'
      AND column_name = 'calibration_method_is_code_id'
  ) THEN
    ALTER TABLE public.equipment_master
      ADD COLUMN calibration_method_is_code_id uuid
        REFERENCES public.is_codes (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_master'
      AND column_name = 'calibration_method_label'
  ) THEN
    ALTER TABLE public.equipment_master
      ADD COLUMN calibration_method_label text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipment_master_calibration_method_is_code
  ON public.equipment_master (calibration_method_is_code_id);

COMMENT ON COLUMN public.equipment_master.calibration_method_is_code_id IS
  'IS Code Master reference used as calibration method (IS number : revision year).';
COMMENT ON COLUMN public.equipment_master.calibration_method_label IS
  'Denormalized display label e.g. IS 1608 : 2022';
