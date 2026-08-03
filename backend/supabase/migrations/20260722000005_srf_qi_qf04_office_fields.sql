-- QI/QF-04 Page 2 (For Office Use) fields on calibration_service_requests

ALTER TABLE public.calibration_service_requests
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_number_mail text,
  ADD COLUMN IF NOT EXISTS physical_condition text
    CHECK (physical_condition IS NULL OR physical_condition IN ('Ok', 'Not Ok')),
  ADD COLUMN IF NOT EXISTS calibration_method_choice text
    CHECK (
      calibration_method_choice IS NULL
      OR calibration_method_choice IN ('Lab Std. Method', 'Customer Method')
    ),
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS special_instruction text,
  ADD COLUMN IF NOT EXISTS witness_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS witness_activity text,
  ADD COLUMN IF NOT EXISTS accreditation_status text
    CHECK (
      accreditation_status IS NULL
      OR accreditation_status IN ('Accredited', 'Non-Accredited')
    ),
  ADD COLUMN IF NOT EXISTS terms_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capability_evaluation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resource_evaluation jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.calibration_service_requests.capability_evaluation IS
  'QI/QF-04 capability checklist: range_resolution_master, accuracy_master, cmc_master, accreditation_scope → { ok, remark }';
COMMENT ON COLUMN public.calibration_service_requests.resource_evaluation IS
  'QI/QF-04 resource checklist: competent_manpower, equipment_setup, availability_standards, site_facility → { ok, remark }';
