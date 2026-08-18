-- Keep Testing Master Equipment and Calibration Equipments on the same table,
-- but never mix their lists. Default existing lab assets to testing.

ALTER TABLE public.equipment_master
  ADD COLUMN IF NOT EXISTS equipment_kind text NOT NULL DEFAULT 'testing';

ALTER TABLE public.equipment_master
  DROP CONSTRAINT IF EXISTS equipment_master_equipment_kind_check;

ALTER TABLE public.equipment_master
  ADD CONSTRAINT equipment_master_equipment_kind_check
  CHECK (equipment_kind IN ('testing', 'calibration'));

CREATE INDEX IF NOT EXISTS equipment_master_equipment_kind_idx
  ON public.equipment_master (equipment_kind);

COMMENT ON COLUMN public.equipment_master.equipment_kind IS
  'testing = Equipment Management / Master Equipment Testing; calibration = Calibration LIMS / Calibration Equipments';

-- Rows already used as Calibration DUC on jobs.
UPDATE public.equipment_master em
SET equipment_kind = 'calibration'
WHERE em.equipment_kind = 'testing'
  AND EXISTS (
    SELECT 1
    FROM public.calibration_jobs j
    WHERE j.equipment_master_id = em.id
  );

-- Calibration LIMS templates / method without Testing Master identity fields.
UPDATE public.equipment_master
SET equipment_kind = 'calibration'
WHERE equipment_kind = 'testing'
  AND manufacturer IS NULL
  AND date_of_purchase IS NULL
  AND purchased_from IS NULL
  AND custodian_employee_id IS NULL
  AND maintenance_schedule_frequency IS NULL
  AND last_maintenance_date IS NULL
  AND date_placed_in_service IS NULL
  AND (
    raw_data_sheet_template IS NOT NULL
    OR mu_calculation_template IS NOT NULL
    OR generate_report_config IS NOT NULL
    OR certificate_template_config IS NOT NULL
    OR outgoing_checklist_template IS NOT NULL
    OR inward_checklist_template IS NOT NULL
    OR master_equipment_id IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(calibration_method_label, '')), '') IS NOT NULL
    OR calibration_method_is_code_id IS NOT NULL
  );

NOTIFY pgrst, 'reload schema';
