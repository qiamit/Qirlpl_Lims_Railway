-- ISO/IEC 17025 gap P1-5: proficiency testing / interlaboratory comparisons (7.7.2).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager),
-- 20261024100000_audit_trail_expansion.sql (write_audit_log) and the NABL
-- scope / clients / nc_work_records tables, while the lab is idle.
-- Safe to re-run.
--
-- NABL expects a 4-year PT plan that covers every sub-discipline of the
-- scope, and at least one PT per sub-discipline before accreditation.
--
-- What it adds
--   pt_plans            The 4-year PT / ILC plan: one row per sub-discipline
--                       (testing: nabl_scope.discipline_group; calibration:
--                       calibration_nabl_scope discipline_name / group_name)
--                       and planned year, with the planned provider
--                       (clients, company_type 'PT Provider') and scheme.
--   pt_participations   PT rounds the lab took part in, with the result,
--                       assigned value, SD for PT and uncertainties. The
--                       database computes the scores and the performance:
--
--     d     = lab_result - assigned_value
--     z     = d / sd_for_pt                                (sd_for_pt > 0)
--     En    = d / sqrt(U_lab^2 + U_ref^2)                  (expanded U, k)
--     zeta  = d / sqrt((U_lab/k)^2 + (U_ref/k)^2)          (standard u = U/k)
--     Scores are rounded to 2 decimals; the rounded value is classified.
--     When z / En cannot be computed (no SD for PT / no uncertainties) the
--     score reported by the provider (provider_z_score / provider_en_score)
--     is used instead.
--     z:  |z| <= 2 satisfactory, 2 < |z| < 3 questionable, |z| >= 3 unsatisfactory
--     En: |En| <= 1 satisfactory, |En| > 1 unsatisfactory
--     performance = the worse of the z and En classes; zeta is informative.
--     With no score at all (qualitative PT) manual_performance is used.
--
--   Closing a participation (status 'closed') needs a performance, a linked
--   nonconforming work record (nc_record_id) when unsatisfactory, and a
--   monitoring note when questionable (ISO/IEC 17025 7.7.3, 7.10).
--
--   Storage bucket pt-reports (private) for the provider's final report.
--
-- Access
--   Read: known staff. Insert / update: Laboratory Director, Quality Manager
--   or a Technical Manager (app_pt_can_manage). Delete: Laboratory Director.
--   Restrictive gate lims_known_staff_only like every other public table.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.clients') IS NULL OR to_regclass('public.nc_work_records') IS NULL THEN
    RAISE EXCEPTION 'clients and nc_work_records must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Who may maintain the PT plan and participations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_pt_can_manage()
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

REVOKE ALL ON FUNCTION public.app_pt_can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_pt_can_manage() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Score maths (pure; also used by the tests).
-- ---------------------------------------------------------------------------

