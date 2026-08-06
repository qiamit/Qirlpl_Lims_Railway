-- Per-equipment Calibration Certificate template (UUC)

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS certificate_template_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.equipment_master.certificate_template_config IS
  'Calibration Certificate template per equipment: version, kind (utm=Universal Testing Machine layout), layoutName, title, formatNumber, defaultNotes, defaultRemarks, section/signature labels, showSummaryLine, showNotesRemarks, showSignatures. Each equipment can diverge later; default is UTM layout for all.';
