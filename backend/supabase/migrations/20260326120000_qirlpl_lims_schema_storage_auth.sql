-- Qirlpl LIMS: baseline public schema + Storage buckets + RLS + auth.users → user_profiles.
-- Apply to linked remote (single command from repo root):  npm run db:push
-- Idempotent: safe to re-run on partially provisioned DB (IF NOT EXISTS / DO blocks).

-- ── 1) Extensions ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 2) Core tables (FK order) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gst_number text,
  company_type text NOT NULL DEFAULT 'Manufacturer',
  company_scale text NOT NULL DEFAULT 'Medium',
  company_name text NOT NULL,
  contact_person_name text,
  country_code text,
  mobile text,
  email text,
  address text,
  pin_code text,
  district text,
  state text,
  country text,
  opening_balance numeric,
  balance_type text NOT NULL DEFAULT 'Dr',
  payment_term text NOT NULL DEFAULT '100 % Advance',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_company_name_key UNIQUE (company_name)
);

CREATE TABLE IF NOT EXISTS public.client_master_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sample_receiving_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.is_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_number text NOT NULL,
  revision_year text,
  reaffirmation_year text,
  amendment_number text,
  title text NOT NULL DEFAULT '',
  aspect text NOT NULL DEFAULT 'Specification',
  testing_charges numeric,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT is_codes_is_number_key UNIQUE (is_number)
);

CREATE TABLE IF NOT EXISTS public.is_code_master_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.is_code_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_code_id uuid NOT NULL REFERENCES public.is_codes (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accreditation_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_parameter_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_name text NOT NULL DEFAULT '',
  equipment_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active',
  make text,
  model_serial_no text,
  least_count text,
  range_of_instrument text,
  location text,
  placed_date date,
  uncertainty_mu numeric,
  acceptance_criteria numeric,
  remarks text,
  calibration_link text,
  intermediate_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_code_id uuid REFERENCES public.is_codes (id) ON DELETE SET NULL,
  is_code_label text,
  clause_no text,
  unit_value text,
  test_method text,
  item_name text NOT NULL,
  specific_requirement text,
  under_accreditation_ids uuid[] NOT NULL DEFAULT '{}',
  uncertainty_mu text,
  testing_charges numeric,
  conformity text NOT NULL DEFAULT 'Yes',
  department text,
  designation text,
  equipment_ids uuid[] NOT NULL DEFAULT '{}',
  temperature_of_test text,
  humidity_of_test text,
  testing_time text,
  test_method_note_path text,
  acceptance_criteria text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_parameters_item_name_key UNIQUE (item_name)
);

CREATE TABLE IF NOT EXISTS public.samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  srf_number text,
  date_of_sample_receiving date,
  sample_code text,
  sample_qr_code text,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  client_name text,
  client_reference text,
  test_report_is_code_id uuid REFERENCES public.is_codes (id) ON DELETE SET NULL,
  test_report_is_code_label text,
  description text,
  sample_description text,
  matrix text,
  received_at timestamptz,
  received_by text,
  sample_quantity text,
  shelf_life text,
  test_required text,
  batch_number text,
  date_of_manufacturing date,
  bis_seal boolean NOT NULL DEFAULT false,
  io_signature boolean NOT NULL DEFAULT false,
  sample_declaration text,
  any_other_information text,
  mode_of_disposal text,
  nature_of_sample text,
  statement_conformity_required boolean NOT NULL DEFAULT false,
  witness_test_required boolean NOT NULL DEFAULT false,
  competent_person_available boolean NOT NULL DEFAULT true,
  equipment_available boolean NOT NULL DEFAULT true,
  can_complete_within_time boolean NOT NULL DEFAULT true,
  deviation_from_methods boolean NOT NULL DEFAULT false,
  supporting_docs_required boolean NOT NULL DEFAULT false,
  decision_rule_applied boolean NOT NULL DEFAULT false,
  testing_method_available boolean NOT NULL DEFAULT true,
  sampling_procedure_ref boolean NOT NULL DEFAULT true,
  tentative_date_required date,
  tentative_date_by_lab date,
  sample_receiving_status text,
  client_references_path text,
  collection_date date,
  collection_location text,
  storage_conditions text,
  storage_location text,
  status text,
  stage text NOT NULL DEFAULT 'receiving',
  quantity numeric,
  quantity_unit text,
  condition_on_receipt text,
  condition_notes text,
  test_request_ids uuid[] NOT NULL DEFAULT '{}',
  referback_from_allocation boolean NOT NULL DEFAULT false,
  results_reviewer_id uuid,
  test_report_number text,
  test_report_draft_notes text,
  test_report_issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sample_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.samples (id) ON DELETE CASCADE,
  section_code text NOT NULL,
  allocation_date date,
  department text,
  designation text,
  sample_quantity text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_allocation_id uuid NOT NULL REFERENCES public.sample_allocations (id) ON DELETE CASCADE,
  assigned_employee_id uuid,
  assigned_employee_name text,
  test_parameter_summary text,
  test_parameter_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT test_allocations_sample_allocation_id_key UNIQUE (sample_allocation_id)
);

