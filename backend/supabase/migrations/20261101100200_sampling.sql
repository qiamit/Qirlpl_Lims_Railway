-- ISO/IEC 17025 gap P3-1: sampling (7.3) and sampling information in test
-- reports (7.8.5).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager),
-- 20261024100000_audit_trail_expansion.sql (write_audit_log),
-- 20261029100100_user_admin_lab_settings.sql (save_lab_settings) and, when
-- present, 20261029100200_db_module_access.sql (module_table_map), while the
-- lab is idle. Safe to re-run.
--
-- Lab decision (Amit, 23 Oct 2026): the laboratory does NOT sample today (the
-- Quality Manual excludes 7.3: samples are tested as received). The module is
-- built complete but OFF by default, so it can be switched on later.
--
-- What it adds
--   lab_settings.sampling_enabled   boolean NOT NULL DEFAULT false. The
--                         Laboratory Director switches it on in Lab Settings
--                         (save_lab_settings, extended below to accept it).
--                         While false: no sampling plan or record can be
--                         created (the pages show "Sampling is not in use"),
--                         and test reports print no sampling information.
--   app_sampling_enabled()  the flag (false when no lab_settings row).
--   sampling_plans        Sampling plans and methods (7.3.1 / 7.3.2): plan
--                         number SP-YYYY-NNN set by the database, title,
--                         matrix / product, method reference (free text and an
--                         optional IS code), statistical basis (lot size,
--                         sample size, acceptance / rejection number, AQL,
--                         inspection level, scheme text), sampling locations,
--                         frequency, factors to be controlled, handling
--                         instructions. Draft -> approved (Director, Quality
--                         Manager or a Technical Manager; stamped by the
--                         database). Approved plans are read-only: a change is
--                         a NEW VERSION (insert with supersedes_id = the
--                         approved plan; same plan number, version + 1). When
--                         the new version is approved the previous one becomes
--                         superseded. An approved plan may be withdrawn. Only
--                         drafts can be deleted.
--   sampling_records      Sampling records (7.3.3): record number
--                         SR-YYYY-NNN (year of sampling) set by the database,
--                         approved plan used, customer, the lab sample it
--                         became (sample_id, once the sample is received; one
--                         record per sample), date / time, sampler (signed-in
--                         user by default; name from user_profiles), location
--                         with optional GPS latitude / longitude / accuracy,
--                         environmental conditions, sample identification and
--                         description, quantity, containers, preservation,
--                         chain of custody (jsonb array of handovers),
--                         deviations from the plan with "customer informed" /
--                         "customer agreed" flags (7.3.2 / 7.1.6),
--                         attachments (photos; private bucket sampling-files)
--                         and remarks.
--
-- Access
--   Read: known staff. Restrictive gate lims_known_staff_only like every other
--   public table, explicit grants, write_audit_log on both tables.
--   Plans: Laboratory Director, Quality Manager or a Technical Manager
--   (app_sampling_can_manage). Records: those plus a sampler (designation
--   containing "sampl", e.g. Sampler / Sampling Officer / Sample Incharge;
--   app_sampling_can_record). A sampler must also be known staff (Sample
--   Incharge in Sample Cell is; another designation needs a Module Access
--   rule, as for any other role). Record deletes: Laboratory Director only.
--   Module access (20261029100200), when present: sampling_plans ->
--   /sampling/plans, sampling_records -> /sampling/records, both readable from
--   Test Report Preparation and Issued Test Report (the print reads them).
--   The two sampling routes are not in the sidebar catalog yet: until
--   appNav.ts lists them the browser and the database both use the legacy
--   role allowlists for them (Director: edit).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.lab_settings') IS NULL
     OR to_regclass('public.samples') IS NULL
     OR to_regclass('public.clients') IS NULL
     OR to_regclass('public.is_codes') IS NULL
     OR to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'lab_settings, samples, clients, is_codes and user_profiles must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The switch: lab_settings.sampling_enabled (off by default).
-- ---------------------------------------------------------------------------

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS sampling_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lab_settings.sampling_enabled IS
  'ISO/IEC 17025 7.3: true when the laboratory performs sampling. Off by default (the Quality Manual excludes sampling). Laboratory Director only, via save_lab_settings.';

