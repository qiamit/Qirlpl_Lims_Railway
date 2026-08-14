-- IQC masters: maintenance checklist + history (parity with equipment_master)
ALTER TABLE public.iqc_masters
  ADD COLUMN IF NOT EXISTS maintenance_checklist jsonb NULL,
  ADD COLUMN IF NOT EXISTS maintenance_history jsonb NULL;

COMMENT ON COLUMN public.iqc_masters.maintenance_checklist IS
  'Current maintenance checklist items (JSON), same shape as equipment_master.';
COMMENT ON COLUMN public.iqc_masters.maintenance_history IS
  'Past maintenance checklist history (JSON), same shape as equipment_master.';