CREATE TABLE IF NOT EXISTS public.test_allocation_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_allocation_id uuid NOT NULL REFERENCES public.test_allocations (id) ON DELETE CASCADE,
  test_parameter_id uuid REFERENCES public.test_parameters (id) ON DELETE SET NULL,
  test_label text NOT NULL,
  test_start_date date,
  test_end_date date,
  results text,
  results_reviewer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_settings (
  id uuid PRIMARY KEY,
  lab_name text,
  lab_address text,
  lab_phone text,
  lab_email text,
  laboratory_type text,
  laboratory_scale text,
  contact_person_name text,
  contact_designation text,
  pin_code text,
  district text,
  state text,
  country text,
  company_logo_path text,
  seal_sign_path text,
  bank_name text,
  branch_name text,
  account_number text,
  ifsc text,
  upi text,
  cheque_copy_path text,
  qr_code_path text,
  currency text,
  date_format text,
  time_format text,
  theme text,
  currency_options jsonb,
  date_format_options jsonb,
  time_format_options jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,
  title text NOT NULL,
  notes text,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_accreditations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  certificate_no text,
  certificate_file_path text,
  scope_file_path text,
  logo_file_path text,
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_prefixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  label text,
  prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_letterheads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type text NOT NULL,
  title text NOT NULL,
  file_path text,
  content_text text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calibration_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE CASCADE,
  equipment_name text,
  equipment_range text,
  calibration_date date,
  due_date date,
  certificate_number text,
  calibration_agency text,
  uncertainty numeric,
  is_required boolean NOT NULL DEFAULT true,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calibration_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_id uuid NOT NULL REFERENCES public.calibration_master (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE CASCADE,
  equipment_name text,
  equipment_range text,
  maintenance_type text,
  schedule_frequency text,
  last_maintenance_date date,
  next_maintenance_date date,
  description text,
  performed_by text,
  status text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intermediate_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE CASCADE,
  check_date date,
  next_check_date date,
  result text,
  reference_standard text,
  performed_by text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT '',
  item_code text NOT NULL,
  make text,
  serial_model_no text,
  item_name text NOT NULL,
  item_description text,
  hsn_code text,
  gst_rate numeric,
  unit_of_item text,
  low_stock_value numeric,
  purchase_price numeric,
  sale_price numeric,
  maximum_retail_price numeric,
  opening_stock numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_service_master_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  model text,
  manufacturer text,
  serial_number text,
  location text,
  status text NOT NULL DEFAULT 'in_service',
  calibration_due_date date,
  last_calibration_date date,
  calibration_interval_days integer NOT NULL DEFAULT 365,
  responsible_person_id uuid,
  purchase_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calibration_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment (id) ON DELETE CASCADE,
  calibration_date date,
  next_due_date date,
  performed_by text,
  certificate_number text,
  traceability_reference text,
  result text,
  uncertainty text,
  document_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment (id) ON DELETE CASCADE,
  maintenance_date date,
  type text,
  performed_by text,
  description text,
  parts_replaced text[],
  cost numeric,
  next_maintenance_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_code text,
  test_request_id uuid,
  sample_id uuid REFERENCES public.samples (id) ON DELETE CASCADE,
  method_id uuid,
  analyst_id uuid,
  equipment_used uuid[],
  raw_data jsonb,
  result_value text,
  result_unit text,
  measurement_uncertainty text,
  detection_limit numeric,
  quantification_limit numeric,
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  designation text,
  department_name text,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 3) Align columns if table pre-existed (older manual DBs) ───────────────────
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS results_reviewer_id uuid;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS referback_from_allocation boolean NOT NULL DEFAULT false;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS test_report_number text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS test_report_draft_notes text;
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS test_report_issued_at timestamptz;
ALTER TABLE public.test_allocations ADD COLUMN IF NOT EXISTS test_parameter_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.test_allocation_parameters ADD COLUMN IF NOT EXISTS results_reviewer_id uuid;
ALTER TABLE public.lab_prefixes ADD COLUMN IF NOT EXISTS label text;

-- ── 4) Storage buckets (private) ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('is-code-files', 'is-code-files', false),
  ('sample-client-references', 'sample-client-references', false),
  ('calibration-files', 'calibration-files', false),
  ('test-method-notes', 'test-method-notes', false),
  ('laboratory-files', 'laboratory-files', false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ── 5) Storage policies ───────────────────────────────────────────────────────