-- Same row choice as app_lab_settings_target_id() (singleton, else newest),
-- without creating a row.
CREATE OR REPLACE FUNCTION public.app_sampling_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT ls.sampling_enabled
    FROM public.lab_settings ls
    ORDER BY (ls.id = '00000000-0000-0000-0000-000000000001'::uuid) DESC, ls.created_at DESC NULLS LAST
    LIMIT 1
  ), false);
$$;

REVOKE ALL ON FUNCTION public.app_sampling_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sampling_enabled() TO authenticated, service_role;

-- save_lab_settings (20261029100100) with sampling_enabled added to the
-- allowed fields. Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.save_lab_settings(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed constant text[] := ARRAY[
    -- laboratory details
    'lab_name', 'gst_number', 'address', 'phone', 'email', 'website',
    'lab_type', 'lab_scale', 'contact_person', 'designation', 'pin_code',
    'district', 'state', 'country', 'country_code', 'logo_path', 'seal_sign_path',
    -- bank details
    'bank_name', 'branch_name', 'account_number', 'ifsc', 'upi',
    'cheque_copy_path', 'qr_code_path',
    -- system
    'currency', 'date_format', 'time_format', 'theme', 'generate_report_enabled',
    'ai_client_data_mode',
    -- modules (20261101100200)
    'sampling_enabled'
  ];
  k text;
  v jsonb;
  set_list text[] := ARRAY[]::text[];
  row_id uuid;
  result jsonb;
BEGIN
  IF NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can change Lab Settings'
      USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Lab settings must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  FOR k, v IN SELECT key, value FROM jsonb_each(p) LOOP
    CONTINUE WHEN k IN ('id', 'created_at', 'updated_at');
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'Lab setting "%" cannot be saved here', k
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lab_settings' AND column_name = k
    ) THEN
      RAISE EXCEPTION 'Lab setting "%" is not on this database yet', k
        USING ERRCODE = '42703';
    END IF;
    IF jsonb_typeof(v) = 'string' AND (length(v #>> '{}') > 2000 OR public.app_text_has_markup(v #>> '{}')) THEN
      RAISE EXCEPTION 'Lab setting "%" may not contain HTML and must be under 2000 characters', k
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v) IN ('object', 'array') THEN
      RAISE EXCEPTION 'Lab setting "%" must be a plain value', k
        USING ERRCODE = '22023';
    END IF;
    IF k = 'sampling_enabled' AND jsonb_typeof(v) <> 'boolean' THEN
      RAISE EXCEPTION 'Lab setting "sampling_enabled" must be true or false'
        USING ERRCODE = '22023';
    END IF;
    set_list := set_list || format('%I = r.%I', k, k);
  END LOOP;

  row_id := public.app_lab_settings_target_id();

  IF array_length(set_list, 1) IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.lab_settings t SET %s, updated_at = now() FROM jsonb_populate_record(NULL::public.lab_settings, $1) r WHERE t.id = $2',
      array_to_string(set_list, ', ')
    ) USING p, row_id;
  END IF;

  SELECT to_jsonb(ls) INTO result FROM public.lab_settings ls WHERE ls.id = row_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_lab_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_lab_settings(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who may do what.
-- ---------------------------------------------------------------------------

-- Plans and approval: Laboratory Director, Quality Manager, Technical Manager.
CREATE OR REPLACE FUNCTION public.app_sampling_can_manage()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF public.app_is_laboratory_director() THEN
    RETURN true;
  END IF;
  IF to_regprocedure('public.app_is_quality_manager()') IS NOT NULL THEN
    EXECUTE 'SELECT public.app_is_quality_manager()' INTO v_ok;
    IF v_ok THEN
      RETURN true;
    END IF;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.designation, ''))) = 'technical manager'
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.app_sampling_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sampling_can_manage() TO authenticated, service_role;

-- Sampling records: the above plus a sampler (designation mentions sampling).
CREATE OR REPLACE FUNCTION public.app_sampling_can_record()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_sampling_can_manage()
      OR EXISTS (
        SELECT 1
        FROM public.user_profiles up
        WHERE up.id = auth.uid()
          AND lower(coalesce(up.designation, '')) LIKE '%sampl%'
          AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
      );
$$;

REVOKE ALL ON FUNCTION public.app_sampling_can_record() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sampling_can_record() TO authenticated, service_role;

