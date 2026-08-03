-- Raw Data Sheet: master template on equipment + job → equipment FK for Conduct fill

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS raw_data_sheet_template jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.equipment_master.raw_data_sheet_template IS
  'Calibration Raw Data Sheet format (columns + verification checklist). Conduct snapshots this into calibration_raw_data_sheets.payload.';

ALTER TABLE public.calibration_jobs
  ADD COLUMN IF NOT EXISTS equipment_master_id uuid
    REFERENCES public.equipment_master (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calibration_jobs_equipment_master_id
  ON public.calibration_jobs (equipment_master_id);

COMMENT ON COLUMN public.calibration_jobs.equipment_master_id IS
  'Source Calibration Equipment (UUC) used to resolve raw_data_sheet_template on Open Sheet.';
