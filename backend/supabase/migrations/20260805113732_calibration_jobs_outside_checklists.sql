-- Outside Conduct: outgoing (pre-cal) + inward (post-cal) handling checklists per job

ALTER TABLE public.calibration_jobs
  ADD COLUMN IF NOT EXISTS outgoing_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.calibration_jobs
  ADD COLUMN IF NOT EXISTS inward_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.calibration_jobs.outgoing_checklist IS
  'Outside Conduct — pre-calibration outgoing checklist { completed, completedAt, remarks, items:[{ id, label, checked }] }';

COMMENT ON COLUMN public.calibration_jobs.inward_checklist IS
  'Outside Conduct — post-calibration inward checklist { completed, completedAt, remarks, items:[{ id, label, checked }] }';