-- Profile name of a user (user_profiles may be hidden by RLS).
CREATE OR REPLACE FUNCTION public.app_sampling_profile_name(p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(nullif(btrim(up.full_name), ''), up.email)
  FROM public.user_profiles up
  WHERE up.id = p_uid;
$$;

REVOKE ALL ON FUNCTION public.app_sampling_profile_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sampling_profile_name(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sampling_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_no text NOT NULL,
  version int NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.sampling_plans (id) ON DELETE RESTRICT,
  title text NOT NULL,
  -- matrix / product sampled, e.g. "Ready-mix concrete", "Drinking water"
  matrix text,
  is_code_id uuid REFERENCES public.is_codes (id) ON DELETE SET NULL,
  -- standard / method reference as written, e.g. "IS 1199 (Part 1):2018 cl 5"
  method_reference text,
  -- statistical basis (7.3.1 b)
  lot_size int,
  sample_size int,
  acceptance_number int,
  rejection_number int,
  aql numeric,
  inspection_level text,
  statistical_basis text,
  -- ["Batching plant outlet", "Site, pour 1"]
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  frequency text,
  -- factors to be controlled to ensure validity of results (7.3.1 c)
  factors_to_control text,
  -- containers, preservation, transport, storage
  handling_instructions text,
  status text NOT NULL DEFAULT 'draft',
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sampling_plans_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT sampling_plans_status_check CHECK (status IN ('draft', 'approved', 'superseded', 'withdrawn')),
  CONSTRAINT sampling_plans_version_check CHECK (version >= 1),
  CONSTRAINT sampling_plans_locations_check CHECK (jsonb_typeof(locations) = 'array'),
  CONSTRAINT sampling_plans_sizes_check CHECK (
    (lot_size IS NULL OR lot_size > 0)
    AND (sample_size IS NULL OR sample_size > 0)
    AND (lot_size IS NULL OR sample_size IS NULL OR sample_size <= lot_size)
    AND (acceptance_number IS NULL OR acceptance_number >= 0)
    AND (rejection_number IS NULL OR rejection_number >= 1)
    AND (acceptance_number IS NULL OR sample_size IS NULL OR acceptance_number < sample_size)
    AND (acceptance_number IS NULL OR rejection_number IS NULL OR rejection_number > acceptance_number)
    AND (aql IS NULL OR (aql > 0 AND aql <= 100))
  ),
  CONSTRAINT sampling_plans_approved_check CHECK (
    status NOT IN ('approved', 'superseded', 'withdrawn') OR approved_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS sampling_plans_no_version_key
  ON public.sampling_plans (plan_no, version);
CREATE INDEX IF NOT EXISTS idx_sampling_plans_status ON public.sampling_plans (status);
CREATE INDEX IF NOT EXISTS idx_sampling_plans_supersedes ON public.sampling_plans (supersedes_id);
CREATE INDEX IF NOT EXISTS idx_sampling_plans_is_code ON public.sampling_plans (is_code_id);

COMMENT ON TABLE public.sampling_plans IS
  'Sampling plans and methods (ISO/IEC 17025 7.3.1 / 7.3.2). Approved rows are read-only; changes are new versions (supersedes_id).';

CREATE TABLE IF NOT EXISTS public.sampling_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_no text NOT NULL,
  plan_id uuid REFERENCES public.sampling_plans (id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  customer_name text,
  -- the lab sample this sampling produced, once it is received
  sample_id uuid REFERENCES public.samples (id) ON DELETE SET NULL,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  sampler_id uuid DEFAULT auth.uid(),
  sampler_name text,
  location text NOT NULL,
  latitude numeric,
  longitude numeric,
  gps_accuracy_m numeric,
  location_source text,
  environmental_conditions text,
  ambient_temperature numeric,
  ambient_humidity numeric,
  sample_identification text NOT NULL,
  sample_description text,
  quantity text,
  containers text,
  preservation text,
  -- [{"at": "2026-11-02T10:15:00Z", "from": "Sampler", "to": "Courier",
  --   "condition": "Sealed, 4 °C", "seal_intact": true, "remarks": ""}]
  chain_of_custody jsonb NOT NULL DEFAULT '[]'::jsonb,
  deviations text,
  customer_informed boolean NOT NULL DEFAULT false,
  customer_agreed boolean NOT NULL DEFAULT false,
  -- [{"path": "<record id>/<uuid>_photo.jpg", "name": "photo.jpg", "uploaded_at": "..."}]
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sampling_records_location_check CHECK (btrim(location) <> ''),
  CONSTRAINT sampling_records_identification_check CHECK (btrim(sample_identification) <> ''),
  CONSTRAINT sampling_records_gps_check CHECK (
    (latitude IS NULL) = (longitude IS NULL)
    AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
    AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
    AND (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0)
  ),
  CONSTRAINT sampling_records_location_source_check
    CHECK (location_source IS NULL OR location_source IN ('gps', 'manual')),
  CONSTRAINT sampling_records_humidity_check
    CHECK (ambient_humidity IS NULL OR ambient_humidity BETWEEN 0 AND 100),
  CONSTRAINT sampling_records_temperature_check
    CHECK (ambient_temperature IS NULL OR ambient_temperature BETWEEN -100 AND 200),
  CONSTRAINT sampling_records_custody_check CHECK (jsonb_typeof(chain_of_custody) = 'array'),
  CONSTRAINT sampling_records_attachments_check CHECK (jsonb_typeof(attachments) = 'array'),
  CONSTRAINT sampling_records_agreed_check CHECK (NOT customer_agreed OR customer_informed)
);

CREATE UNIQUE INDEX IF NOT EXISTS sampling_records_record_no_key ON public.sampling_records (record_no);
CREATE UNIQUE INDEX IF NOT EXISTS sampling_records_sample_key
  ON public.sampling_records (sample_id) WHERE sample_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sampling_records_plan ON public.sampling_records (plan_id);
CREATE INDEX IF NOT EXISTS idx_sampling_records_client ON public.sampling_records (client_id);
CREATE INDEX IF NOT EXISTS idx_sampling_records_sampled_at ON public.sampling_records (sampled_at DESC);

COMMENT ON TABLE public.sampling_records IS
  'Sampling records (ISO/IEC 17025 7.3.3). sample_id links the lab sample; the issued test report prints the sampling information (7.8.5) when sampling is enabled.';

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['sampling_plans', 'sampling_records'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Plans: numbering, versions, approval, read-only once approved.
--    SECURITY INVOKER on purpose: callers running as authenticated / anon are
--    "the app"; the owner (the after-approve trigger), service_role and
--    scripts are not limited (but still get a number when none is given).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sampling_plans_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := current_user IN ('authenticated', 'anon');
  v_uid uuid := auth.uid();
  old_rec public.sampling_plans%ROWTYPE;
  v_year text;
  v_next int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_app AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Only a draft sampling plan can be deleted. Withdraw an approved plan instead.'
        USING ERRCODE = '42501',
              HINT = 'ISO/IEC 17025 7.5.2: approved plans stay on record.';
    END IF;
    RETURN OLD;
  END IF;

  NEW.locations := coalesce(NEW.locations, '[]'::jsonb);

  IF TG_OP = 'INSERT' THEN
    IF v_app THEN
      IF NOT public.app_sampling_enabled() THEN
        RAISE EXCEPTION 'Sampling is not in use. The Laboratory Director can enable it in Lab Settings.'
          USING ERRCODE = '42501';
      END IF;
      NEW.created_by := v_uid;
      NEW.created_at := now();
      IF NEW.status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'A new sampling plan starts as a draft.' USING ERRCODE = '42501';
      END IF;
      NEW.approved_by := NULL;
      NEW.approved_by_name := NULL;
      NEW.approved_at := NULL;
    END IF;

    IF NEW.supersedes_id IS NOT NULL THEN
      SELECT * INTO old_rec FROM public.sampling_plans WHERE id = NEW.supersedes_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The plan being revised does not exist' USING ERRCODE = '23503';
      END IF;
      IF old_rec.status <> 'approved' THEN
        RAISE EXCEPTION 'Only an approved plan can be revised (plan % is %).', old_rec.plan_no, old_rec.status
          USING ERRCODE = '42501';
      END IF;
      NEW.plan_no := old_rec.plan_no;
      NEW.version := old_rec.version + 1;
      IF EXISTS (
        SELECT 1 FROM public.sampling_plans p
        WHERE p.plan_no = old_rec.plan_no AND p.version = NEW.version
      ) THEN
        RAISE EXCEPTION 'Version % of % is already being prepared.', NEW.version, old_rec.plan_no
          USING ERRCODE = '23505';
      END IF;
    ELSIF v_app OR NEW.plan_no IS NULL OR btrim(NEW.plan_no) = '' THEN
      NEW.version := 1;
      v_year := to_char(current_date, 'YYYY');
      PERFORM pg_advisory_xact_lock(hashtext('sampling_plans:SP' || v_year));
      SELECT coalesce(max(substring(p.plan_no FROM '([0-9]+)$')::int), 0) + 1
        INTO v_next
        FROM public.sampling_plans p
       WHERE p.plan_no ~ ('^SP-' || v_year || '-[0-9]+$');
      NEW.plan_no := 'SP-' || v_year || '-' || lpad(v_next::text, 3, '0');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NOT v_app THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.plan_no IS DISTINCT FROM OLD.plan_no
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Plan number, version and author cannot be changed.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('superseded', 'withdrawn') THEN
    RAISE EXCEPTION 'Sampling plan % v% is % and read-only.', OLD.plan_no, OLD.version, OLD.status
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'approved' THEN
    IF NEW.status IN ('superseded', 'withdrawn')
       AND (to_jsonb(NEW) - 'status' - 'updated_at' - 'remarks')
         = (to_jsonb(OLD) - 'status' - 'updated_at' - 'remarks') THEN
      IF NOT public.app_sampling_can_manage() THEN
        RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can withdraw a plan.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Approved sampling plans are read-only. Create a new version instead.'
      USING ERRCODE = '42501',
            HINT = 'ISO/IEC 17025 7.3.1 / 7.5.2.';
  END IF;

  -- OLD.status = 'draft'
  IF NEW.status IN ('superseded', 'withdrawn') THEN
    RAISE EXCEPTION 'A draft cannot be superseded or withdrawn. Delete it or approve it.' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'approved' THEN
    IF NOT public.app_sampling_can_manage() THEN
      RAISE EXCEPTION 'Only the Laboratory Director, Quality Manager or a Technical Manager can approve a sampling plan.'
        USING ERRCODE = '42501';
    END IF;
    IF btrim(coalesce(NEW.method_reference, '')) = '' AND NEW.is_code_id IS NULL THEN
      RAISE EXCEPTION 'Record the sampling standard / method reference before approval.' USING ERRCODE = '23514';
    END IF;
    IF NEW.sample_size IS NULL AND btrim(coalesce(NEW.statistical_basis, '')) = '' THEN
      RAISE EXCEPTION 'Record the statistical basis (sample size or the scheme used) before approval.'
        USING ERRCODE = '23514';
    END IF;
    IF btrim(coalesce(NEW.factors_to_control, '')) = '' THEN
      RAISE EXCEPTION 'Record the factors to be controlled before approval (ISO/IEC 17025 7.3.1 c).'
        USING ERRCODE = '23514';
    END IF;
    NEW.approved_by := v_uid;
    NEW.approved_by_name := coalesce(public.app_sampling_profile_name(v_uid), nullif(btrim(NEW.approved_by_name), ''));
    NEW.approved_at := now();
    RETURN NEW;
  END IF;

  -- Still a draft: approval fields stay empty.
  NEW.approved_by := NULL;
  NEW.approved_by_name := NULL;
  NEW.approved_at := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sampling_plans_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sampling_plans_guard ON public.sampling_plans;
CREATE TRIGGER trg_sampling_plans_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sampling_plans
  FOR EACH ROW EXECUTE FUNCTION public.sampling_plans_guard();

-- When a new version is approved, the previous approved version is superseded.
CREATE OR REPLACE FUNCTION public.sampling_plans_after_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.sampling_plans
       SET status = 'superseded'
     WHERE plan_no = NEW.plan_no
       AND id <> NEW.id
       AND version < NEW.version
       AND status = 'approved';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sampling_plans_after_approve() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sampling_plans_after_approve ON public.sampling_plans;
CREATE TRIGGER trg_sampling_plans_after_approve
  AFTER UPDATE OF status ON public.sampling_plans
  FOR EACH ROW EXECUTE FUNCTION public.sampling_plans_after_approve();

-- ---------------------------------------------------------------------------
-- 5. Records: numbering, sampler, plan must be approved.
-- ---------------------------------------------------------------------------

-- Status of a plan whatever the caller's module access (records screen).
CREATE OR REPLACE FUNCTION public.app_sampling_plan_status(p_plan_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.status FROM public.sampling_plans p WHERE p.id = p_plan_id;
$$;

REVOKE ALL ON FUNCTION public.app_sampling_plan_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sampling_plan_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_sampling_client_name(p_client_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT nullif(btrim(c.company_name), '') FROM public.clients c WHERE c.id = p_client_id;
$$;

REVOKE ALL ON FUNCTION public.app_sampling_client_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_sampling_client_name(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sampling_records_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := current_user IN ('authenticated', 'anon');
  v_uid uuid := auth.uid();
  v_status text;
  v_year text;
  v_next int;
  v_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.chain_of_custody := coalesce(NEW.chain_of_custody, '[]'::jsonb);
  NEW.attachments := coalesce(NEW.attachments, '[]'::jsonb);

  IF TG_OP = 'INSERT' THEN
    IF v_app THEN
      IF NOT public.app_sampling_enabled() THEN
        RAISE EXCEPTION 'Sampling is not in use. The Laboratory Director can enable it in Lab Settings.'
          USING ERRCODE = '42501';
      END IF;
      NEW.created_by := v_uid;
      NEW.created_at := now();
      NEW.sampler_id := coalesce(NEW.sampler_id, v_uid);
    END IF;
    IF v_app OR NEW.record_no IS NULL OR btrim(NEW.record_no) = '' THEN
      v_year := to_char(coalesce(NEW.sampled_at, now()), 'YYYY');
      PERFORM pg_advisory_xact_lock(hashtext('sampling_records:SR' || v_year));
      SELECT coalesce(max(substring(r.record_no FROM '([0-9]+)$')::int), 0) + 1
        INTO v_next
        FROM public.sampling_records r
       WHERE r.record_no ~ ('^SR-' || v_year || '-[0-9]+$');
      NEW.record_no := 'SR-' || v_year || '-' || lpad(v_next::text, 3, '0');
    END IF;
  ELSIF v_app THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.record_no IS DISTINCT FROM OLD.record_no
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Record number and author of a sampling record cannot be changed.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_app AND NEW.sampled_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'Sampling cannot be recorded in the future (%).', NEW.sampled_at USING ERRCODE = '22007';
  END IF;

  IF NEW.plan_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN
    v_status := public.app_sampling_plan_status(NEW.plan_id);
    IF v_status IS NULL THEN
      RAISE EXCEPTION 'Unknown sampling plan' USING ERRCODE = '23503';
    END IF;
    IF v_app AND v_status <> 'approved' THEN
      RAISE EXCEPTION 'Sampling must follow an approved plan (this plan is %).', v_status USING ERRCODE = '42501';
    END IF;
  END IF;

  -- The sampler's profile name wins over a name sent by the client.
  IF NEW.sampler_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.sampler_id IS DISTINCT FROM OLD.sampler_id OR btrim(coalesce(NEW.sampler_name, '')) = '') THEN
    v_name := public.app_sampling_profile_name(NEW.sampler_id);
    IF v_name IS NOT NULL THEN
      NEW.sampler_name := v_name;
    END IF;
  END IF;

  IF NEW.client_id IS NOT NULL AND btrim(coalesce(NEW.customer_name, '')) = '' THEN
    NEW.customer_name := public.app_sampling_client_name(NEW.client_id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sampling_records_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sampling_records_guard ON public.sampling_records;
CREATE TRIGGER trg_sampling_records_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.sampling_records
  FOR EACH ROW EXECUTE FUNCTION public.sampling_records_guard();

-- ---------------------------------------------------------------------------
-- 6. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.sampling_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sampling_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sampling_plans_select ON public.sampling_plans;
CREATE POLICY sampling_plans_select ON public.sampling_plans
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS sampling_plans_insert ON public.sampling_plans;
CREATE POLICY sampling_plans_insert ON public.sampling_plans
  FOR INSERT TO authenticated WITH CHECK (public.app_sampling_can_manage());
DROP POLICY IF EXISTS sampling_plans_update ON public.sampling_plans;
CREATE POLICY sampling_plans_update ON public.sampling_plans
  FOR UPDATE TO authenticated
  USING (public.app_sampling_can_manage())
  WITH CHECK (public.app_sampling_can_manage());
DROP POLICY IF EXISTS sampling_plans_delete ON public.sampling_plans;
CREATE POLICY sampling_plans_delete ON public.sampling_plans
  FOR DELETE TO authenticated USING (status = 'draft' AND public.app_sampling_can_manage());

DROP POLICY IF EXISTS sampling_records_select ON public.sampling_records;
CREATE POLICY sampling_records_select ON public.sampling_records
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS sampling_records_insert ON public.sampling_records;
CREATE POLICY sampling_records_insert ON public.sampling_records
  FOR INSERT TO authenticated WITH CHECK (public.app_sampling_can_record());
DROP POLICY IF EXISTS sampling_records_update ON public.sampling_records;
CREATE POLICY sampling_records_update ON public.sampling_records
  FOR UPDATE TO authenticated
  USING (public.app_sampling_can_record())
  WITH CHECK (public.app_sampling_can_record());
DROP POLICY IF EXISTS sampling_records_delete ON public.sampling_records;
CREATE POLICY sampling_records_delete ON public.sampling_records
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

-- Same outer gate as every other public table (20261009063000).
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['sampling_plans', 'sampling_records'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
END $$;

REVOKE ALL ON public.sampling_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sampling_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sampling_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sampling_records TO authenticated;
GRANT ALL ON public.sampling_plans TO service_role;
GRANT ALL ON public.sampling_records TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Storage: sampling photos / attachments (private; signed URLs only).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema missing; sampling-files bucket skipped.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'sampling-files',
    'sampling-files',
    false,
    26214400,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf'
    ]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS lims_sampling_files_select ON storage.objects;
  CREATE POLICY lims_sampling_files_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'sampling-files' AND public.app_is_known_staff());

  DROP POLICY IF EXISTS lims_sampling_files_insert ON storage.objects;
  CREATE POLICY lims_sampling_files_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'sampling-files' AND public.app_sampling_can_record());

  DROP POLICY IF EXISTS lims_sampling_files_update ON storage.objects;
  CREATE POLICY lims_sampling_files_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'sampling-files' AND public.app_sampling_can_record())
    WITH CHECK (bucket_id = 'sampling-files' AND public.app_sampling_can_record());

  DROP POLICY IF EXISTS lims_sampling_files_delete ON storage.objects;
  CREATE POLICY lims_sampling_files_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'sampling-files' AND public.app_sampling_can_record());
END $$;

-- ---------------------------------------------------------------------------
-- 8. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: sampling tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['sampling_plans', 'sampling_records'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Module access (20261029100200), when present: map the new tables and
--    re-install the module access policies.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_installed int;
BEGIN
  IF to_regclass('public.module_table_map') IS NULL
     OR to_regprocedure('public.app_module_access_install()') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.module_table_map WHERE source = 'seed:20261101100200';
  INSERT INTO public.module_table_map (table_name, module_path, write_requires, read_requires, source, note)
  SELECT t, p, w, r, 'seed:20261101100200', n
  FROM (VALUES
    ('sampling_plans', '/sampling/plans', 'edit', 'view', 'sampling plans (7.3)'),
    ('sampling_plans', '/sampling/records', 'never', 'view', 'plan picker on sampling records'),
    ('sampling_plans', '/samples/report-preparation', 'never', 'view', 'sampling information in the report (7.8.5)'),
    ('sampling_plans', '/samples/completed', 'never', 'view', 'sampling information in the report (7.8.5)'),
    ('sampling_records', '/sampling/records', 'edit', 'view', 'sampling records (7.3.3)'),
    ('sampling_records', '/samples/report-preparation', 'never', 'view', 'sampling information in the report (7.8.5)'),
    ('sampling_records', '/samples/completed', 'never', 'view', 'sampling information in the report (7.8.5)')
  ) AS v(t, p, w, r, n)
  ON CONFLICT (table_name, module_path) DO NOTHING;
  SELECT count(*) INTO v_installed FROM public.app_module_access_install() WHERE status = 'installed';
  RAISE NOTICE 'module access re-installed on % tables', v_installed;
END $$;

NOTIFY pgrst, 'reload schema';