-- z = (x - X) / sigma_pt, rounded to 2 decimals. NULL when not computable.
CREATE OR REPLACE FUNCTION public.app_pt_z(p_x numeric, p_assigned numeric, p_sd numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_x IS NULL OR p_assigned IS NULL OR p_sd IS NULL OR p_sd <= 0 THEN NULL
    ELSE round((p_x - p_assigned) / p_sd, 2)
  END;
$$;

-- En = (x - X) / sqrt(U_lab^2 + U_ref^2), expanded uncertainties.
CREATE OR REPLACE FUNCTION public.app_pt_en(p_x numeric, p_assigned numeric, p_u_lab numeric, p_u_ref numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_x IS NULL OR p_assigned IS NULL OR p_u_lab IS NULL OR p_u_ref IS NULL
         OR (p_u_lab * p_u_lab + p_u_ref * p_u_ref) <= 0 THEN NULL
    ELSE round((p_x - p_assigned) / sqrt(p_u_lab * p_u_lab + p_u_ref * p_u_ref), 2)
  END;
$$;

-- zeta = (x - X) / sqrt(u_lab^2 + u_ref^2), standard uncertainties u = U / k.
CREATE OR REPLACE FUNCTION public.app_pt_zeta(p_x numeric, p_assigned numeric, p_u_lab numeric, p_u_ref numeric, p_k numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_x IS NULL OR p_assigned IS NULL OR p_u_lab IS NULL OR p_u_ref IS NULL
         OR coalesce(p_k, 0) <= 0
         OR (p_u_lab * p_u_lab + p_u_ref * p_u_ref) <= 0 THEN NULL
    ELSE round((p_x - p_assigned) / sqrt((p_u_lab / p_k) ^ 2 + (p_u_ref / p_k) ^ 2), 2)
  END;
$$;

-- Worse of the z class and the En class; manual only when there is no score.
CREATE OR REPLACE FUNCTION public.app_pt_performance(p_z numeric, p_en numeric, p_manual text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH c AS (
    SELECT
      CASE
        WHEN p_z IS NULL THEN NULL
        WHEN abs(p_z) <= 2 THEN 1
        WHEN abs(p_z) < 3 THEN 2
        ELSE 3
      END AS zc,
      CASE
        WHEN p_en IS NULL THEN NULL
        WHEN abs(p_en) <= 1 THEN 1
        ELSE 3
      END AS ec
  )
  SELECT CASE
    WHEN c.zc IS NULL AND c.ec IS NULL THEN
      CASE WHEN p_manual IN ('satisfactory', 'questionable', 'unsatisfactory') THEN p_manual END
    ELSE (ARRAY['satisfactory', 'questionable', 'unsatisfactory'])[greatest(coalesce(c.zc, 1), coalesce(c.ec, 1))]
  END
  FROM c;
$$;

REVOKE ALL ON FUNCTION public.app_pt_z(numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_pt_en(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_pt_zeta(numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_pt_performance(numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_pt_z(numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_pt_en(numeric, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_pt_zeta(numeric, numeric, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_pt_performance(numeric, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pt_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from date NOT NULL,
  period_to date NOT NULL,
  scope_kind text NOT NULL DEFAULT 'testing',
  discipline text NOT NULL,
  sub_discipline text NOT NULL DEFAULT '',
  -- nabl_scope.id (testing) or calibration_nabl_scope.id (calibration) rows covered.
  scope_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  parameters text,
  planned_year int NOT NULL,
  planned_provider_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  scheme text,
  status text NOT NULL DEFAULT 'planned',
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_plans_scope_kind_check CHECK (scope_kind IN ('testing', 'calibration')),
  CONSTRAINT pt_plans_discipline_check CHECK (btrim(discipline) <> ''),
  CONSTRAINT pt_plans_status_check CHECK (status IN ('planned', 'enrolled', 'participated', 'postponed', 'cancelled')),
  CONSTRAINT pt_plans_period_check CHECK (
    period_to >= period_from AND period_to < (period_from + interval '5 years')::date
  ),
  CONSTRAINT pt_plans_year_check CHECK (
    planned_year BETWEEN extract(year FROM period_from)::int AND extract(year FROM period_to)::int
  )
);

CREATE INDEX IF NOT EXISTS idx_pt_plans_period ON public.pt_plans (period_from, period_to);
CREATE INDEX IF NOT EXISTS idx_pt_plans_sub ON public.pt_plans (scope_kind, discipline, sub_discipline, planned_year);

CREATE TABLE IF NOT EXISTS public.pt_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES public.pt_plans (id) ON DELETE SET NULL,
  scope_kind text NOT NULL DEFAULT 'testing',
  discipline text,
  sub_discipline text,
  scope_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  provider_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  provider_name text,
  provider_iso17043_accredited boolean NOT NULL DEFAULT false,
  scheme_name text,
  round_code text,
  sample_description text,
  parameter text NOT NULL,
  unit text,
  method text,
  received_on date,
  reported_on date,
  lab_result numeric,
  assigned_value numeric,
  sd_for_pt numeric,
  lab_uncertainty numeric,
  ref_uncertainty numeric,
  coverage_factor numeric NOT NULL DEFAULT 2,
  provider_z_score numeric,
  provider_en_score numeric,
  z_score numeric,
  en_score numeric,
  zeta_score numeric,
  manual_performance text,
  performance text,
  analyst_user_id uuid,
  analyst_name text,
  report_path text,
  monitor_note text,
  remarks text,
  nc_record_id uuid REFERENCES public.nc_work_records (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_participations_scope_kind_check CHECK (scope_kind IN ('testing', 'calibration')),
  CONSTRAINT pt_participations_parameter_check CHECK (btrim(parameter) <> ''),
  CONSTRAINT pt_participations_sd_check CHECK (sd_for_pt IS NULL OR sd_for_pt > 0),
  CONSTRAINT pt_participations_u_check CHECK (
    (lab_uncertainty IS NULL OR lab_uncertainty >= 0) AND (ref_uncertainty IS NULL OR ref_uncertainty >= 0)
  ),
  CONSTRAINT pt_participations_k_check CHECK (coverage_factor > 0),
  CONSTRAINT pt_participations_dates_check CHECK (
    received_on IS NULL OR reported_on IS NULL OR reported_on >= received_on
  ),
  CONSTRAINT pt_participations_performance_check CHECK (
    performance IS NULL OR performance IN ('satisfactory', 'questionable', 'unsatisfactory')
  ),
  CONSTRAINT pt_participations_manual_check CHECK (
    manual_performance IS NULL OR manual_performance IN ('satisfactory', 'questionable', 'unsatisfactory')
  ),
  CONSTRAINT pt_participations_status_check CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_pt_participations_plan ON public.pt_participations (plan_id);
CREATE INDEX IF NOT EXISTS idx_pt_participations_reported ON public.pt_participations (reported_on DESC);
CREATE INDEX IF NOT EXISTS idx_pt_participations_sub ON public.pt_participations (scope_kind, discipline, sub_discipline);
CREATE INDEX IF NOT EXISTS idx_pt_participations_analyst ON public.pt_participations (analyst_user_id);
CREATE INDEX IF NOT EXISTS idx_pt_participations_nc
  ON public.pt_participations (nc_record_id) WHERE nc_record_id IS NOT NULL;

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['pt_plans', 'pt_participations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Participations: scores, performance, snapshots, closing rules.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pt_participations_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.pt_plans%ROWTYPE;
  v_name text;
  -- current_user is the definer here; the role GUC still names the API role.
  v_app boolean := coalesce(current_setting('role', true), '') IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
  END IF;
  NEW.scope_ids := coalesce(NEW.scope_ids, '{}'::uuid[]);

  -- Sub-discipline and scope from the plan when not given.
  IF NEW.plan_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN
    SELECT * INTO p FROM public.pt_plans WHERE id = NEW.plan_id;
    IF FOUND THEN
      NEW.scope_kind := coalesce(p.scope_kind, NEW.scope_kind);
      NEW.discipline := coalesce(nullif(btrim(NEW.discipline), ''), p.discipline);
      NEW.sub_discipline := coalesce(nullif(btrim(NEW.sub_discipline), ''), p.sub_discipline);
      IF cardinality(NEW.scope_ids) = 0 THEN
        NEW.scope_ids := p.scope_ids;
      END IF;
      IF NEW.provider_id IS NULL THEN
        NEW.provider_id := p.planned_provider_id;
      END IF;
      IF nullif(btrim(NEW.scheme_name), '') IS NULL THEN
        NEW.scheme_name := p.scheme;
      END IF;
    END IF;
  END IF;

  -- Provider name snapshot (the client master may change later).
  IF NEW.provider_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
          OR nullif(btrim(NEW.provider_name), '') IS NULL) THEN
    SELECT c.company_name INTO v_name FROM public.clients c WHERE c.id = NEW.provider_id;
    IF v_name IS NOT NULL THEN
      NEW.provider_name := v_name;
    END IF;
  END IF;

  -- Analyst name snapshot.
  IF NEW.analyst_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.analyst_user_id IS DISTINCT FROM OLD.analyst_user_id
          OR nullif(btrim(NEW.analyst_name), '') IS NULL) THEN
    v_name := NULL;
    SELECT coalesce(nullif(btrim(up.full_name), ''), up.email) INTO v_name
      FROM public.user_profiles up WHERE up.id = NEW.analyst_user_id;
    IF v_name IS NOT NULL THEN
      NEW.analyst_name := v_name;
    END IF;
  END IF;

  -- Scores: always computed here; client values are ignored.
  NEW.z_score := coalesce(
    public.app_pt_z(NEW.lab_result, NEW.assigned_value, NEW.sd_for_pt),
    round(NEW.provider_z_score, 2)
  );
  NEW.en_score := coalesce(
    public.app_pt_en(NEW.lab_result, NEW.assigned_value, NEW.lab_uncertainty, NEW.ref_uncertainty),
    round(NEW.provider_en_score, 2)
  );
  NEW.zeta_score := public.app_pt_zeta(
    NEW.lab_result, NEW.assigned_value, NEW.lab_uncertainty, NEW.ref_uncertainty, NEW.coverage_factor
  );
  NEW.performance := public.app_pt_performance(NEW.z_score, NEW.en_score, NEW.manual_performance);

  -- Closing rules (7.7.3 / 7.10). The owner and service_role are not limited.
  IF NEW.status = 'closed' AND v_app THEN
    IF NEW.performance IS NULL THEN
      RAISE EXCEPTION 'A PT participation can be closed only after its performance is known.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.performance = 'unsatisfactory' AND NEW.nc_record_id IS NULL THEN
      RAISE EXCEPTION 'An unsatisfactory PT result needs a nonconforming work record before it is closed.'
        USING ERRCODE = '23514',
              HINT = 'Raise NC from the PT participation (ISO/IEC 17025 7.7.3, 7.10).';
    END IF;
    IF NEW.performance = 'questionable' AND nullif(btrim(NEW.monitor_note), '') IS NULL THEN
      RAISE EXCEPTION 'A questionable PT result needs a monitoring note before it is closed.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pt_participations_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pt_participations_before_write ON public.pt_participations;
CREATE TRIGGER trg_pt_participations_before_write
  BEFORE INSERT OR UPDATE ON public.pt_participations
  FOR EACH ROW EXECUTE FUNCTION public.pt_participations_before_write();

-- ---------------------------------------------------------------------------
-- 5. Row level security and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.pt_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_participations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['pt_plans', 'pt_participations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_pt_can_manage())',
      rel || '_insert', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_update', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.app_pt_can_manage()) WITH CHECK (public.app_pt_can_manage())',
      rel || '_update', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_delete', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.app_is_laboratory_director())',
      rel || '_delete', rel);

    -- Same outer gate as every other public table (20261009063000).
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
  END LOOP;
END $$;

REVOKE ALL ON public.pt_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pt_participations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pt_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pt_participations TO authenticated;
GRANT ALL ON public.pt_plans TO service_role;
GRANT ALL ON public.pt_participations TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Storage: provider reports (private; signed URLs only).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema missing; pt-reports bucket skipped.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'pt-reports',
    'pt-reports',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  )
  ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS lims_pt_reports_select ON storage.objects;
  CREATE POLICY lims_pt_reports_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'pt-reports' AND public.app_is_known_staff());

  DROP POLICY IF EXISTS lims_pt_reports_insert ON storage.objects;
  CREATE POLICY lims_pt_reports_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'pt-reports' AND public.app_pt_can_manage());

  DROP POLICY IF EXISTS lims_pt_reports_update ON storage.objects;
  CREATE POLICY lims_pt_reports_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'pt-reports' AND public.app_pt_can_manage())
    WITH CHECK (bucket_id = 'pt-reports' AND public.app_pt_can_manage());

  DROP POLICY IF EXISTS lims_pt_reports_delete ON storage.objects;
  CREATE POLICY lims_pt_reports_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'pt-reports' AND public.app_pt_can_manage());
END $$;

-- ---------------------------------------------------------------------------
-- 7. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: PT tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['pt_plans', 'pt_participations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

COMMENT ON TABLE public.pt_plans IS
  'ISO/IEC 17025 7.7.2 / NABL: 4-year proficiency testing plan per sub-discipline and year';
COMMENT ON TABLE public.pt_participations IS
  'ISO/IEC 17025 7.7.2: PT / ILC rounds with z, En, zeta scores and performance computed by trigger';

NOTIFY pgrst, 'reload schema';