DO $$
DECLARE
  b text;
BEGIN
  FOR b IN SELECT unnest(ARRAY[
    'is-code-files',
    'sample-client-references',
    'calibration-files',
    'test-method-notes',
    'laboratory-files'
  ]) LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "lims_%1$s_select" ON storage.objects;
      CREATE POLICY "lims_%1$s_select" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = %2$L);
      DROP POLICY IF EXISTS "lims_%1$s_insert" ON storage.objects;
      CREATE POLICY "lims_%1$s_insert" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = %2$L);
      DROP POLICY IF EXISTS "lims_%1$s_update" ON storage.objects;
      CREATE POLICY "lims_%1$s_update" ON storage.objects FOR UPDATE TO authenticated
        USING (bucket_id = %2$L) WITH CHECK (bucket_id = %2$L);
      DROP POLICY IF EXISTS "lims_%1$s_delete" ON storage.objects;
      CREATE POLICY "lims_%1$s_delete" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = %2$L);
    $f$, replace(b, '-', '_'), b);
  END LOOP;
END $$;

-- ── 6) RLS: internal lab app — authenticated users full access ────────────────
DO $$
DECLARE
  t text;
  pol text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clients','client_master_options','sample_receiving_options','is_codes','is_code_master_options',
    'is_code_files','accreditation_bodies','test_parameter_units','equipment_master','test_parameters',
    'samples','sample_allocations','test_allocations','test_allocation_parameters',
    'lab_settings','lab_documents','lab_accreditations','lab_prefixes','lab_letterheads',
    'calibration_master','calibration_files','equipment_maintenance','intermediate_checks',
    'product_services','product_service_master_options','equipment','calibration_records',
    'maintenance_records','test_records','user_profiles'
  ]) LOOP
    pol := 'lims_' || t || '_all';
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      pol,
      t
    );
  END LOOP;
END $$;

-- ── 7) Auth: auto-create user_profiles on signup ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, designation, department_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'designation', ''),
    COALESCE(NEW.raw_user_meta_data->>'department_name', ''),
    'Active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates public.user_profiles row when a Supabase Auth user is created.';
