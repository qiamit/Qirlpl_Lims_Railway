-- Per-equipment outgoing / inward checklist templates (Calibration Conduct Outside).

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS outgoing_checklist_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inward_checklist_template jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.equipment_master.outgoing_checklist_template IS
  'Outgoing checklist template for Calibration Conduct Outside: { items: [{ id, label, checked }] }. Empty object uses built-in defaults.';

COMMENT ON COLUMN public.equipment_master.inward_checklist_template IS
  'Inward checklist template for Calibration Conduct Outside: { items: [{ id, label, checked }] }. Empty object uses built-in defaults.';
