-- Generate Report design/config on Calibration Equipment (UUC)

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS generate_report_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.equipment_master.generate_report_config IS
  'Generate Report UI config: enabled flag, rows[{input/reference column keys, randomnessFactor, randomnessMode (percent|absolute|range_span|range_max), randomnessFloor, randomnessCap, randomnessByPoint[{point,isDefault,mode,factor,floor,cap}], roundOff, decimalPlaces}]. When enabled=true, show Generate Report on Raw Data Sheet.';
