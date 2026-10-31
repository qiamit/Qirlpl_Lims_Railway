-- Metallurgy & Metallography module, Phase 1 (migration 55; design
-- docs/metallography-module-design.md section 3.2). ISO/IEC 17025 6.4, 6.5,
-- 7.2, 7.5.1, 7.7, 7.11.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- staging first, after a backup, while the lab is idle:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261102101700_metallurgy_module.sql
-- Needs 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director, write_audit_log), 20261009103000
-- (app_is_quality_manager), 20261026100100 / 20261028100200
-- (equipment_usable_on), 20261027100100_method_validation.sql
-- (method_verifications), 20261029100200_db_module_access.sql
-- (app_module_level_full, module_table_map, app_module_access_install) and
-- 20261029100300_capa_opinions_observations.sql (app_profile_name). Safe to
-- re-run. The frontend works with or without it (missingSchema checks).
--
-- The module is OFF by default (metallography_settings.enabled = false). Until
-- the Laboratory Director switches it on, nothing can be analysed (except by
-- the Director) and Enter Results shows no "Metallography" link.
--
-- What it adds
--   metallography_settings            one row: enabled, ai_mode (AI stays off).
--                                     Laboratory Director only.
--   metallography_parameter_methods   which test parameters are metallography
--                                     tests and how they are run (kind,
--                                     standard, reported quantity, minimum
--                                     fields, scale mode, settings such as the
--                                     ring-test limits) and the method
--                                     validation record that makes a result
--                                     reportable. Director or Edit on
--                                     /metallography/methods. Referenced rows
--                                     cannot be deleted (deactivate instead).
--   metallography_scale_calibrations  microscope µm/px records (MSC-YYYY-NNN):
--                                     stage micrometer readings (>= 3 per
--                                     axis), µm/px and u_rel recomputed by the
--                                     database from the readings, evidence
--                                     image, verification by a second person
--                                     with equipment checks (Director override
--                                     with a reason). Verified rows are
--                                     read-only except withdraw / shorten.
--   metallography_analyses            one technical record behind one result
--                                     (MA-YYYY-NNNNN): links derived from the
--                                     result row, method snapshot, Indicative
--                                     flag, scale and equipment snapshots,
--                                     result summary and reported value. On
--                                     completion the database checks fields,
--                                     scale, equipment and, for the ring test,
--                                     recomputes the PASS / FAIL decision. An
--                                     earlier completed analysis of the same
--                                     result row becomes superseded.
--   metallography_fields              one original image per field (SHA-256,
--                                     never changed), marks, annotations,
--                                     adjustments, measurements.
--   metallography_rechecks            append-only reviewer re-checks (7.7);
--                                     never by the analyst.
--   metallography_counters            numbering (no access for signed-in users).
--   test_allocation_parameters.metallography_analysis_id
--                                     the result row's link to its analysis;
--                                     tap_metallography_link_guard keeps the
--                                     saved result equal to the analysis's
--                                     reported value.
--   Private bucket metallography-images (25 MB, no update policy: originals
--   are never overwritten).
--
-- Access: read by known staff (lims_known_staff_only), writes as in the table
-- in the design (3.2 "RLS and grants"); all guards skip psql maintenance
-- (auth.uid() IS NULL). No Recycle Bin: records are voided / withdrawn,
-- physical deletes are limited to drafts and the Director and recorded by
-- write_audit_log. Module access map: seed:20261102101700.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL
     OR to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql and 20261024100000_audit_trail_expansion.sql first';
  END IF;
  IF to_regprocedure('public.app_is_quality_manager()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009103000_issued_flows_signup_and_unique_numbers.sql first (app_is_quality_manager)';
  END IF;
  IF to_regprocedure('public.app_profile_name(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261029100300_capa_opinions_observations.sql first (app_profile_name)';
  END IF;
  IF to_regprocedure('public.equipment_usable_on(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261026100100_equipment_traceability.sql first (equipment_usable_on)';
  END IF;
  IF to_regprocedure('public.app_module_level_full(text)') IS NULL
     OR to_regprocedure('public.app_module_access_install()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261029100200_db_module_access.sql first (app_module_level_full, app_module_access_install)';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'set_updated_at() is missing (baseline schema)';
  END IF;
  IF to_regclass('public.samples') IS NULL
     OR to_regclass('public.test_allocations') IS NULL
     OR to_regclass('public.test_allocation_parameters') IS NULL
     OR to_regclass('public.test_parameters') IS NULL
     OR to_regclass('public.equipment_master') IS NULL
     OR to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'samples, test_allocations, test_allocation_parameters, test_parameters, equipment_master and user_profiles must exist first';
  END IF;
  IF to_regclass('public.method_verifications') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261027100100_method_validation.sql first (method_verifications)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- 1.1 Settings (singleton row id = 1).
CREATE TABLE IF NOT EXISTS public.metallography_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  ai_mode text NOT NULL DEFAULT 'off',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metallography_settings_singleton_check CHECK (id = 1),
  CONSTRAINT metallography_settings_ai_mode_check CHECK (ai_mode IN ('off', 'numeric_only', 'image'))
);

INSERT INTO public.metallography_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.metallography_settings IS
  'Metallurgy & Metallography switch (one row). enabled = false until the Laboratory Director turns the module on; ai_mode stays off unless the lab opts in.';

-- 1.2 Method setup per test parameter.
CREATE TABLE IF NOT EXISTS public.metallography_parameter_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_parameter_id uuid NOT NULL REFERENCES public.test_parameters (id) ON DELETE RESTRICT,
  analysis_kind text NOT NULL,
  -- intercept, planimetric, comparison, point_count, threshold, ...
  method_variant text,
  -- prefilled from test_parameters.test_method when empty
  standard_ref text NOT NULL,
  -- G, mean_depth_mm, worst_field_ratings, ring_values, ...
  reported_quantity text NOT NULL,
  reported_unit text,
  decimals int,
  min_fields int NOT NULL DEFAULT 1,
  min_counts_per_field int,
  scale_mode text NOT NULL DEFAULT 'calibration',
  -- Ring test: {"thickness_min_factor": 0.07, "thickness_max_factor": 0.15,
  --   "tm_share_min_pct": 30, "tm_share_max_pct": 50, "limits_inclusive": true,
  --   "limits_verified": false, "outer_gap_px": 1, "inner_gap_px": 1,
  --   "angular_correction_deg": 0}. Inclusion rating limits are entered and
  -- verified by the Technical Manager from the lab's licensed standard.
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  method_verification_id uuid REFERENCES public.method_verifications (id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metallography_parameter_methods_parameter_key UNIQUE (test_parameter_id),
  CONSTRAINT metallography_parameter_methods_kind_check CHECK (
    analysis_kind IN ('ring_test', 'grain_size', 'inclusion', 'decarburization', 'microstructure', 'macro')
  ),
  CONSTRAINT metallography_parameter_methods_scale_mode_check CHECK (
    scale_mode = 'calibration'
    OR (scale_mode = 'in_image_reference' AND analysis_kind IN ('ring_test', 'macro'))
  ),
  CONSTRAINT metallography_parameter_methods_standard_check CHECK (btrim(standard_ref) <> ''),
  CONSTRAINT metallography_parameter_methods_quantity_check CHECK (btrim(reported_quantity) <> ''),
  CONSTRAINT metallography_parameter_methods_fields_check CHECK (min_fields > 0),
  CONSTRAINT metallography_parameter_methods_counts_check CHECK (min_counts_per_field IS NULL OR min_counts_per_field > 0),
  CONSTRAINT metallography_parameter_methods_decimals_check CHECK (decimals IS NULL OR decimals BETWEEN 0 AND 6),
  CONSTRAINT metallography_parameter_methods_settings_check CHECK (jsonb_typeof(settings) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_metallography_parameter_methods_verification
  ON public.metallography_parameter_methods (method_verification_id);

COMMENT ON TABLE public.metallography_parameter_methods IS
  'Which test parameters are metallography tests and how they are run (kind, standard, reported quantity, minimum fields, scale mode, settings). Reportable only with an approved, in-date method validation record; otherwise results are Indicative.';

-- 1.3 Microscope scale calibrations (µm/px).
CREATE TABLE IF NOT EXISTS public.metallography_scale_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cal_code text,
  microscope_equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE RESTRICT,
  camera_equipment_id uuid REFERENCES public.equipment_master (id) ON DELETE RESTRICT,
  stage_micrometer_equipment_id uuid NOT NULL REFERENCES public.equipment_master (id) ON DELETE RESTRICT,
  objective text NOT NULL,
  total_magnification numeric,
  -- µm/px is valid only at this resolution
  image_width_px int NOT NULL,
  image_height_px int NOT NULL,
  camera_settings jsonb,
  reference_length_um numeric NOT NULL,
  -- [{"axis": "x", "x1": 10, "y1": 20, "x2": 210, "y2": 20, "length_px": 200}]
  -- length_px is recomputed by the database from the coordinates.
  readings jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- reference_length_um / mean length_px of the axis (set by the database)
  um_per_px_x numeric NOT NULL,
  um_per_px_y numeric NOT NULL,
  -- relative standard deviation of the readings in % (s / mean × 100), the
  -- larger of the two axes (set by the database)
  u_rel_scale numeric,
  evidence_image_path text NOT NULL,
  evidence_image_sha256 text NOT NULL,
  performed_by uuid DEFAULT auth.uid(),
  performed_by_name text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid,
  verified_by_name text,
  verified_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  valid_from date,
  valid_until date NOT NULL,
  override_reason text,
  withdraw_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metallography_scale_calibrations_cal_code_key UNIQUE (cal_code),
  CONSTRAINT metallography_scale_calibrations_status_check CHECK (status IN ('draft', 'verified', 'withdrawn')),
  CONSTRAINT metallography_scale_calibrations_objective_check CHECK (btrim(objective) <> ''),
  CONSTRAINT metallography_scale_calibrations_size_check CHECK (image_width_px > 0 AND image_height_px > 0),
  CONSTRAINT metallography_scale_calibrations_reference_check CHECK (reference_length_um > 0),
  CONSTRAINT metallography_scale_calibrations_um_check CHECK (
    um_per_px_x > 0 AND um_per_px_x < 1000 AND um_per_px_y > 0 AND um_per_px_y < 1000
  ),
  CONSTRAINT metallography_scale_calibrations_readings_check CHECK (jsonb_typeof(readings) = 'array'),
  CONSTRAINT metallography_scale_calibrations_sha_check CHECK (evidence_image_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT metallography_scale_calibrations_validity_check CHECK (valid_from IS NULL OR valid_until >= valid_from),
  CONSTRAINT metallography_scale_calibrations_verified_check CHECK (
    status = 'draft' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT metallography_scale_calibrations_withdraw_check CHECK (
    status <> 'withdrawn' OR btrim(coalesce(withdraw_reason, '')) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_metallography_scale_calibrations_microscope
  ON public.metallography_scale_calibrations (microscope_equipment_id);
CREATE INDEX IF NOT EXISTS idx_metallography_scale_calibrations_status
  ON public.metallography_scale_calibrations (status, valid_until);

COMMENT ON TABLE public.metallography_scale_calibrations IS
  'Microscope scale calibrations (µm/px) from stage micrometer readings (ISO/IEC 17025 6.4, 6.5, 7.5). µm/px and u_rel are recomputed by the database; verified by a second person; read-only once verified (withdraw or shorten only).';

-- 1.4 Analyses.
CREATE TABLE IF NOT EXISTS public.metallography_analyses (
  -- the browser may supply the id so storage paths can be built first
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_no text,
  purpose text NOT NULL DEFAULT 'sample',
  test_allocation_parameter_id uuid REFERENCES public.test_allocation_parameters (id) ON DELETE RESTRICT,
  -- always derived by the database from the result row
  sample_id uuid REFERENCES public.samples (id) ON DELETE RESTRICT,
  test_allocation_id uuid REFERENCES public.test_allocations (id) ON DELETE RESTRICT,
  test_parameter_id uuid REFERENCES public.test_parameters (id) ON DELETE RESTRICT,
  method_id uuid REFERENCES public.metallography_parameter_methods (id) ON DELETE RESTRICT,
  -- kind, standard, settings and reportable flag at creation
  method_snapshot jsonb,
  analysis_kind text NOT NULL,
  indicative boolean NOT NULL DEFAULT true,
  scale_calibration_id uuid REFERENCES public.metallography_scale_calibrations (id) ON DELETE RESTRICT,
  -- cal_code, µm/px x and y, objective, resolution, validity, u_rel (set by the database)
  scale_snapshot jsonb,
  -- {"lines": [{"x1":..,"y1":..,"x2":..,"y2":..,"length_mm":..,"length_px":..}],
  --  "ruler_equipment_id": "<uuid>", "field_no": 1, "mm_per_px": ..}
  -- length_px and mm_per_px are recomputed by the database.
  in_image_scale jsonb,
  microscope_equipment_id uuid REFERENCES public.equipment_master (id) ON DELETE RESTRICT,
  camera_equipment_id uuid REFERENCES public.equipment_master (id) ON DELETE RESTRICT,
  -- EquipmentUsedSnapshot[] (frontend/src/lib/equipmentTraceability.ts)
  equipment_snapshot jsonb,
  magnification text,
  etchant text,
  -- {"orientation": "L"|"T", "polish": "", "etch_time_s": 10, "location": ""}
  specimen_prep jsonb,
  test_date date NOT NULL DEFAULT current_date,
  engine_version text,
  engine_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- per-kind summary; ring test: see app_metallography_ring_check()
  result_summary jsonb,
  -- the exact text that goes to test_allocation_parameters.results
  reported_value text,
  reported_unit text,
  status text NOT NULL DEFAULT 'in_progress',
  completed_by uuid,
  completed_at timestamptz,
  superseded_by uuid REFERENCES public.metallography_analyses (id) ON DELETE RESTRICT,
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  -- Laboratory Director override at completion (equipment / calibration date)
  override_reason text,
  include_in_report boolean NOT NULL DEFAULT false,
  performed_by uuid DEFAULT auth.uid(),
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metallography_analyses_analysis_no_key UNIQUE (analysis_no),
  CONSTRAINT metallography_analyses_purpose_check CHECK (purpose IN ('sample', 'validation', 'iqc', 'training')),
  CONSTRAINT metallography_analyses_link_check CHECK (
    (purpose = 'sample' AND test_allocation_parameter_id IS NOT NULL)
    OR (purpose <> 'sample' AND test_allocation_parameter_id IS NULL)
  ),
  CONSTRAINT metallography_analyses_kind_check CHECK (
    analysis_kind IN ('ring_test', 'grain_size', 'inclusion', 'decarburization', 'microstructure', 'macro')
  ),
  CONSTRAINT metallography_analyses_status_check CHECK (status IN ('in_progress', 'completed', 'superseded', 'void')),
  CONSTRAINT metallography_analyses_completed_check CHECK (
    status NOT IN ('completed', 'superseded') OR completed_at IS NOT NULL
  ),
  CONSTRAINT metallography_analyses_void_check CHECK (status <> 'void' OR btrim(coalesce(void_reason, '')) <> ''),
  CONSTRAINT metallography_analyses_params_check CHECK (jsonb_typeof(engine_params) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS metallography_analyses_one_in_progress
  ON public.metallography_analyses (test_allocation_parameter_id) WHERE status = 'in_progress';
CREATE UNIQUE INDEX IF NOT EXISTS metallography_analyses_one_completed
  ON public.metallography_analyses (test_allocation_parameter_id) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_metallography_analyses_sample ON public.metallography_analyses (sample_id);
CREATE INDEX IF NOT EXISTS idx_metallography_analyses_kind ON public.metallography_analyses (analysis_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metallography_analyses_status ON public.metallography_analyses (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metallography_analyses_calibration ON public.metallography_analyses (scale_calibration_id);
CREATE INDEX IF NOT EXISTS idx_metallography_analyses_method ON public.metallography_analyses (method_id);

COMMENT ON TABLE public.metallography_analyses IS
  'One metallography analysis behind one result (ISO/IEC 17025 7.5.1): method and scale snapshots, equipment, engine version, result summary and reported value (MA-YYYY-NNNNN). Completion is checked by the database; the ring-test decision is recomputed in SQL.';

-- 1.5 Fields (one original image each).
CREATE TABLE IF NOT EXISTS public.metallography_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.metallography_analyses (id) ON DELETE RESTRICT,
  field_no int NOT NULL,
  -- not unique: a superseding analysis re-uses the same stored original
  raw_image_path text NOT NULL,
  raw_image_sha256 text NOT NULL,
  raw_image_bytes bigint,
  raw_image_mime text,
  original_file_name text,
  image_width_px int,
  image_height_px int,
  captured_at timestamptz,
  location_on_specimen text,
  -- view only (brightness, contrast, zoom)
  display_settings jsonb,
  -- crop ROI, rotation, exclusion polygons (re-applied on every engine run)
  operator_adjustments jsonb,
  -- {"items": [Mark, ...]} each mark with origin 'engine' | 'operator'
  marks jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- text and arrows, never analysed
  annotations jsonb,
  measurements jsonb,
  features_path text,
  features_sha256 text,
  rendered_overlay_path text,
  include_in_report boolean NOT NULL DEFAULT false,
  excluded boolean NOT NULL DEFAULT false,
  exclude_reason text,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metallography_fields_field_no_key UNIQUE (analysis_id, field_no),
  CONSTRAINT metallography_fields_field_no_check CHECK (field_no > 0),
  CONSTRAINT metallography_fields_sha_check CHECK (raw_image_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT metallography_fields_features_sha_check CHECK (features_sha256 IS NULL OR features_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT metallography_fields_size_check CHECK (
    (image_width_px IS NULL OR image_width_px > 0) AND (image_height_px IS NULL OR image_height_px > 0)
    AND (raw_image_bytes IS NULL OR raw_image_bytes > 0)
  ),
  CONSTRAINT metallography_fields_marks_check CHECK (jsonb_typeof(marks) = 'object'),
  CONSTRAINT metallography_fields_exclude_check CHECK (NOT excluded OR btrim(coalesce(exclude_reason, '')) <> '')
);

CREATE INDEX IF NOT EXISTS idx_metallography_fields_raw_path ON public.metallography_fields (raw_image_path);

COMMENT ON TABLE public.metallography_fields IS
  'Original images (fields of view) of a metallography analysis: SHA-256 hashed and never changed, with vector marks (engine / operator), adjustments and annotations (never analysed).';

-- 1.6 Reviewer re-checks (append-only).
CREATE TABLE IF NOT EXISTS public.metallography_rechecks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.metallography_analyses (id) ON DELETE RESTRICT,
  engine_version text,
  hashes_verified boolean NOT NULL DEFAULT false,
  match boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_by uuid DEFAULT auth.uid(),
  run_by_name text,
  run_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metallography_rechecks_analysis ON public.metallography_rechecks (analysis_id, run_at);

COMMENT ON TABLE public.metallography_rechecks IS
  'Reviewer re-checks of metallography analyses (ISO/IEC 17025 7.7): stored originals re-hashed and the stored engine version re-run. Append-only; never by the analyst.';

-- 1.7 Numbering counters (no access for signed-in users).
CREATE TABLE IF NOT EXISTS public.metallography_counters (
  kind text NOT NULL,
  year int NOT NULL,
  last int NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, year)
);

COMMENT ON TABLE public.metallography_counters IS
  'Numbering counters for metallography records (MA analyses, MSC calibrations). Internal.';

-- 1.8 The result row's link to its analysis.
ALTER TABLE public.test_allocation_parameters
  ADD COLUMN IF NOT EXISTS metallography_analysis_id uuid
  CONSTRAINT test_allocation_parameters_metallography_analysis_fkey
  REFERENCES public.metallography_analyses (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tap_metallography_analysis
  ON public.test_allocation_parameters (metallography_analysis_id)
  WHERE metallography_analysis_id IS NOT NULL;

COMMENT ON COLUMN public.test_allocation_parameters.metallography_analysis_id IS
  'Metallography analysis the result comes from. While set, results must equal the analysis reported_value (tap_metallography_link_guard).';

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'metallography_settings', 'metallography_parameter_methods', 'metallography_scale_calibrations',
    'metallography_analyses', 'metallography_fields'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Next number: 'MA' -> MA-YYYY-NNNNN, 'MSC' -> MSC-YYYY-NNN. Internal.
CREATE OR REPLACE FUNCTION public.metallography_next_number(p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year int := extract(year FROM current_date)::int;
  v_last int;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('MA', 'MSC') THEN
    RAISE EXCEPTION 'Unknown metallography number kind %', p_kind USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.metallography_counters AS c (kind, year, last)
  VALUES (p_kind, v_year, 1)
  ON CONFLICT (kind, year) DO UPDATE SET last = c.last + 1
  RETURNING c.last INTO v_last;
  RETURN p_kind || '-' || v_year::text || '-' || lpad(v_last::text, CASE WHEN p_kind = 'MA' THEN 5 ELSE 3 END, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_next_number(text) FROM PUBLIC, anon, authenticated;

-- A JSON number as numeric (NULL when not a number).
CREATE OR REPLACE FUNCTION public.app_metallography_num(p jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::numeric END;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_num(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_metallography_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT s.enabled FROM public.metallography_settings s WHERE s.id = 1), false);
$$;

REVOKE ALL ON FUNCTION public.app_metallography_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_enabled() TO authenticated, service_role;

-- Run analyses: Director or Edit on /metallography/analyses.
CREATE OR REPLACE FUNCTION public.app_metallography_can_run()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.app_is_laboratory_director()
          OR coalesce(public.app_module_level_full('/metallography/analyses'), 'none') = 'edit');
$$;

REVOKE ALL ON FUNCTION public.app_metallography_can_run() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_can_run() TO authenticated, service_role;

-- Record / verify microscope calibrations: Director or Edit on /metallography/scale-calibrations.
CREATE OR REPLACE FUNCTION public.app_metallography_can_calibrate()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.app_is_laboratory_director()
          OR coalesce(public.app_module_level_full('/metallography/scale-calibrations'), 'none') = 'edit');
$$;

REVOKE ALL ON FUNCTION public.app_metallography_can_calibrate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_can_calibrate() TO authenticated, service_role;

-- Method Setup: Director or Edit on /metallography/methods.
CREATE OR REPLACE FUNCTION public.app_metallography_can_manage_methods()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.app_is_laboratory_director()
          OR coalesce(public.app_module_level_full('/metallography/methods'), 'none') = 'edit');
$$;

REVOKE ALL ON FUNCTION public.app_metallography_can_manage_methods() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_can_manage_methods() TO authenticated, service_role;

-- Does a method validation / verification record cover this method? Its test
-- parameter is the method's, or it has no parameter and its method reference
-- is the method's standard (case and spacing ignored).
CREATE OR REPLACE FUNCTION public.app_metallography_verification_covers(
  p_verification uuid, p_test_parameter uuid, p_standard_ref text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.method_verifications v
    WHERE v.id = p_verification
      AND (
        v.test_parameter_id = p_test_parameter
        OR (v.test_parameter_id IS NULL
            AND lower(regexp_replace(btrim(coalesce(v.method_reference, '')), '\s+', ' ', 'g'))
                = lower(regexp_replace(btrim(coalesce(p_standard_ref, '')), '\s+', ' ', 'g'))
            AND btrim(coalesce(p_standard_ref, '')) <> '')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.app_metallography_verification_covers(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_verification_covers(uuid, uuid, text) TO authenticated, service_role;

-- Reportable: the linked method validation record covers this method (same
-- test parameter, or same standard when the record has no parameter), is
-- approved, its conclusion is fit_for_purpose or conditional, and it is in date.
CREATE OR REPLACE FUNCTION public.app_metallography_method_reportable(p_method uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.metallography_parameter_methods m
    JOIN public.method_verifications v ON v.id = m.method_verification_id
    WHERE m.id = p_method
      AND public.app_metallography_verification_covers(v.id, m.test_parameter_id, m.standard_ref)
      AND v.status = 'approved'
      AND v.conclusion IN ('fit_for_purpose', 'conditional')
      AND (v.valid_until IS NULL OR v.valid_until >= current_date)
      AND (to_jsonb(v) ->> 'deleted_at') IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.app_metallography_method_reportable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_method_reportable(uuid) TO authenticated, service_role;

-- Same lock states as migrations 53 / 54 and the issued-row freeze.
CREATE OR REPLACE FUNCTION public.app_metallography_result_locked(p_tap uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT coalesce(p.results_review_status IN ('under_review', 'approved'), false)
        OR coalesce(s.stage = 'completed', false)
    FROM public.test_allocation_parameters p
    JOIN public.test_allocations ta ON ta.id = p.test_allocation_id
    LEFT JOIN public.samples s ON s.id = ta.sample_id
    WHERE p.id = p_tap
  ), false);
$$;

REVOKE ALL ON FUNCTION public.app_metallography_result_locked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_result_locked(uuid) TO authenticated, service_role;

-- Method snapshot stored on each analysis.
CREATE OR REPLACE FUNCTION public.app_metallography_method_snapshot(p_method uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'method_id', m.id,
    'test_parameter_id', m.test_parameter_id,
    'analysis_kind', m.analysis_kind,
    'method_variant', m.method_variant,
    'standard_ref', m.standard_ref,
    'reported_quantity', m.reported_quantity,
    'reported_unit', m.reported_unit,
    'decimals', m.decimals,
    'min_fields', m.min_fields,
    'min_counts_per_field', m.min_counts_per_field,
    'scale_mode', m.scale_mode,
    'settings', m.settings,
    'method_verification_id', m.method_verification_id,
    'method_verification_no', v.record_no,
    'reportable', public.app_metallography_method_reportable(m.id),
    'snapshot_at', now()
  )
  FROM public.metallography_parameter_methods m
  LEFT JOIN public.method_verifications v ON v.id = m.method_verification_id
  WHERE m.id = p_method;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_method_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- Scale snapshot of a calibration.
CREATE OR REPLACE FUNCTION public.app_metallography_scale_snapshot(p_cal uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'calibration_id', c.id,
    'cal_code', c.cal_code,
    'status', c.status,
    'um_per_px_x', c.um_per_px_x,
    'um_per_px_y', c.um_per_px_y,
    'u_rel_scale', c.u_rel_scale,
    'objective', c.objective,
    'total_magnification', c.total_magnification,
    'image_width_px', c.image_width_px,
    'image_height_px', c.image_height_px,
    'valid_from', coalesce(c.valid_from, c.performed_at::date),
    'valid_until', c.valid_until,
    'microscope_equipment_id', c.microscope_equipment_id,
    'camera_equipment_id', c.camera_equipment_id,
    'stage_micrometer_equipment_id', c.stage_micrometer_equipment_id,
    'performed_by_name', c.performed_by_name,
    'verified_by_name', c.verified_by_name,
    'verified_at', c.verified_at,
    'snapshot_at', now()
  )
  FROM public.metallography_scale_calibrations c
  WHERE c.id = p_cal;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_scale_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- Does a stored object exist? NULL when it cannot be checked here.
CREATE OR REPLACE FUNCTION public.app_metallography_object_exists(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_found boolean;
BEGIN
  IF to_regclass('storage.objects') IS NULL OR p_name IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = $1 AND o.name = $2)'
      INTO v_found USING 'metallography-images', p_name;
  EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_column THEN
    RETURN NULL;
  END;
  RETURN v_found;
END;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_object_exists(text) FROM PUBLIC, anon, authenticated;

-- In-image scale (ring and macro photos): validates the shape and recomputes
-- length_px of each line and mm_per_px = mean(length_mm / length_px).
CREATE OR REPLACE FUNCTION public.app_metallography_in_image_scale(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_x1 numeric; v_y1 numeric; v_x2 numeric; v_y2 numeric;
  v_mm numeric;
  v_px numeric;
  v_sum numeric := 0;
  v_n int := 0;
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p) <> 'object' OR jsonb_typeof(p -> 'lines') <> 'array' THEN
    RAISE EXCEPTION 'In-image scale needs at least one reference line of known length.' USING ERRCODE = '22023';
  END IF;
  IF nullif(p ->> 'ruler_equipment_id', '') IS NOT NULL
     AND (p ->> 'ruler_equipment_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'In-image scale: the ruler equipment id is not valid.' USING ERRCODE = '22023';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p -> 'lines') LOOP
    v_x1 := public.app_metallography_num(v_line -> 'x1');
    v_y1 := public.app_metallography_num(v_line -> 'y1');
    v_x2 := public.app_metallography_num(v_line -> 'x2');
    v_y2 := public.app_metallography_num(v_line -> 'y2');
    v_mm := public.app_metallography_num(v_line -> 'length_mm');
    IF v_x1 IS NULL OR v_y1 IS NULL OR v_x2 IS NULL OR v_y2 IS NULL THEN
      RAISE EXCEPTION 'In-image scale: each reference line needs x1, y1, x2, y2 (pixels).' USING ERRCODE = '22023';
    END IF;
    IF v_mm IS NULL OR v_mm <= 0 THEN
      RAISE EXCEPTION 'In-image scale: each reference line needs its known length in mm.' USING ERRCODE = '22023';
    END IF;
    v_px := sqrt(power(v_x2 - v_x1, 2) + power(v_y2 - v_y1, 2));
    IF v_px < 1 THEN
      RAISE EXCEPTION 'In-image scale: a reference line is shorter than one pixel.' USING ERRCODE = '22023';
    END IF;
    v_lines := v_lines || jsonb_build_array(v_line || jsonb_build_object('length_px', round(v_px, 4)));
    v_sum := v_sum + v_mm / v_px;
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'In-image scale needs at least one reference line of known length.' USING ERRCODE = '22023';
  END IF;
  RETURN p || jsonb_build_object('lines', v_lines, 'mm_per_px', round(v_sum / v_n, 8));
END;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_in_image_scale(jsonb) FROM PUBLIC, anon, authenticated;

-- Ring test (IS 1786) decision recomputed from result_summary. NULL = the
-- summary is consistent; otherwise the reason it is refused.
-- result_summary (written by the browser, frontend types.ts RingTestSummary):
--   d_mm                     nominal diameter used for the limits (> 0)
--   thickness                [{label 't1'..'t8', angle_deg, thickness_mm, ...}]
--   valid_point_count        number of points with a thickness (must be 8)
--   area_tm_mm2, area_fp_mm2 tempered martensite / ferrite-pearlite areas
--   tm_share_pct             area_tm / (area_tm + area_fp) × 100
--   limits                   {thickness_min_factor, thickness_max_factor,
--                             tm_share_min_pct, tm_share_max_pct, limits_inclusive}
--   thickness_decimals       rounding of thickness_mm: must be 3 (fixed,
--                            frontend RING_THICKNESS_DECIMALS)
--   share_decimals           rounding of tm_share_pct: must be 2 (fixed,
--                            frontend RING_SHARE_DECIMALS)
--   overall_pass             the browser's verdict
-- Limits come from the method snapshot settings (defaults 0.07d / 0.15d and
-- 30–50 %, inclusive). The rounding is never read from the summary. The
-- verdict is taken on the stored values exactly as the browser takes it:
-- thickness_mm as stored (3 decimals), and tm_share_pct as stored once it is
-- checked to be the share of the stored areas rounded to 2 decimals (within
-- half a unit, 0.005 %). The browser's verdict must then equal the recompute;
-- there is no tolerance on the verdict.
CREATE OR REPLACE FUNCTION public.app_metallography_ring_check(p_summary jsonb, p_settings jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_set jsonb := coalesce(p_settings, '{}'::jsonb);
  v_min_f numeric := coalesce(public.app_metallography_num(v_set -> 'thickness_min_factor'), 0.07);
  v_max_f numeric := coalesce(public.app_metallography_num(v_set -> 'thickness_max_factor'), 0.15);
  v_share_min numeric := coalesce(public.app_metallography_num(v_set -> 'tm_share_min_pct'), 30);
  v_share_max numeric := coalesce(public.app_metallography_num(v_set -> 'tm_share_max_pct'), 50);
  v_inclusive boolean := CASE WHEN jsonb_typeof(v_set -> 'limits_inclusive') = 'boolean'
                              THEN (v_set ->> 'limits_inclusive')::boolean ELSE true END;
  -- Fixed rounding (frontend engines/types.ts).
  v_t_dec constant int := 3;
  v_s_dec constant int := 2;
  v_s_tol constant numeric := 0.005000001;
  v_d numeric;
  v_lo numeric;
  v_hi numeric;
  v_pt jsonb;
  v_t numeric;
  v_label text;
  v_labels text[] := ARRAY[]::text[];
  v_valid int := 0;
  v_t_ok boolean := true;
  v_tm numeric;
  v_fp numeric;
  v_share numeric;
  v_share_client numeric;
  v_s_ok boolean;
  v_sql_pass boolean;
  v_lim jsonb;
BEGIN
  IF p_summary IS NULL OR jsonb_typeof(p_summary) <> 'object' THEN
    RETURN 'Ring test: the result is missing. Apply the thickness points first.';
  END IF;

  IF public.app_metallography_num(p_summary -> 'thickness_decimals') IS DISTINCT FROM v_t_dec::numeric
     OR public.app_metallography_num(p_summary -> 'share_decimals') IS DISTINCT FROM v_s_dec::numeric THEN
    RETURN 'Ring test: the result was rounded differently (thickness 3, TM share 2 decimals). Run the ring test again.';
  END IF;

  v_d := public.app_metallography_num(p_summary -> 'd_mm');
  IF v_d IS NULL OR v_d <= 0 THEN
    RETURN 'Ring test: the nominal diameter d (mm) is missing.';
  END IF;
  IF v_min_f <= 0 OR v_max_f <= v_min_f OR v_share_min < 0 OR v_share_max <= v_share_min OR v_share_max > 100 THEN
    RETURN 'Ring test: the limits in Method Setup are not valid.';
  END IF;

  -- The limits the browser used must be the method's limits.
  v_lim := p_summary -> 'limits';
  IF v_lim IS NOT NULL AND jsonb_typeof(v_lim) = 'object' THEN
    IF abs(coalesce(public.app_metallography_num(v_lim -> 'thickness_min_factor'), -1) - v_min_f) > 0.000000001
       OR abs(coalesce(public.app_metallography_num(v_lim -> 'thickness_max_factor'), -1) - v_max_f) > 0.000000001
       OR abs(coalesce(public.app_metallography_num(v_lim -> 'tm_share_min_pct'), -1) - v_share_min) > 0.000000001
       OR abs(coalesce(public.app_metallography_num(v_lim -> 'tm_share_max_pct'), -1) - v_share_max) > 0.000000001
       OR (jsonb_typeof(v_lim -> 'limits_inclusive') = 'boolean'
           AND (v_lim ->> 'limits_inclusive')::boolean IS DISTINCT FROM v_inclusive) THEN
      RETURN 'Ring test: the limits used differ from Method Setup. Run the ring test again.';
    END IF;
  END IF;

  IF jsonb_typeof(p_summary -> 'thickness') <> 'array' THEN
    RETURN 'Ring test: the thickness points t1–t8 are missing.';
  END IF;

  v_lo := v_min_f * v_d;
  v_hi := v_max_f * v_d;

  FOR v_pt IN SELECT value FROM jsonb_array_elements(p_summary -> 'thickness') LOOP
    v_label := v_pt ->> 'label';
    v_t := public.app_metallography_num(v_pt -> 'thickness_mm');
    IF v_label IS NULL OR v_label !~ '^t[1-8]$' OR v_label = ANY (v_labels) OR v_t IS NULL OR v_t <= 0 THEN
      CONTINUE;
    END IF;
    IF v_t <> round(v_t, v_t_dec) THEN
      RETURN format('Ring test: thickness %s is not rounded to %s decimals. Run the ring test again.', v_label, v_t_dec);
    END IF;
    v_labels := v_labels || v_label;
    v_valid := v_valid + 1;
    IF v_inclusive THEN
      IF v_t < v_lo OR v_t > v_hi THEN
        v_t_ok := false;
      END IF;
    ELSE
      IF v_t <= v_lo OR v_t >= v_hi THEN
        v_t_ok := false;
      END IF;
    END IF;
  END LOOP;

  IF v_valid < 8 THEN
    RETURN format('Ring test: only %s of the 8 thickness points (t1–t8) are valid.', v_valid);
  END IF;
  IF public.app_metallography_num(p_summary -> 'valid_point_count') IS DISTINCT FROM v_valid::numeric THEN
    RETURN 'Ring test: the valid point count does not match the thickness points.';
  END IF;

  v_tm := public.app_metallography_num(p_summary -> 'area_tm_mm2');
  v_fp := public.app_metallography_num(p_summary -> 'area_fp_mm2');
  -- A ring with no hardened layer (TM area 0) is a valid FAIL, as in the browser.
  IF v_tm IS NULL OR v_fp IS NULL OR v_tm < 0 OR v_fp < 0 OR v_tm + v_fp <= 0 THEN
    RETURN 'Ring test: the TM and F&P areas are missing.';
  END IF;
  v_share := v_tm / (v_tm + v_fp) * 100;
  v_share_client := public.app_metallography_num(p_summary -> 'tm_share_pct');
  IF v_share_client IS NULL OR abs(v_share_client - v_share) > v_s_tol
     OR v_share_client <> round(v_share_client, v_s_dec) THEN
    RETURN format('Ring test: TM share %s %% does not match the areas (%s %%).',
                  coalesce(v_share_client::text, 'missing'), round(v_share, v_s_dec));
  END IF;
  -- Judged on the stored (rounded) share, as the browser does.
  IF v_tm <= 0 THEN
    v_s_ok := false;
  ELSIF v_inclusive THEN
    v_s_ok := v_share_client >= v_share_min AND v_share_client <= v_share_max;
  ELSE
    v_s_ok := v_share_client > v_share_min AND v_share_client < v_share_max;
  END IF;

  v_sql_pass := v_t_ok AND v_s_ok;

  IF jsonb_typeof(p_summary -> 'overall_pass') <> 'boolean' THEN
    RETURN 'Ring test: the PASS / FAIL verdict is missing.';
  END IF;
  IF (p_summary ->> 'overall_pass')::boolean IS DISTINCT FROM v_sql_pass THEN
    RETURN format('Ring test: the verdict (%s) does not match the database recompute (%s). Run the ring test again.',
                  CASE WHEN (p_summary ->> 'overall_pass')::boolean THEN 'PASS' ELSE 'FAIL' END,
                  CASE WHEN v_sql_pass THEN 'PASS' ELSE 'FAIL' END);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_ring_check(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- Ring test: reported_value must be exactly the text the browser builds from
-- result_summary (frontend formatResult.ts): a v 2 structured result with
-- entries t1…t8 (mm, 3 decimals) and TM (%, 2 decimals), and
-- reported "t1 1.460 mm, …, t8 1.455 mm; TM 43.75 %". Call it only after
-- app_metallography_ring_check() accepted the summary. NULL = matches.
CREATE OR REPLACE FUNCTION public.app_metallography_ring_reported_check(p_summary jsonb, p_reported text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_msg constant text := 'Ring test: the reported value does not match the measured values. Run the ring test again.';
  v_j jsonb;
  v_entries jsonb;
  v_e jsonb;
  v_i int;
  v_label text;
  v_t numeric;
  v_share numeric;
  v_parts text[] := ARRAY[]::text[];
  v_expected text;
BEGIN
  IF p_summary IS NULL OR p_reported IS NULL THEN
    RETURN v_msg;
  END IF;
  BEGIN
    v_j := p_reported::jsonb;
  EXCEPTION WHEN others THEN
    RETURN v_msg;
  END;
  IF jsonb_typeof(v_j) <> 'object'
     OR v_j ->> 'v' IS DISTINCT FROM '2'
     OR v_j ->> 'stat' IS DISTINCT FROM 'composed'
     OR public.app_metallography_num(v_j -> 'decimals') IS DISTINCT FROM 3::numeric
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_j) k
                 WHERE k NOT IN ('v', 'entries', 'reported', 'stat', 'decimals')) THEN
    RETURN v_msg;
  END IF;
  v_entries := v_j -> 'entries';
  IF jsonb_typeof(v_entries) <> 'array' OR jsonb_array_length(v_entries) <> 9 THEN
    RETURN v_msg;
  END IF;

  FOR v_i IN 1..8 LOOP
    v_label := 't' || v_i;
    SELECT public.app_metallography_num(x -> 'thickness_mm') INTO v_t
      FROM jsonb_array_elements(p_summary -> 'thickness') x
     WHERE x ->> 'label' = v_label
     LIMIT 1;
    v_e := v_entries -> (v_i - 1);
    IF v_t IS NULL
       OR jsonb_typeof(v_e) <> 'object'
       OR v_e ->> 'label' IS DISTINCT FROM v_label
       OR v_e ->> 'unit' IS DISTINCT FROM 'mm'
       OR public.app_metallography_num(v_e -> 'value') IS DISTINCT FROM v_t
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_e) k WHERE k NOT IN ('label', 'value', 'unit')) THEN
      RETURN v_msg;
    END IF;
    v_parts := v_parts || format('%s %s mm', v_label, round(v_t, 3)::text);
  END LOOP;

  v_share := public.app_metallography_num(p_summary -> 'tm_share_pct');
  v_e := v_entries -> 8;
  IF v_share IS NULL
     OR jsonb_typeof(v_e) <> 'object'
     OR v_e ->> 'label' IS DISTINCT FROM 'TM'
     OR v_e ->> 'unit' IS DISTINCT FROM '%'
     OR public.app_metallography_num(v_e -> 'value') IS DISTINCT FROM v_share
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_e) k WHERE k NOT IN ('label', 'value', 'unit')) THEN
    RETURN v_msg;
  END IF;

  v_expected := array_to_string(v_parts, ', ') || '; TM ' || round(v_share, 2)::text || ' %';
  IF v_j ->> 'reported' IS DISTINCT FROM v_expected THEN
    RETURN v_msg;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_ring_reported_check(jsonb, text) FROM PUBLIC, anon, authenticated;

-- May the signed-in user edit this analysis (and its fields)? Performer or Director.
CREATE OR REPLACE FUNCTION public.app_metallography_is_analysis_editor(p_analysis uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.app_is_laboratory_director()
          OR EXISTS (SELECT 1 FROM public.metallography_analyses a
                      WHERE a.id = p_analysis AND a.performed_by = auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.app_metallography_is_analysis_editor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_is_analysis_editor(uuid) TO authenticated, service_role;

-- May the signed-in user re-check this analysis? Assigned reviewer of the
-- result row, the Quality Manager or the Director, never the analyst.
CREATE OR REPLACE FUNCTION public.app_metallography_can_recheck(p_analysis uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.metallography_analyses a
       LEFT JOIN public.test_allocation_parameters p ON p.id = a.test_allocation_parameter_id
       WHERE a.id = p_analysis
         AND a.status IN ('completed', 'superseded')
         AND a.performed_by IS DISTINCT FROM auth.uid()
         AND (public.app_is_laboratory_director()
              OR public.app_is_quality_manager()
              OR (p.id IS NOT NULL AND p.results_reviewer_id = auth.uid()))
     );
$$;

REVOKE ALL ON FUNCTION public.app_metallography_can_recheck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_can_recheck(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Guards
-- ---------------------------------------------------------------------------

-- 3.1 Settings: Director only (RLS); stamps who changed it.
CREATE OR REPLACE FUNCTION public.metallography_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_uid IS NOT NULL THEN
      RAISE EXCEPTION 'Metallography settings cannot be deleted.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Metallography settings already exist; change them instead.' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Metallography settings id cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can change the metallography settings.' USING ERRCODE = '42501';
  END IF;
  NEW.updated_by := v_uid;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_settings_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_metallography_settings_guard ON public.metallography_settings;
CREATE TRIGGER trg_metallography_settings_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.metallography_settings
  FOR EACH ROW EXECUTE FUNCTION public.metallography_settings_guard();

-- 3.2 Method setup.
CREATE OR REPLACE FUNCTION public.metallography_parameter_methods_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_used boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_uid IS NULL THEN
      RETURN OLD;
    END IF;
    IF NOT public.app_metallography_can_manage_methods() THEN
      RAISE EXCEPTION 'Only the Laboratory Director or someone with Edit on Method Setup can change metallography methods.'
        USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.metallography_analyses a WHERE a.method_id = OLD.id) THEN
      RAISE EXCEPTION 'This method is used by metallography analyses and cannot be deleted. Deactivate it instead.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  NEW.settings := coalesce(NEW.settings, '{}'::jsonb);
  IF nullif(btrim(NEW.standard_ref), '') IS NULL THEN
    SELECT nullif(btrim(tp.test_method), '') INTO NEW.standard_ref
      FROM public.test_parameters tp WHERE tp.id = NEW.test_parameter_id;
  END IF;
  IF nullif(btrim(NEW.standard_ref), '') IS NULL THEN
    RAISE EXCEPTION 'Enter the standard / method reference (the test parameter has no test method).'
      USING ERRCODE = '23514';
  END IF;
  IF nullif(btrim(NEW.reported_unit), '') IS NULL AND TG_OP = 'INSERT' THEN
    SELECT nullif(btrim(tp.unit_value), '') INTO NEW.reported_unit
      FROM public.test_parameters tp WHERE tp.id = NEW.test_parameter_id;
  END IF;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.app_metallography_can_manage_methods() THEN
    RAISE EXCEPTION 'Only the Laboratory Director or someone with Edit on Method Setup can change metallography methods.'
      USING ERRCODE = '42501';
  END IF;

  -- A linked validation record must be one for this parameter or standard.
  IF NEW.method_verification_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.method_verification_id IS DISTINCT FROM OLD.method_verification_id
          OR NEW.test_parameter_id IS DISTINCT FROM OLD.test_parameter_id
          OR NEW.standard_ref IS DISTINCT FROM OLD.standard_ref)
     AND NOT public.app_metallography_verification_covers(NEW.method_verification_id, NEW.test_parameter_id, NEW.standard_ref) THEN
    RAISE EXCEPTION 'The validation record is for another test parameter or method. Link a record of this parameter, or one with method reference "%".',
      NEW.standard_ref USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := v_uid;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Method id and author cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF NEW.test_parameter_id IS DISTINCT FROM OLD.test_parameter_id
     OR NEW.analysis_kind IS DISTINCT FROM OLD.analysis_kind THEN
    SELECT EXISTS (SELECT 1 FROM public.metallography_analyses a WHERE a.method_id = OLD.id) INTO v_used;
    IF v_used THEN
      RAISE EXCEPTION 'This method is used by analyses: its test parameter and kind cannot be changed. Deactivate it and map the parameter again.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_parameter_methods_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_metallography_parameter_methods_guard ON public.metallography_parameter_methods;
CREATE TRIGGER trg_metallography_parameter_methods_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.metallography_parameter_methods
  FOR EACH ROW EXECUTE FUNCTION public.metallography_parameter_methods_guard();

-- 3.3 Microscope scale calibrations.
CREATE OR REPLACE FUNCTION public.metallography_scale_calibrations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_director boolean := false;
  v_r jsonb;
  v_readings jsonb := '[]'::jsonb;
  v_axis text;
  v_x1 numeric; v_y1 numeric; v_x2 numeric; v_y2 numeric;
  v_len numeric;
  v_nx int; v_ny int;
  v_mx numeric; v_my numeric;
  v_sx numeric; v_sy numeric;
  v_ok boolean;
  v_why text;
  v_problems text[] := ARRAY[]::text[];
  v_exists boolean;
  -- valid_from is set by the performer in the draft: the verifier cannot move
  -- it (the microscope usability check runs on it).
  v_ignore text[] := ARRAY['status', 'verified_by', 'verified_by_name', 'verified_at', 'override_reason',
                           'updated_at'];
BEGIN
  IF v_uid IS NOT NULL THEN
    v_director := public.app_is_laboratory_director();
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_uid IS NOT NULL AND NOT v_director
       AND (OLD.status <> 'draft' OR OLD.performed_by IS DISTINCT FROM v_uid) THEN
      RAISE EXCEPTION 'Only a draft calibration can be deleted, by the person who performed it (or the Laboratory Director). Withdraw a verified calibration instead.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Verified or withdrawn: only withdraw (with a reason) or shorten valid_until.
  IF TG_OP = 'UPDATE' AND v_uid IS NOT NULL AND OLD.status <> 'draft' THEN
    IF OLD.status = 'withdrawn' THEN
      RAISE EXCEPTION 'Calibration % is withdrawn and read-only.', OLD.cal_code USING ERRCODE = '42501';
    END IF;
    IF NOT public.app_metallography_can_calibrate() THEN
      RAISE EXCEPTION 'Only the Laboratory Director or someone with Edit on Microscope Calibration can withdraw a calibration.'
        USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - 'status' - 'withdraw_reason' - 'valid_until' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'withdraw_reason' - 'valid_until' - 'updated_at') THEN
      RAISE EXCEPTION 'Calibration % is verified and read-only: you can only withdraw it (with a reason) or shorten its validity.', OLD.cal_code
        USING ERRCODE = '42501';
    END IF;
    IF NEW.valid_until > OLD.valid_until THEN
      RAISE EXCEPTION 'The validity of a verified calibration can only be shortened. Record a new calibration instead.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'withdrawn' THEN
      IF btrim(coalesce(NEW.withdraw_reason, '')) = '' THEN
        RAISE EXCEPTION 'Give the reason for withdrawing the calibration.' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.status <> 'verified' THEN
      RAISE EXCEPTION 'A verified calibration can only be withdrawn.' USING ERRCODE = '42501';
    END IF;
    NEW.withdraw_reason := OLD.withdraw_reason;
    RETURN NEW;
  END IF;

  -- Insert or draft: µm/px and u_rel always come from the readings.
  IF NEW.reference_length_um IS NULL OR NEW.reference_length_um <= 0 THEN
    RAISE EXCEPTION 'Enter the stage micrometer reference length in µm.' USING ERRCODE = '23514';
  END IF;
  IF NEW.readings IS NULL OR jsonb_typeof(NEW.readings) <> 'array' THEN
    RAISE EXCEPTION 'Readings must be a list.' USING ERRCODE = '22023';
  END IF;
  FOR v_r IN SELECT value FROM jsonb_array_elements(NEW.readings) LOOP
    v_axis := v_r ->> 'axis';
    IF v_axis IS NULL OR v_axis NOT IN ('x', 'y') THEN
      RAISE EXCEPTION 'Each reading needs axis x or y.' USING ERRCODE = '22023';
    END IF;
    v_x1 := public.app_metallography_num(v_r -> 'x1');
    v_y1 := public.app_metallography_num(v_r -> 'y1');
    v_x2 := public.app_metallography_num(v_r -> 'x2');
    v_y2 := public.app_metallography_num(v_r -> 'y2');
    IF v_x1 IS NULL OR v_y1 IS NULL OR v_x2 IS NULL OR v_y2 IS NULL THEN
      RAISE EXCEPTION 'Each reading needs x1, y1, x2, y2 (pixels on the micrometer image).' USING ERRCODE = '22023';
    END IF;
    IF v_axis = 'x' AND abs(v_x2 - v_x1) < abs(v_y2 - v_y1) THEN
      RAISE EXCEPTION 'An x reading must be drawn along the horizontal axis.' USING ERRCODE = '22023';
    END IF;
    IF v_axis = 'y' AND abs(v_y2 - v_y1) < abs(v_x2 - v_x1) THEN
      RAISE EXCEPTION 'A y reading must be drawn along the vertical axis.' USING ERRCODE = '22023';
    END IF;
    v_len := sqrt(power(v_x2 - v_x1, 2) + power(v_y2 - v_y1, 2));
    IF v_len < 1 THEN
      RAISE EXCEPTION 'A reading is shorter than one pixel.' USING ERRCODE = '22023';
    END IF;
    v_readings := v_readings || jsonb_build_array(v_r || jsonb_build_object('length_px', round(v_len, 4)));
  END LOOP;
  NEW.readings := v_readings;

  SELECT count(*), avg((e.v ->> 'length_px')::numeric), stddev_samp((e.v ->> 'length_px')::numeric)
    INTO v_nx, v_mx, v_sx
    FROM jsonb_array_elements(NEW.readings) AS e(v) WHERE e.v ->> 'axis' = 'x';
  SELECT count(*), avg((e.v ->> 'length_px')::numeric), stddev_samp((e.v ->> 'length_px')::numeric)
    INTO v_ny, v_my, v_sy
    FROM jsonb_array_elements(NEW.readings) AS e(v) WHERE e.v ->> 'axis' = 'y';
  IF v_nx < 3 OR v_ny < 3 THEN
    RAISE EXCEPTION 'At least 3 readings per axis are needed (x: %, y: %).', v_nx, v_ny USING ERRCODE = '23514';
  END IF;
  NEW.um_per_px_x := round(NEW.reference_length_um / v_mx, 6);
  NEW.um_per_px_y := round(NEW.reference_length_um / v_my, 6);
  NEW.u_rel_scale := round(greatest(coalesce(v_sx / v_mx, 0), coalesce(v_sy / v_my, 0)) * 100, 4);

  IF v_uid IS NULL THEN
    IF nullif(btrim(NEW.cal_code), '') IS NULL THEN
      NEW.cal_code := public.metallography_next_number('MSC');
    END IF;
    NEW.valid_from := coalesce(NEW.valid_from, NEW.performed_at::date);
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.app_metallography_can_calibrate() THEN
      RAISE EXCEPTION 'Only the Laboratory Director or someone with Edit on Microscope Calibration can record a calibration.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'A new calibration starts as a draft and is verified by a second person.' USING ERRCODE = '42501';
    END IF;
    NEW.cal_code := public.metallography_next_number('MSC');
    NEW.performed_by := v_uid;
    NEW.performed_by_name := public.app_profile_name(v_uid);
    NEW.performed_at := now();
    NEW.verified_by := NULL;
    NEW.verified_by_name := NULL;
    NEW.verified_at := NULL;
    NEW.withdraw_reason := NULL;
    NEW.override_reason := NULL;
    NEW.created_at := now();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.cal_code IS DISTINCT FROM OLD.cal_code
       OR NEW.performed_by IS DISTINCT FROM OLD.performed_by
       OR NEW.performed_by_name IS DISTINCT FROM OLD.performed_by_name
       OR NEW.performed_at IS DISTINCT FROM OLD.performed_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Calibration code, performer and date cannot be changed.' USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.valid_from := coalesce(NEW.valid_from, NEW.performed_at::date);
  IF NEW.evidence_image_path IS NULL
     OR NEW.evidence_image_path NOT LIKE 'calibrations/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'The micrometer image path must start with calibrations/<calibration id>/.' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'verified' THEN
    IF NOT public.app_metallography_can_calibrate() THEN
      RAISE EXCEPTION 'Only the Laboratory Director or someone with Edit on Microscope Calibration can verify a calibration.'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.performed_by = v_uid THEN
      RAISE EXCEPTION 'The person who performed the calibration cannot verify it. Ask a second person.'
        USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - v_ignore) IS DISTINCT FROM (to_jsonb(OLD) - v_ignore) THEN
      RAISE EXCEPTION 'Verify the calibration as recorded. Save changes to the draft first.' USING ERRCODE = '42501';
    END IF;
    IF NEW.valid_until < NEW.valid_from THEN
      RAISE EXCEPTION 'Valid until must not be before valid from.' USING ERRCODE = '23514';
    END IF;
    v_exists := public.app_metallography_object_exists(NEW.evidence_image_path);
    IF v_exists IS FALSE THEN
      RAISE EXCEPTION 'The micrometer image of % was not uploaded. Upload it again before verifying.', OLD.cal_code
        USING ERRCODE = '23514';
    END IF;
    SELECT u.usable, u.reason INTO v_ok, v_why
      FROM public.equipment_usable_on(NEW.stage_micrometer_equipment_id, NEW.performed_at::date) u;
    IF NOT coalesce(v_ok, false) THEN
      v_problems := v_problems || ('Stage micrometer on ' || NEW.performed_at::date::text || ': ' || coalesce(v_why, 'not usable'));
    END IF;
    SELECT u.usable, u.reason INTO v_ok, v_why
      FROM public.equipment_usable_on(NEW.microscope_equipment_id, NEW.valid_from) u;
    IF NOT coalesce(v_ok, false) THEN
      v_problems := v_problems || ('Microscope on ' || NEW.valid_from::text || ': ' || coalesce(v_why, 'not usable'));
    END IF;
    IF cardinality(v_problems) > 0 THEN
      IF NOT (v_director AND btrim(coalesce(NEW.override_reason, '')) <> '') THEN
        RAISE EXCEPTION 'Equipment not usable: %. Only the Laboratory Director can verify with a reason.',
          array_to_string(v_problems, '; ') USING ERRCODE = '42501';
      END IF;
    ELSE
      NEW.override_reason := NULL;
    END IF;
    NEW.verified_by := v_uid;
    NEW.verified_by_name := public.app_profile_name(v_uid);
    NEW.verified_at := now();
    RETURN NEW;
  END IF;

  IF NEW.status = 'withdrawn' THEN
    RAISE EXCEPTION 'A draft calibration is deleted, not withdrawn.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.performed_by IS DISTINCT FROM v_uid AND NOT v_director THEN
    RAISE EXCEPTION 'Only the person who performed the calibration can change the draft (or the Laboratory Director).'
      USING ERRCODE = '42501';
  END IF;
  NEW.status := 'draft';
  NEW.verified_by := NULL;
  NEW.verified_by_name := NULL;
  NEW.verified_at := NULL;
  IF NOT v_director THEN
    NEW.override_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_scale_calibrations_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_metallography_scale_calibrations_guard ON public.metallography_scale_calibrations;
CREATE TRIGGER trg_metallography_scale_calibrations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.metallography_scale_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.metallography_scale_calibrations_guard();

-- 3.4 Analyses.
CREATE OR REPLACE FUNCTION public.metallography_analyses_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_director boolean := false;
  v_supersede text := coalesce(current_setting('app.metallography_supersede', true), '');
  v_tap_alloc uuid;
  v_tap_param uuid;
  v_tap_sample uuid;
  v_method public.metallography_parameter_methods%ROWTYPE;
  v_cal public.metallography_scale_calibrations%ROWTYPE;
  v_other text;
  v_fields int;
  v_bad_res int;
  v_min_fields int;
  v_scale_mode text;
  v_ruler uuid;
  v_ok boolean;
  v_why text;
  v_override boolean;
  v_err text;
  v_linked text;
  v_completing boolean := false;
  -- Lab calendar date (equipment and calibration validity are by lab date).
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_started date;
  v_other_id uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_director := public.app_is_laboratory_director();
  END IF;

  -- ---------------- DELETE
  IF TG_OP = 'DELETE' THEN
    IF v_uid IS NULL THEN
      RETURN OLD;
    END IF;
    IF EXISTS (SELECT 1 FROM public.metallography_fields f WHERE f.analysis_id = OLD.id) THEN
      RAISE EXCEPTION 'Analysis % has images and cannot be deleted. Void it instead.', OLD.analysis_no
        USING ERRCODE = '42501';
    END IF;
    IF NOT v_director THEN
      IF OLD.status <> 'in_progress' OR OLD.performed_by IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Only the analyst can delete an analysis that is in progress and has no images (or the Laboratory Director).'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.test_allocation_parameter_id IS NOT NULL
         AND public.app_metallography_result_locked(OLD.test_allocation_parameter_id) THEN
        RAISE EXCEPTION 'The result of analysis % is under review, approved or issued. Refer it back first.', OLD.analysis_no
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- ---------------- internal: an earlier completed analysis is superseded
  IF TG_OP = 'UPDATE' AND v_supersede <> ''
     AND OLD.status = 'completed' AND NEW.status = 'superseded'
     AND NEW.superseded_by IS NOT NULL AND NEW.superseded_by::text = v_supersede
     AND (to_jsonb(NEW) - 'status' - 'superseded_by' - 'updated_at')
         = (to_jsonb(OLD) - 'status' - 'superseded_by' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  NEW.engine_params := coalesce(NEW.engine_params, '{}'::jsonb);
  IF NEW.in_image_scale IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.in_image_scale IS DISTINCT FROM OLD.in_image_scale) THEN
    NEW.in_image_scale := public.app_metallography_in_image_scale(NEW.in_image_scale);
  END IF;

  -- ---------------- INSERT
  IF TG_OP = 'INSERT' THEN
    NEW.purpose := coalesce(NEW.purpose, 'sample');
    IF NEW.purpose = 'sample' THEN
      IF NEW.test_allocation_parameter_id IS NULL THEN
        RAISE EXCEPTION 'A sample analysis needs its result row (save the parameter in Enter Results first).'
          USING ERRCODE = '23502';
      END IF;
      SELECT p.test_allocation_id, p.test_parameter_id, ta.sample_id
        INTO v_tap_alloc, v_tap_param, v_tap_sample
        FROM public.test_allocation_parameters p
        JOIN public.test_allocations ta ON ta.id = p.test_allocation_id
       WHERE p.id = NEW.test_allocation_parameter_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Result row not found.' USING ERRCODE = '23503';
      END IF;
      NEW.test_allocation_id := v_tap_alloc;
      NEW.test_parameter_id := v_tap_param;
      NEW.sample_id := v_tap_sample;
      IF NEW.test_parameter_id IS NULL THEN
        RAISE EXCEPTION 'This result row has no test parameter.' USING ERRCODE = '23502';
      END IF;
      SELECT * INTO v_method FROM public.metallography_parameter_methods m
       WHERE m.test_parameter_id = NEW.test_parameter_id;
      IF NOT FOUND OR NOT v_method.active THEN
        RAISE EXCEPTION 'This test parameter is not set up for metallography (Method Setup).' USING ERRCODE = '42501';
      END IF;
    ELSE
      NEW.test_allocation_parameter_id := NULL;
      NEW.test_allocation_id := NULL;
      NEW.sample_id := NULL;
      IF NEW.method_id IS NULL THEN
        RAISE EXCEPTION 'Choose the method for this % analysis.', NEW.purpose USING ERRCODE = '23502';
      END IF;
      SELECT * INTO v_method FROM public.metallography_parameter_methods m WHERE m.id = NEW.method_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Method not found.' USING ERRCODE = '23503';
      END IF;
      NEW.test_parameter_id := v_method.test_parameter_id;
    END IF;

    NEW.method_id := v_method.id;
    NEW.analysis_kind := v_method.analysis_kind;
    NEW.method_snapshot := public.app_metallography_method_snapshot(v_method.id);
    NEW.indicative := NOT coalesce((NEW.method_snapshot ->> 'reportable')::boolean, false);
    NEW.reported_unit := coalesce(nullif(btrim(NEW.reported_unit), ''), v_method.reported_unit);

    IF v_uid IS NULL THEN
      IF nullif(btrim(NEW.analysis_no), '') IS NULL THEN
        NEW.analysis_no := public.metallography_next_number('MA');
      END IF;
      IF NEW.scale_calibration_id IS NOT NULL THEN
        NEW.scale_snapshot := public.app_metallography_scale_snapshot(NEW.scale_calibration_id);
      END IF;
      RETURN NEW;
    END IF;

    IF NOT (public.app_metallography_enabled() OR v_director) THEN
      RAISE EXCEPTION 'Metallography is not in use. The Laboratory Director can switch it on in Method Setup.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.app_metallography_can_run() THEN
      RAISE EXCEPTION 'You need Edit access to Metallography Analyses to run an analysis.' USING ERRCODE = '42501';
    END IF;
    -- Test date: the day the analysis starts (the Director may give an earlier
    -- date, which then needs a reason at completion). Never in the future.
    NEW.test_date := coalesce(NEW.test_date, v_today);
    IF NEW.test_date > v_today THEN
      RAISE EXCEPTION 'The test date cannot be in the future.' USING ERRCODE = '23514';
    END IF;
    IF NEW.test_date < v_today AND NOT v_director THEN
      RAISE EXCEPTION 'The test date of a new analysis is today (%).', v_today USING ERRCODE = '23514';
    END IF;
    IF NEW.purpose = 'sample' THEN
      IF NOT v_director AND public.app_metallography_result_locked(NEW.test_allocation_parameter_id) THEN
        RAISE EXCEPTION 'This result is under review, approved or issued. Refer it back before a new analysis.'
          USING ERRCODE = '42501';
      END IF;
      SELECT a.analysis_no INTO v_other FROM public.metallography_analyses a
       WHERE a.test_allocation_parameter_id = NEW.test_allocation_parameter_id AND a.status = 'in_progress'
       LIMIT 1;
      IF v_other IS NOT NULL THEN
        RAISE EXCEPTION 'Analysis % is already in progress for this result. Open it instead.', v_other
          USING ERRCODE = '23505';
      END IF;
    END IF;

    NEW.analysis_no := public.metallography_next_number('MA');
    NEW.status := 'in_progress';
    NEW.performed_by := v_uid;
    NEW.performed_by_name := public.app_profile_name(v_uid);
    NEW.completed_by := NULL;
    NEW.completed_at := NULL;
    NEW.superseded_by := NULL;
    NEW.void_reason := NULL;
    NEW.voided_by := NULL;
    NEW.voided_at := NULL;
    NEW.created_at := now();
    IF NOT v_director THEN
      NEW.override_reason := NULL;
    END IF;
    IF NEW.scale_calibration_id IS NOT NULL THEN
      SELECT * INTO v_cal FROM public.metallography_scale_calibrations c WHERE c.id = NEW.scale_calibration_id;
      IF NOT FOUND OR v_cal.status <> 'verified' THEN
        RAISE EXCEPTION 'Only a verified microscope calibration can be used.' USING ERRCODE = '42501';
      END IF;
      NEW.scale_snapshot := public.app_metallography_scale_snapshot(v_cal.id);
      NEW.microscope_equipment_id := v_cal.microscope_equipment_id;
      NEW.camera_equipment_id := coalesce(v_cal.camera_equipment_id, NEW.camera_equipment_id);
    ELSE
      NEW.scale_snapshot := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- ---------------- UPDATE
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.analysis_no IS DISTINCT FROM OLD.analysis_no
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.test_allocation_parameter_id IS DISTINCT FROM OLD.test_allocation_parameter_id
     OR NEW.sample_id IS DISTINCT FROM OLD.sample_id
     OR NEW.test_allocation_id IS DISTINCT FROM OLD.test_allocation_id
     OR NEW.test_parameter_id IS DISTINCT FROM OLD.test_parameter_id
     OR NEW.method_id IS DISTINCT FROM OLD.method_id
     OR NEW.method_snapshot IS DISTINCT FROM OLD.method_snapshot
     OR NEW.analysis_kind IS DISTINCT FROM OLD.analysis_kind
     OR NEW.indicative IS DISTINCT FROM OLD.indicative
     OR NEW.performed_by IS DISTINCT FROM OLD.performed_by
     OR NEW.performed_by_name IS DISTINCT FROM OLD.performed_by_name
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Analysis number, links, method, analyst and Indicative flag cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.test_allocation_parameter_id IS NOT NULL AND NOT v_director
     AND public.app_metallography_result_locked(OLD.test_allocation_parameter_id) THEN
    RAISE EXCEPTION 'The result of analysis % is under review, approved or issued. Refer it back first.', OLD.analysis_no
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('superseded', 'void') THEN
    RAISE EXCEPTION 'Analysis % is % and read-only.', OLD.analysis_no, OLD.status USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'completed' THEN
    IF NEW.status = 'void' THEN
      IF OLD.performed_by IS DISTINCT FROM v_uid AND NOT v_director THEN
        RAISE EXCEPTION 'Only the analyst or the Laboratory Director can void an analysis.' USING ERRCODE = '42501';
      END IF;
      IF btrim(coalesce(NEW.void_reason, '')) = '' THEN
        RAISE EXCEPTION 'Give the reason for voiding the analysis.' USING ERRCODE = '23514';
      END IF;
      IF (to_jsonb(NEW) - 'status' - 'void_reason' - 'voided_by' - 'voided_at' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'void_reason' - 'voided_by' - 'voided_at' - 'updated_at') THEN
        RAISE EXCEPTION 'Void the analysis without other changes.' USING ERRCODE = '42501';
      END IF;
      SELECT p.test_label INTO v_linked FROM public.test_allocation_parameters p
       WHERE p.metallography_analysis_id = OLD.id LIMIT 1;
      IF v_linked IS NOT NULL AND NOT v_director THEN
        RAISE EXCEPTION 'Analysis % is the source of the result "%". Unlink it in Enter Results first.', OLD.analysis_no, v_linked
          USING ERRCODE = '42501';
      END IF;
      -- Even the Director: a result under review, approved or issued keeps its source.
      IF v_linked IS NOT NULL AND public.app_metallography_result_locked(OLD.test_allocation_parameter_id) THEN
        RAISE EXCEPTION 'Analysis % is the source of the result "%", which is under review, approved or issued. Refer it back first.',
          OLD.analysis_no, v_linked USING ERRCODE = '42501';
      END IF;
      NEW.voided_by := v_uid;
      NEW.voided_at := now();
      RETURN NEW;
    END IF;
    IF NEW.status = 'completed'
       AND (to_jsonb(NEW) - 'include_in_report' - 'updated_at')
           = (to_jsonb(OLD) - 'include_in_report' - 'updated_at') THEN
      IF OLD.performed_by IS DISTINCT FROM v_uid AND NOT v_director AND NOT public.app_is_quality_manager() THEN
        RAISE EXCEPTION 'Only the analyst, the Quality Manager or the Laboratory Director can change this.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Analysis % is completed and read-only. Supersede it to change the result, or void it.', OLD.analysis_no
      USING ERRCODE = '42501';
  END IF;

  -- OLD.status = 'in_progress'
  IF OLD.performed_by IS DISTINCT FROM v_uid AND NOT v_director THEN
    RAISE EXCEPTION 'Only the analyst (or the Laboratory Director) can change an analysis in progress.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'superseded' THEN
    RAISE EXCEPTION 'An analysis is superseded only when a newer analysis of the same result is completed.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT v_director THEN
    NEW.override_reason := OLD.override_reason;
  END IF;

  IF NEW.status = 'void' THEN
    IF btrim(coalesce(NEW.void_reason, '')) = '' THEN
      RAISE EXCEPTION 'Give the reason for voiding the analysis.' USING ERRCODE = '23514';
    END IF;
    NEW.voided_by := v_uid;
    NEW.voided_at := now();
    NEW.completed_by := NULL;
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;

  NEW.void_reason := NULL;
  NEW.voided_by := NULL;
  NEW.voided_at := NULL;
  NEW.superseded_by := NULL;
  v_completing := NEW.status = 'completed';

  -- Test date: between the day the analysis started and today. Only the
  -- Director may give an earlier date, and completing then needs a reason.
  v_started := (OLD.created_at AT TIME ZONE 'Asia/Kolkata')::date;
  NEW.test_date := coalesce(NEW.test_date, OLD.test_date, v_today);
  IF NEW.test_date > v_today THEN
    RAISE EXCEPTION 'The test date cannot be in the future.' USING ERRCODE = '23514';
  END IF;
  IF NEW.test_date IS DISTINCT FROM OLD.test_date AND NEW.test_date < v_started AND NOT v_director THEN
    RAISE EXCEPTION 'The test date cannot be before the analysis was started (%).', v_started USING ERRCODE = '23514';
  END IF;

  -- Completing needs the module in use and the right to run analyses now,
  -- not only when the analysis was started (competence, 6.2).
  IF v_completing THEN
    IF NOT (public.app_metallography_enabled() OR v_director) THEN
      RAISE EXCEPTION 'Metallography is not in use. The Laboratory Director can switch it on in Method Setup.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.app_metallography_can_run() THEN
      RAISE EXCEPTION 'You need Edit access to Metallography Analyses to complete an analysis.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Scale: snapshot and microscope always come from the calibration.
  IF NEW.scale_calibration_id IS NOT NULL THEN
    SELECT * INTO v_cal FROM public.metallography_scale_calibrations c WHERE c.id = NEW.scale_calibration_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Microscope calibration not found.' USING ERRCODE = '23503';
    END IF;
    IF NEW.scale_calibration_id IS DISTINCT FROM OLD.scale_calibration_id OR v_completing THEN
      IF v_cal.status <> 'verified' THEN
        RAISE EXCEPTION 'Microscope calibration % is % and cannot be used.', v_cal.cal_code, v_cal.status
          USING ERRCODE = '42501';
      END IF;
      NEW.scale_snapshot := public.app_metallography_scale_snapshot(v_cal.id);
    ELSE
      NEW.scale_snapshot := OLD.scale_snapshot;
    END IF;
    NEW.microscope_equipment_id := v_cal.microscope_equipment_id;
    NEW.camera_equipment_id := coalesce(v_cal.camera_equipment_id, NEW.camera_equipment_id);
  ELSE
    NEW.scale_snapshot := NULL;
  END IF;

  IF NOT v_completing THEN
    NEW.status := 'in_progress';
    NEW.completed_by := NULL;
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;

  -- ---------------- in_progress -> completed
  v_min_fields := coalesce(public.app_metallography_num(NEW.method_snapshot -> 'min_fields')::int, 1);
  v_scale_mode := coalesce(NEW.method_snapshot ->> 'scale_mode', 'calibration');
  v_override := v_director AND btrim(coalesce(NEW.override_reason, '')) <> '';

  IF NEW.test_date < v_started AND NOT v_override THEN
    RAISE EXCEPTION 'The test date % is before the analysis was started (%). Only the Laboratory Director can proceed, with a reason.',
      NEW.test_date, v_started USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_fields FROM public.metallography_fields f
   WHERE f.analysis_id = NEW.id AND NOT f.excluded;
  IF v_fields < v_min_fields THEN
    RAISE EXCEPTION 'At least % image field(s) are needed (now %).', v_min_fields, v_fields USING ERRCODE = '23514';
  END IF;
  IF nullif(btrim(NEW.reported_value), '') IS NULL THEN
    RAISE EXCEPTION 'The reported value is missing.' USING ERRCODE = '23514';
  END IF;

  IF NEW.scale_calibration_id IS NOT NULL THEN
    SELECT count(*) INTO v_bad_res FROM public.metallography_fields f
     WHERE f.analysis_id = NEW.id AND NOT f.excluded
       AND (f.image_width_px IS DISTINCT FROM v_cal.image_width_px
            OR f.image_height_px IS DISTINCT FROM v_cal.image_height_px);
    IF v_bad_res > 0 THEN
      RAISE EXCEPTION 'Calibration % is valid only for %×% px images; % field(s) have another size.',
        v_cal.cal_code, v_cal.image_width_px, v_cal.image_height_px, v_bad_res USING ERRCODE = '23514';
    END IF;
    IF NOT (NEW.test_date BETWEEN coalesce(v_cal.valid_from, v_cal.performed_at::date) AND v_cal.valid_until)
       AND NOT v_override THEN
      RAISE EXCEPTION 'Calibration % is not valid on % (valid % to %). Only the Laboratory Director can proceed, with a reason.',
        v_cal.cal_code, NEW.test_date, coalesce(v_cal.valid_from, v_cal.performed_at::date), v_cal.valid_until
        USING ERRCODE = '42501';
    END IF;
    SELECT u.usable, u.reason INTO v_ok, v_why
      FROM public.equipment_usable_on(NEW.microscope_equipment_id, NEW.test_date) u;
    IF NOT coalesce(v_ok, false) AND NOT v_override THEN
      RAISE EXCEPTION 'Microscope not usable on %: %. Only the Laboratory Director can proceed, with a reason.',
        NEW.test_date, coalesce(v_why, 'unknown') USING ERRCODE = '42501';
    END IF;
  ELSIF v_scale_mode = 'in_image_reference' AND NEW.in_image_scale IS NOT NULL THEN
    IF public.app_metallography_num(NEW.in_image_scale -> 'mm_per_px') IS NULL THEN
      RAISE EXCEPTION 'Draw the reference line of known length (in-image scale).' USING ERRCODE = '23514';
    END IF;
    v_ruler := nullif(NEW.in_image_scale ->> 'ruler_equipment_id', '')::uuid;
    IF v_ruler IS NULL THEN
      RAISE EXCEPTION 'Choose the ruler / scale (equipment) used for the in-image scale.' USING ERRCODE = '23514';
    END IF;
    SELECT u.usable, u.reason INTO v_ok, v_why FROM public.equipment_usable_on(v_ruler, NEW.test_date) u;
    IF NOT coalesce(v_ok, false) AND NOT v_override THEN
      RAISE EXCEPTION 'Ruler not usable on %: %. Only the Laboratory Director can proceed, with a reason.',
        NEW.test_date, coalesce(v_why, 'unknown') USING ERRCODE = '42501';
    END IF;
  ELSIF v_scale_mode = 'in_image_reference' THEN
    RAISE EXCEPTION 'Set the scale: a verified microscope calibration or a reference line of known length with its ruler.'
      USING ERRCODE = '23514';
  ELSE
    RAISE EXCEPTION 'Select a verified microscope calibration (µm/px) for this analysis.' USING ERRCODE = '23514';
  END IF;

  IF NOT v_override THEN
    NEW.override_reason := NULL;
  END IF;

  IF NEW.analysis_kind = 'ring_test' THEN
    v_err := public.app_metallography_ring_check(NEW.result_summary, NEW.method_snapshot -> 'settings');
    IF v_err IS NULL THEN
      -- The text that goes to Enter Results and the report must be built from the checked summary.
      v_err := public.app_metallography_ring_reported_check(NEW.result_summary, NEW.reported_value);
    END IF;
    IF v_err IS NOT NULL THEN
      RAISE EXCEPTION '%', v_err USING ERRCODE = '23514';
    END IF;
  END IF;

  -- The result row may still show the earlier analysis: never supersede the
  -- source of a result under review, approved or issued (only the Director
  -- gets here while the result is locked).
  IF NEW.test_allocation_parameter_id IS NOT NULL
     AND public.app_metallography_result_locked(NEW.test_allocation_parameter_id) THEN
    SELECT p.metallography_analysis_id INTO v_other_id
      FROM public.test_allocation_parameters p WHERE p.id = NEW.test_allocation_parameter_id;
    IF v_other_id IS NOT NULL AND v_other_id <> NEW.id THEN
      RAISE EXCEPTION 'The result of this row comes from another analysis and is under review, approved or issued. Refer it back first.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.status := 'completed';
  NEW.completed_by := v_uid;
  NEW.completed_at := now();

  -- An earlier completed analysis of the same result row becomes superseded.
  IF NEW.test_allocation_parameter_id IS NOT NULL THEN
    PERFORM set_config('app.metallography_supersede', NEW.id::text, true);
    UPDATE public.metallography_analyses a
       SET status = 'superseded', superseded_by = NEW.id
     WHERE a.test_allocation_parameter_id = NEW.test_allocation_parameter_id
       AND a.status = 'completed'
       AND a.id <> NEW.id;
    PERFORM set_config('app.metallography_supersede', '', true);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_analyses_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_metallography_analyses_guard ON public.metallography_analyses;
CREATE TRIGGER trg_metallography_analyses_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.metallography_analyses
  FOR EACH ROW EXECUTE FUNCTION public.metallography_analyses_guard();

-- 3.5 Fields: only while the analysis is in progress, by its analyst or the
-- Director. The original image columns never change.
CREATE OR REPLACE FUNCTION public.metallography_fields_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_director boolean;
  v_parent public.metallography_analyses%ROWTYPE;
  v_aid uuid;
  v_prefix text;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    NEW.marks := coalesce(NEW.marks, '{}'::jsonb);
    RETURN NEW;
  END IF;
  v_director := public.app_is_laboratory_director();
  v_aid := CASE WHEN TG_OP = 'DELETE' THEN OLD.analysis_id ELSE NEW.analysis_id END;

  SELECT * INTO v_parent FROM public.metallography_analyses a WHERE a.id = v_aid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Analysis not found.' USING ERRCODE = '23503';
  END IF;
  IF v_parent.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Analysis % is %: its images cannot be changed. Supersede it to make changes.',
      v_parent.analysis_no, v_parent.status USING ERRCODE = '42501';
  END IF;
  IF v_parent.performed_by IS DISTINCT FROM v_uid AND NOT v_director THEN
    RAISE EXCEPTION 'Only the analyst (or the Laboratory Director) can change the images of an analysis.'
      USING ERRCODE = '42501';
  END IF;
  IF v_parent.test_allocation_parameter_id IS NOT NULL AND NOT v_director
     AND public.app_metallography_result_locked(v_parent.test_allocation_parameter_id) THEN
    RAISE EXCEPTION 'The result of analysis % is under review, approved or issued. Refer it back first.', v_parent.analysis_no
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Adding or changing images is running the analysis: the module must be in
  -- use and the caller must still have the right to run analyses (6.2).
  IF NOT (public.app_metallography_enabled() OR v_director) THEN
    RAISE EXCEPTION 'Metallography is not in use. The Laboratory Director can switch it on in Method Setup.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.app_metallography_can_run() THEN
    RAISE EXCEPTION 'You need Edit access to Metallography Analyses to change the images of an analysis.' USING ERRCODE = '42501';
  END IF;

  NEW.marks := coalesce(NEW.marks, '{}'::jsonb);
  v_prefix := 'analyses/' || NEW.analysis_id::text || '/';

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.analysis_id IS DISTINCT FROM OLD.analysis_id
       OR NEW.raw_image_path IS DISTINCT FROM OLD.raw_image_path
       OR NEW.raw_image_sha256 IS DISTINCT FROM OLD.raw_image_sha256
       OR NEW.raw_image_bytes IS DISTINCT FROM OLD.raw_image_bytes
       OR NEW.raw_image_mime IS DISTINCT FROM OLD.raw_image_mime
       OR NEW.original_file_name IS DISTINCT FROM OLD.original_file_name
       OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.image_width_px IS NOT NULL AND NEW.image_width_px IS DISTINCT FROM OLD.image_width_px)
       OR (OLD.image_height_px IS NOT NULL AND NEW.image_height_px IS DISTINCT FROM OLD.image_height_px) THEN
      RAISE EXCEPTION 'The original image of a field cannot be changed. Add a new field instead.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Own upload, or the same stored original of an earlier analysis of the
    -- same result (supersede copies fields by reference). A validation / IQC /
    -- training analysis (no result row) may re-use only an original of an
    -- analysis by the same analyst.
    IF NEW.raw_image_path NOT LIKE v_prefix || 'fields/%'
       AND NOT EXISTS (
         SELECT 1
         FROM public.metallography_fields f
         JOIN public.metallography_analyses a ON a.id = f.analysis_id
         WHERE f.raw_image_path = NEW.raw_image_path
           AND f.raw_image_sha256 = NEW.raw_image_sha256
           AND a.id <> v_parent.id
           AND (
             (v_parent.test_allocation_parameter_id IS NOT NULL
              AND a.test_allocation_parameter_id = v_parent.test_allocation_parameter_id)
             OR (v_parent.test_allocation_parameter_id IS NULL
                 AND a.test_allocation_parameter_id IS NULL
                 AND a.performed_by = v_parent.performed_by)
           )
       ) THEN
      RAISE EXCEPTION 'The image path must start with %fields/ (or re-use an original of the same result).', v_prefix
        USING ERRCODE = '22023';
    END IF;
    v_exists := public.app_metallography_object_exists(NEW.raw_image_path);
    IF v_exists IS FALSE THEN
      RAISE EXCEPTION 'The image was not uploaded. Upload it again.' USING ERRCODE = '23514';
    END IF;
    NEW.uploaded_by := v_uid;
    NEW.created_at := now();
  END IF;

  IF NEW.features_path IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.features_path IS DISTINCT FROM OLD.features_path)
     AND NEW.features_path NOT LIKE v_prefix || '%' THEN
    RAISE EXCEPTION 'The features file path must start with %.', v_prefix USING ERRCODE = '22023';
  END IF;
  IF NEW.rendered_overlay_path IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.rendered_overlay_path IS DISTINCT FROM OLD.rendered_overlay_path)
     AND NEW.rendered_overlay_path NOT LIKE v_prefix || '%' THEN
    RAISE EXCEPTION 'The overlay path must start with %.', v_prefix USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_fields_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_metallography_fields_guard ON public.metallography_fields;
CREATE TRIGGER trg_metallography_fields_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.metallography_fields
  FOR EACH ROW EXECUTE FUNCTION public.metallography_fields_guard();

-- 3.6 Re-checks: append-only; never by the analyst.
CREATE OR REPLACE FUNCTION public.metallography_rechecks_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT public.app_is_laboratory_director() THEN
      RAISE EXCEPTION 'Only the Laboratory Director can delete a re-check record.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Re-check records cannot be changed.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.app_metallography_can_recheck(NEW.analysis_id) THEN
    RAISE EXCEPTION 'Only the assigned reviewer, the Quality Manager or the Laboratory Director can re-check a completed analysis, and never the analyst.'
      USING ERRCODE = '42501';
  END IF;
  NEW.details := coalesce(NEW.details, '{}'::jsonb);
  NEW.engine_version := coalesce(nullif(btrim(NEW.engine_version), ''),
    (SELECT a.engine_version FROM public.metallography_analyses a WHERE a.id = NEW.analysis_id));
  NEW.run_by := v_uid;
  NEW.run_by_name := public.app_profile_name(v_uid);
  NEW.run_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_rechecks_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_metallography_rechecks_guard ON public.metallography_rechecks;
CREATE TRIGGER trg_metallography_rechecks_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.metallography_rechecks
  FOR EACH ROW EXECUTE FUNCTION public.metallography_rechecks_guard();

-- RPC used by the review screen. hashes_verified comes from p_details.
CREATE OR REPLACE FUNCTION public.app_metallography_record_recheck(p_analysis uuid, p_match boolean, p_details jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL OR NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_match IS NULL THEN
    RAISE EXCEPTION 'Say whether the re-check matched.' USING ERRCODE = '23502';
  END IF;
  IF jsonb_typeof(v_details) <> 'object' THEN
    RAISE EXCEPTION 'Re-check details must be an object.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.metallography_rechecks (analysis_id, engine_version, hashes_verified, match, details)
  VALUES (
    p_analysis,
    nullif(btrim(v_details ->> 'engine_version'), ''),
    CASE WHEN jsonb_typeof(v_details -> 'hashes_verified') = 'boolean'
         THEN (v_details ->> 'hashes_verified')::boolean ELSE false END,
    p_match,
    v_details
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_record_recheck(uuid, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_record_recheck(uuid, boolean, jsonb) TO authenticated, service_role;

-- 3.7 The result row's link: a linked result always equals the analysis's
-- reported value; the link cannot change while under review or approved.
-- tap_verify_review_rules does not cover this column.
-- The linked analysis is checked again when the section goes for review or
-- is approved, so a result from an analysis superseded or voided after
-- Use result cannot be approved or issued. A new row (INSERT, e.g. the
-- report amendment copy) never carries a link: Use result links it again.
CREATE OR REPLACE FUNCTION public.tap_metallography_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a public.metallography_analyses%ROWTYPE;
  v_link_changed boolean;
  v_review_moved boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.metallography_analysis_id := NULL;
    RETURN NEW;
  END IF;
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  v_link_changed := NEW.metallography_analysis_id IS DISTINCT FROM OLD.metallography_analysis_id;
  v_review_moved := NEW.results_review_status IS DISTINCT FROM OLD.results_review_status
                    AND NEW.results_review_status IN ('under_review', 'approved');

  IF v_link_changed
     AND OLD.results_review_status IN ('under_review', 'approved')
     AND NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'The metallography link cannot be changed while the results are %. Refer the section back from review first.',
      CASE WHEN OLD.results_review_status = 'approved' THEN 'approved' ELSE 'under review' END
      USING ERRCODE = '42501';
  END IF;

  IF NEW.metallography_analysis_id IS NOT NULL
     AND (v_link_changed OR v_review_moved OR NEW.results IS DISTINCT FROM OLD.results) THEN
    SELECT * INTO v_a FROM public.metallography_analyses a WHERE a.id = NEW.metallography_analysis_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Metallography analysis not found.' USING ERRCODE = '23503';
    END IF;
    IF v_a.test_allocation_parameter_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'Metallography analysis % belongs to another result.', v_a.analysis_no USING ERRCODE = '42501';
    END IF;
    IF v_a.status <> 'completed' THEN
      RAISE EXCEPTION 'Metallography analysis % is %; only a completed analysis can give the result. Use the result of the newer analysis or unlink it in Enter Results.',
        v_a.analysis_no, v_a.status
        USING ERRCODE = '42501';
    END IF;
    IF NEW.results IS DISTINCT FROM v_a.reported_value THEN
      RAISE EXCEPTION 'Result comes from metallography analysis %; change it there or unlink.', v_a.analysis_no
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tap_metallography_link_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tap_metallography_link_guard ON public.test_allocation_parameters;
CREATE TRIGGER tap_metallography_link_guard
  BEFORE INSERT OR UPDATE ON public.test_allocation_parameters
  FOR EACH ROW EXECUTE FUNCTION public.tap_metallography_link_guard();

-- Analyses are kept records (void, never deleted), and their result row and
-- section are kept with them (foreign keys ON DELETE RESTRICT). Removing a
-- parameter or a section (Test Allocation edit, refer-back to Sample
-- Allocation, sample delete) is refused with a plain message instead of the
-- bare foreign key error.
CREATE OR REPLACE FUNCTION public.metallography_keep_result_rows_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_no text;
  v_label text;
BEGIN
  IF TG_TABLE_NAME = 'test_allocation_parameters' THEN
    SELECT a.analysis_no INTO v_no FROM public.metallography_analyses a
     WHERE a.test_allocation_parameter_id = OLD.id
     ORDER BY a.created_at
     LIMIT 1;
    v_label := coalesce('parameter "' || nullif(btrim(OLD.test_label), '') || '"', 'this parameter');
  ELSE
    SELECT a.analysis_no INTO v_no FROM public.metallography_analyses a
     WHERE a.test_allocation_id = OLD.id
     ORDER BY a.created_at
     LIMIT 1;
    v_label := 'this section';
  END IF;
  IF v_no IS NOT NULL THEN
    RAISE EXCEPTION 'Metallography analysis % belongs to %. Analysis records are kept, so % cannot be removed.',
      v_no, v_label, v_label USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.metallography_keep_result_rows_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tap_metallography_keep_rows ON public.test_allocation_parameters;
CREATE TRIGGER tap_metallography_keep_rows
  BEFORE DELETE ON public.test_allocation_parameters
  FOR EACH ROW EXECUTE FUNCTION public.metallography_keep_result_rows_guard();

DROP TRIGGER IF EXISTS ta_metallography_keep_rows ON public.test_allocations;
CREATE TRIGGER ta_metallography_keep_rows
  BEFORE DELETE ON public.test_allocations
  FOR EACH ROW EXECUTE FUNCTION public.metallography_keep_result_rows_guard();

-- ---------------------------------------------------------------------------
-- 4. Storage helpers (bucket metallography-images)
-- ---------------------------------------------------------------------------

-- analyses/<id>/fields/<field_no>_<sha16>.<ext>, analyses/<id>/overlay_<n>[_<sha16>].png,
-- analyses/<id>/features_<n>[_<sha16>].json: an in-progress analysis the
-- caller performs (or the Director). calibrations/<id>/micrometer_<sha16>.<ext>:
-- a draft calibration the caller performs (or the Director).
CREATE OR REPLACE FUNCTION public.app_metallography_can_upload(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR p_name IS NULL OR NOT public.app_is_known_staff() THEN
    RETURN false;
  END IF;
  IF p_name ~ ('^analyses/' || v_uuid || '/(fields/[0-9]+_[0-9a-f]{16}\.(png|jpe?g|bmp|webp|tiff?)'
               || '|overlay_[0-9]+(_[0-9a-f]{16})?\.png|features_[0-9]+(_[0-9a-f]{16})?\.json)$') THEN
    v_id := split_part(p_name, '/', 2)::uuid;
    RETURN EXISTS (
      SELECT 1 FROM public.metallography_analyses a
      WHERE a.id = v_id AND a.status = 'in_progress'
        AND (a.performed_by = v_uid OR public.app_is_laboratory_director())
    );
  END IF;
  IF p_name ~ ('^calibrations/' || v_uuid || '/micrometer_[0-9a-f]{16}\.(png|jpe?g|bmp|webp|tiff?)$') THEN
    v_id := split_part(p_name, '/', 2)::uuid;
    RETURN EXISTS (
      SELECT 1 FROM public.metallography_scale_calibrations c
      WHERE c.id = v_id AND c.status = 'draft'
        AND (c.performed_by = v_uid OR public.app_is_laboratory_director())
    );
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.app_metallography_can_upload(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_can_upload(text) TO authenticated, service_role;

-- No field or calibration row references the object (clean-up after a failed insert).
CREATE OR REPLACE FUNCTION public.app_metallography_object_deletable(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_name IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.metallography_fields f
       WHERE f.raw_image_path = p_name OR f.features_path = p_name OR f.rendered_overlay_path = p_name
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.metallography_scale_calibrations c WHERE c.evidence_image_path = p_name
     );
$$;

REVOKE ALL ON FUNCTION public.app_metallography_object_deletable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_metallography_object_deletable(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.metallography_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metallography_parameter_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metallography_scale_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metallography_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metallography_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metallography_rechecks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metallography_counters ENABLE ROW LEVEL SECURITY;

-- Settings: known staff read; Director updates.
DROP POLICY IF EXISTS metallography_settings_select ON public.metallography_settings;
CREATE POLICY metallography_settings_select ON public.metallography_settings
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS metallography_settings_update ON public.metallography_settings;
CREATE POLICY metallography_settings_update ON public.metallography_settings
  FOR UPDATE TO authenticated
  USING (public.app_is_laboratory_director())
  WITH CHECK (public.app_is_laboratory_director());

-- Method setup.
DROP POLICY IF EXISTS metallography_parameter_methods_select ON public.metallography_parameter_methods;
CREATE POLICY metallography_parameter_methods_select ON public.metallography_parameter_methods
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS metallography_parameter_methods_insert ON public.metallography_parameter_methods;
CREATE POLICY metallography_parameter_methods_insert ON public.metallography_parameter_methods
  FOR INSERT TO authenticated WITH CHECK (public.app_metallography_can_manage_methods());
DROP POLICY IF EXISTS metallography_parameter_methods_update ON public.metallography_parameter_methods;
CREATE POLICY metallography_parameter_methods_update ON public.metallography_parameter_methods
  FOR UPDATE TO authenticated
  USING (public.app_metallography_can_manage_methods())
  WITH CHECK (public.app_metallography_can_manage_methods());
DROP POLICY IF EXISTS metallography_parameter_methods_delete ON public.metallography_parameter_methods;
CREATE POLICY metallography_parameter_methods_delete ON public.metallography_parameter_methods
  FOR DELETE TO authenticated USING (public.app_metallography_can_manage_methods());

-- Scale calibrations (the guard decides the details).
DROP POLICY IF EXISTS metallography_scale_calibrations_select ON public.metallography_scale_calibrations;
CREATE POLICY metallography_scale_calibrations_select ON public.metallography_scale_calibrations
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS metallography_scale_calibrations_insert ON public.metallography_scale_calibrations;
CREATE POLICY metallography_scale_calibrations_insert ON public.metallography_scale_calibrations
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid() AND public.app_metallography_can_calibrate());
DROP POLICY IF EXISTS metallography_scale_calibrations_update ON public.metallography_scale_calibrations;
CREATE POLICY metallography_scale_calibrations_update ON public.metallography_scale_calibrations
  FOR UPDATE TO authenticated
  USING (performed_by = auth.uid() OR public.app_metallography_can_calibrate() OR public.app_is_laboratory_director())
  WITH CHECK (performed_by = auth.uid() OR public.app_metallography_can_calibrate() OR public.app_is_laboratory_director());
DROP POLICY IF EXISTS metallography_scale_calibrations_delete ON public.metallography_scale_calibrations;
CREATE POLICY metallography_scale_calibrations_delete ON public.metallography_scale_calibrations
  FOR DELETE TO authenticated
  USING ((status = 'draft' AND performed_by = auth.uid()) OR public.app_is_laboratory_director());

-- Analyses.
DROP POLICY IF EXISTS metallography_analyses_select ON public.metallography_analyses;
CREATE POLICY metallography_analyses_select ON public.metallography_analyses
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS metallography_analyses_insert ON public.metallography_analyses;
CREATE POLICY metallography_analyses_insert ON public.metallography_analyses
  FOR INSERT TO authenticated
  WITH CHECK (performed_by = auth.uid() AND public.app_metallography_can_run());
DROP POLICY IF EXISTS metallography_analyses_update ON public.metallography_analyses;
CREATE POLICY metallography_analyses_update ON public.metallography_analyses
  FOR UPDATE TO authenticated
  USING (performed_by = auth.uid() OR public.app_is_quality_manager() OR public.app_is_laboratory_director())
  WITH CHECK (performed_by = auth.uid() OR public.app_is_quality_manager() OR public.app_is_laboratory_director());
DROP POLICY IF EXISTS metallography_analyses_delete ON public.metallography_analyses;
CREATE POLICY metallography_analyses_delete ON public.metallography_analyses
  FOR DELETE TO authenticated
  USING (performed_by = auth.uid() OR public.app_is_laboratory_director());

-- Fields: the analyst of the parent (or the Director); the guard checks the status.
DROP POLICY IF EXISTS metallography_fields_select ON public.metallography_fields;
CREATE POLICY metallography_fields_select ON public.metallography_fields
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS metallography_fields_insert ON public.metallography_fields;
CREATE POLICY metallography_fields_insert ON public.metallography_fields
  FOR INSERT TO authenticated WITH CHECK (public.app_metallography_is_analysis_editor(analysis_id));
DROP POLICY IF EXISTS metallography_fields_update ON public.metallography_fields;
CREATE POLICY metallography_fields_update ON public.metallography_fields
  FOR UPDATE TO authenticated
  USING (public.app_metallography_is_analysis_editor(analysis_id))
  WITH CHECK (public.app_metallography_is_analysis_editor(analysis_id));
DROP POLICY IF EXISTS metallography_fields_delete ON public.metallography_fields;
CREATE POLICY metallography_fields_delete ON public.metallography_fields
  FOR DELETE TO authenticated USING (public.app_metallography_is_analysis_editor(analysis_id));

-- Re-checks: append-only.
DROP POLICY IF EXISTS metallography_rechecks_select ON public.metallography_rechecks;
CREATE POLICY metallography_rechecks_select ON public.metallography_rechecks
  FOR SELECT TO authenticated USING (public.app_is_known_staff());
DROP POLICY IF EXISTS metallography_rechecks_insert ON public.metallography_rechecks;
CREATE POLICY metallography_rechecks_insert ON public.metallography_rechecks
  FOR INSERT TO authenticated WITH CHECK (public.app_metallography_can_recheck(analysis_id));
DROP POLICY IF EXISTS metallography_rechecks_delete ON public.metallography_rechecks;
CREATE POLICY metallography_rechecks_delete ON public.metallography_rechecks
  FOR DELETE TO authenticated USING (public.app_is_laboratory_director());

-- Counters: no policies (nothing for signed-in users).

-- Same outer gate as every other public table (20261009063000).
DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY[
    'metallography_settings', 'metallography_parameter_methods', 'metallography_scale_calibrations',
    'metallography_analyses', 'metallography_fields', 'metallography_rechecks', 'metallography_counters'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', rel);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
  END LOOP;
END $$;

GRANT SELECT, UPDATE ON public.metallography_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metallography_parameter_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metallography_scale_calibrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metallography_analyses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metallography_fields TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.metallography_rechecks TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Storage: private bucket metallography-images. No update policy:
--    originals are never overwritten.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema missing; metallography-images bucket skipped.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'metallography-images',
    'metallography-images',
    false,
    26214400,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'application/json'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS lims_metallography_images_select ON storage.objects;
  CREATE POLICY lims_metallography_images_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'metallography-images' AND public.app_is_known_staff());

  DROP POLICY IF EXISTS lims_metallography_images_insert ON storage.objects;
  CREATE POLICY lims_metallography_images_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'metallography-images' AND public.app_metallography_can_upload(name));

  DROP POLICY IF EXISTS lims_metallography_images_update ON storage.objects;

  DROP POLICY IF EXISTS lims_metallography_images_delete ON storage.objects;
  CREATE POLICY lims_metallography_images_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'metallography-images'
      AND public.app_is_known_staff()
      -- Nobody, not even the Director, removes an object a field or a
      -- calibration still references (originals are kept).
      AND public.app_metallography_object_deletable(name)
      AND (
        public.app_is_laboratory_director()
        OR owner = auth.uid() OR owner_id = auth.uid()::text
      )
    );
END $$;

-- ---------------------------------------------------------------------------
-- 7. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: metallography tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY[
    'metallography_settings', 'metallography_parameter_methods', 'metallography_scale_calibrations',
    'metallography_analyses', 'metallography_fields', 'metallography_rechecks'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Module access (20261029100200): map the new tables and re-install the
--    module access policies. /samples/under-testing gives view only: running
--    analyses needs an explicit Edit grant on /metallography/analyses (6.2).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_installed int;
BEGIN
  IF to_regclass('public.module_table_map') IS NULL
     OR to_regprocedure('public.app_module_access_install()') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.module_table_map WHERE source = 'seed:20261102101700';
  INSERT INTO public.module_table_map (table_name, module_path, write_requires, read_requires, source, note)
  SELECT t, p, w, r, 'seed:20261102101700', n
  FROM (VALUES
    ('metallography_analyses', '/metallography/analyses', 'edit', 'view', 'metallography analyses (7.5.1)'),
    ('metallography_analyses', '/samples/under-testing', 'never', 'view', 'Metallography link in Enter Results'),
    ('metallography_analyses', '/samples/results-review', 'never', 'view', 'analysis view and re-check (7.7)'),
    ('metallography_analyses', '/samples/report-preparation', 'never', 'view', 'raw data behind the result'),
    ('metallography_analyses', '/samples/completed', 'never', 'view', 'raw data behind the result'),
    ('metallography_fields', '/metallography/analyses', 'edit', 'view', 'metallography images (7.5.1)'),
    ('metallography_fields', '/samples/under-testing', 'never', 'view', 'Metallography link in Enter Results'),
    ('metallography_fields', '/samples/results-review', 'never', 'view', 'analysis view and re-check (7.7)'),
    ('metallography_fields', '/samples/report-preparation', 'never', 'view', 'raw data behind the result'),
    ('metallography_fields', '/samples/completed', 'never', 'view', 'raw data behind the result'),
    ('metallography_scale_calibrations', '/metallography/scale-calibrations', 'edit', 'view', 'microscope calibrations (6.4, 6.5)'),
    ('metallography_scale_calibrations', '/metallography/analyses', 'never', 'view', 'calibration picker'),
    ('metallography_scale_calibrations', '/samples/results-review', 'never', 'view', 'analysis view'),
    ('metallography_parameter_methods', '/metallography/methods', 'edit', 'view', 'metallography method setup (7.2)'),
    ('metallography_parameter_methods', '/metallography/analyses', 'never', 'view', 'method of each analysis'),
    ('metallography_parameter_methods', '/samples/under-testing', 'never', 'view', 'Metallography link in Enter Results'),
    ('metallography_parameter_methods', '/samples/results-review', 'never', 'view', 'analysis view'),
    ('metallography_settings', '/metallography/methods', 'edit', 'view', 'module switch (Director only by RLS)'),
    ('metallography_settings', '/metallography/analyses', 'never', 'view', 'module switch'),
    ('metallography_settings', '/samples/under-testing', 'never', 'view', 'module switch'),
    ('metallography_settings', '/samples/results-review', 'never', 'view', 'module switch'),
    ('metallography_rechecks', '/samples/results-review', 'edit', 'view', 'reviewer re-check (7.7)'),
    ('metallography_rechecks', '/metallography/analyses', 'never', 'view', 're-check history')
  ) AS v(t, p, w, r, n)
  ON CONFLICT (table_name, module_path) DO NOTHING;
  SELECT count(*) INTO v_installed FROM public.app_module_access_install() WHERE status = 'installed';
  RAISE NOTICE 'module access re-installed on % tables', v_installed;
END $$;

NOTIFY pgrst, 'reload schema';
