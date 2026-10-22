-- ISO/IEC 17025 gap P2-2 (risks and opportunities, 8.5 / 4.1) and P2-9
-- (internal audit programme coverage and auditor independence, 8.8).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff),
-- 20261024100000_audit_trail_expansion.sql (write_audit_log) and
-- 20261025100000_soft_delete.sql, while the lab is idle. Safe to re-run.
-- The frontend works with or without it: until it is applied the risk
-- register and the audit plan save exactly as before (the new fields are
-- left out and the save is retried), and the coverage page shows clause
-- coverage only.
--
-- What it adds
--   gr_risk_opportunities
--     likelihood, severity, risk_score        Inherent risk (1-5 x 1-5, score
--                                             stored as a generated column).
--     residual_likelihood, residual_severity, Residual risk after the planned
--     residual_score                          actions (same scale).
--     owner_user_id, owner_name               Risk owner. owner_name is set by
--                                             the database from user_profiles.
--     target_date                             Target date for the actions.
--     review_frequency, last_reviewed_on,     Periodic review. When
--     next_review_date                        next_review_date is blank it is
--                                             set from the last review (or the
--                                             identification date) plus the
--                                             frequency.
--     source_type, source_ref                 Where the risk came from: process,
--                                             complaint, nonconformity, internal
--                                             audit, impartiality, management
--                                             review, external issue, other,
--                                             with the record number.
--   audit_plans
--     audit_kind                              system (horizontal) / vertical /
--                                             witness.
--     scope_discipline                        NABL scope discipline covered by a
--                                             vertical or witness audit.
--     witnessed_user_id, witnessed_name       Person witnessed (e.g. an
--                                             authorized signatory or analyst).
--     sample_ref                              Sample / report traced.
--     auditee_departments, auditor_user_ids   Set by the database from
--                                             team_rows on every save.
--     independence_conflicts                  Team rows where the auditor is
--                                             from the audited department
--                                             (8.8.2 b: auditors shall not
--                                             audit their own work). Set by the
--                                             database; the app warns on save.
--
-- Access
--   gr_risk_opportunities, audit_plans, audit_checklist_items: the old
--   USING (true) policies become known-staff policies, explicit grants, and
--   the restrictive lims_known_staff_only gate is (re)created.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.gr_risk_opportunities') IS NULL
     OR to_regclass('public.audit_plans') IS NULL
     OR to_regclass('public.audit_checklist_items') IS NULL THEN
    RAISE EXCEPTION 'gr_risk_opportunities, audit_plans and audit_checklist_items must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Risk register: scoring, owner, review, source
-- ---------------------------------------------------------------------------

ALTER TABLE public.gr_risk_opportunities
  ADD COLUMN IF NOT EXISTS likelihood int,
  ADD COLUMN IF NOT EXISTS severity int,
  ADD COLUMN IF NOT EXISTS residual_likelihood int,
  ADD COLUMN IF NOT EXISTS residual_severity int,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS review_frequency text,
  ADD COLUMN IF NOT EXISTS last_reviewed_on date,
  ADD COLUMN IF NOT EXISTS next_review_date date,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_ref text;

ALTER TABLE public.gr_risk_opportunities
  ADD COLUMN IF NOT EXISTS risk_score int GENERATED ALWAYS AS (likelihood * severity) STORED;
ALTER TABLE public.gr_risk_opportunities
  ADD COLUMN IF NOT EXISTS residual_score int
    GENERATED ALWAYS AS (residual_likelihood * residual_severity) STORED;

DO $$
DECLARE
  v_name text;
  v_def text;
BEGIN
  FOR v_name, v_def IN
    SELECT * FROM (VALUES
      ('gr_risk_opportunities_likelihood_check', 'CHECK (likelihood IS NULL OR likelihood BETWEEN 1 AND 5)'),
      ('gr_risk_opportunities_severity_check', 'CHECK (severity IS NULL OR severity BETWEEN 1 AND 5)'),
      ('gr_risk_opportunities_res_likelihood_check',
        'CHECK (residual_likelihood IS NULL OR residual_likelihood BETWEEN 1 AND 5)'),
      ('gr_risk_opportunities_res_severity_check',
        'CHECK (residual_severity IS NULL OR residual_severity BETWEEN 1 AND 5)'),
      ('gr_risk_opportunities_review_frequency_check',
        'CHECK (review_frequency IS NULL OR review_frequency IN '
        '(''Monthly'', ''Quarterly'', ''Half-yearly'', ''Annually''))'),
      ('gr_risk_opportunities_source_type_check',
        'CHECK (source_type IS NULL OR source_type IN '
        '(''Process'', ''Complaint'', ''Nonconformity'', ''Internal audit'', ''Impartiality'', '
        '''Management review'', ''External issue'', ''Other''))')
    ) AS t (n, d)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = v_name AND conrelid = 'public.gr_risk_opportunities'::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.gr_risk_opportunities ADD CONSTRAINT %I %s', v_name, v_def);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_gr_risk_opportunities_next_review
  ON public.gr_risk_opportunities (next_review_date) WHERE next_review_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gr_risk_opportunities_owner
  ON public.gr_risk_opportunities (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Review interval for a frequency, NULL for none / unknown.
CREATE OR REPLACE FUNCTION public.app_risk_review_interval(p_frequency text)
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_frequency
    WHEN 'Monthly' THEN interval '1 month'
    WHEN 'Quarterly' THEN interval '3 months'
    WHEN 'Half-yearly' THEN interval '6 months'
    WHEN 'Annually' THEN interval '12 months'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.app_risk_review_interval(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_risk_review_interval(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gr_risk_opportunities_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_interval interval;
BEGIN
  NEW.source_ref := nullif(btrim(coalesce(NEW.source_ref, '')), '');

  -- Owner name always comes from the owner's profile when there is one.
  IF NEW.owner_user_id IS NULL THEN
    NEW.owner_name := nullif(btrim(coalesce(NEW.owner_name, '')), '');
  ELSE
    SELECT coalesce(nullif(btrim(up.full_name), ''), up.email)
      INTO v_name
      FROM public.user_profiles up
     WHERE up.id = NEW.owner_user_id;
    IF v_name IS NOT NULL THEN
      NEW.owner_name := v_name;
    END IF;
  END IF;

  -- Next review: blank, or the last review moved while the next date stayed.
  v_interval := public.app_risk_review_interval(NEW.review_frequency);
  IF v_interval IS NOT NULL THEN
    IF NEW.next_review_date IS NULL
       OR (TG_OP = 'UPDATE'
           AND NEW.last_reviewed_on IS DISTINCT FROM OLD.last_reviewed_on
           AND NEW.next_review_date IS NOT DISTINCT FROM OLD.next_review_date) THEN
      NEW.next_review_date :=
        (coalesce(NEW.last_reviewed_on, NEW.identified_at, current_date) + v_interval)::date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.gr_risk_opportunities_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gr_risk_opportunities_before_write ON public.gr_risk_opportunities;
CREATE TRIGGER trg_gr_risk_opportunities_before_write
  BEFORE INSERT OR UPDATE ON public.gr_risk_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.gr_risk_opportunities_before_write();

-- ---------------------------------------------------------------------------
-- 2. Audit plans: kind, discipline, witnessed person, independence
-- ---------------------------------------------------------------------------

ALTER TABLE public.audit_plans
  ADD COLUMN IF NOT EXISTS audit_kind text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS scope_discipline text,
  ADD COLUMN IF NOT EXISTS witnessed_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS witnessed_name text,
  ADD COLUMN IF NOT EXISTS sample_ref text,
  ADD COLUMN IF NOT EXISTS auditee_departments text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS auditor_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS independence_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_plans_audit_kind_check' AND conrelid = 'public.audit_plans'::regclass
  ) THEN
    ALTER TABLE public.audit_plans
      ADD CONSTRAINT audit_plans_audit_kind_check CHECK (audit_kind IN ('system', 'vertical', 'witness'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_plans_independence_conflicts_check' AND conrelid = 'public.audit_plans'::regclass
  ) THEN
    ALTER TABLE public.audit_plans
      ADD CONSTRAINT audit_plans_independence_conflicts_check
      CHECK (jsonb_typeof(independence_conflicts) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_plans_kind_from
  ON public.audit_plans (audit_kind, proposed_from DESC);
CREATE INDEX IF NOT EXISTS idx_audit_plans_witnessed_user
  ON public.audit_plans (witnessed_user_id) WHERE witnessed_user_id IS NOT NULL;

-- Text that is a UUID, else NULL (never raises).
CREATE OR REPLACE FUNCTION public.app_text_to_uuid(p text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p, ''))) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN lower(btrim(p))::uuid
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.app_text_to_uuid(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_text_to_uuid(text) TO authenticated, service_role;

-- Team rows as stored by the app: [{auditeeDepartment, auditorDepartment,
-- auditorUserId, auditorName, ...}]. Anything that is not an array counts as
-- no rows.
CREATE OR REPLACE FUNCTION public.app_audit_team_auditee_departments(p_team jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT d ORDER BY d), '{}'::text[])
  FROM (
    SELECT btrim(e ->> 'auditeeDepartment') AS d
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_team) = 'array' THEN p_team ELSE '[]'::jsonb END) e
    WHERE jsonb_typeof(e) = 'object'
  ) s
  WHERE coalesce(d, '') <> '';
$$;

CREATE OR REPLACE FUNCTION public.app_audit_team_auditor_ids(p_team jsonb)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT u), '{}'::uuid[])
  FROM (
    SELECT public.app_text_to_uuid(e ->> 'auditorUserId') AS u
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_team) = 'array' THEN p_team ELSE '[]'::jsonb END) e
    WHERE jsonb_typeof(e) = 'object'
  ) s
  WHERE u IS NOT NULL;
$$;

-- Rows whose auditor works in the audited department. The auditor's
-- department is taken from the auditor's profile when an auditor person is
-- chosen, else from the auditor department picked on the row.
CREATE OR REPLACE FUNCTION public.app_audit_team_conflicts(p_team jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH rows AS (
    SELECT e, ord
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_team) = 'array' THEN p_team ELSE '[]'::jsonb END)
      WITH ORDINALITY AS t (e, ord)
    WHERE jsonb_typeof(e) = 'object'
  ),
  resolved AS (
    SELECT r.ord,
           btrim(coalesce(r.e ->> 'auditeeDepartment', '')) AS auditee_dept,
           coalesce(nullif(btrim(up.department_name), ''), btrim(coalesce(r.e ->> 'auditorDepartment', '')))
             AS auditor_dept,
           coalesce(nullif(btrim(up.full_name), ''), nullif(btrim(coalesce(r.e ->> 'auditorName', '')), ''),
             nullif(btrim(coalesce(r.e ->> 'auditorDesignation', '')), '')) AS auditor_name
    FROM rows r
    LEFT JOIN public.user_profiles up
      ON up.id = public.app_text_to_uuid(r.e ->> 'auditorUserId')
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'row', ord,
        'auditee_department', auditee_dept,
        'auditor_department', auditor_dept,
        'auditor_name', auditor_name
      ) ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM resolved
  WHERE auditee_dept <> ''
    AND lower(auditee_dept) = lower(auditor_dept);
$$;

REVOKE ALL ON FUNCTION public.app_audit_team_auditee_departments(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_audit_team_auditor_ids(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_audit_team_conflicts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_audit_team_auditee_departments(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_audit_team_auditor_ids(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_audit_team_conflicts(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_plans_derive_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  NEW.auditee_departments := public.app_audit_team_auditee_departments(NEW.team_rows);
  NEW.auditor_user_ids := public.app_audit_team_auditor_ids(NEW.team_rows);
  NEW.independence_conflicts := public.app_audit_team_conflicts(NEW.team_rows);
  NEW.scope_discipline := nullif(btrim(coalesce(NEW.scope_discipline, '')), '');
  NEW.sample_ref := nullif(btrim(coalesce(NEW.sample_ref, '')), '');

  IF NEW.witnessed_user_id IS NULL THEN
    NEW.witnessed_name := nullif(btrim(coalesce(NEW.witnessed_name, '')), '');
  ELSE
    SELECT coalesce(nullif(btrim(up.full_name), ''), up.email)
      INTO v_name
      FROM public.user_profiles up
     WHERE up.id = NEW.witnessed_user_id;
    IF v_name IS NOT NULL THEN
      NEW.witnessed_name := v_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_plans_derive_team() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_plans_derive_team ON public.audit_plans;
CREATE TRIGGER trg_audit_plans_derive_team
  BEFORE INSERT OR UPDATE ON public.audit_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_plans_derive_team();

-- Backfill existing plans (a no-op on re-run).
UPDATE public.audit_plans ap
   SET auditee_departments = public.app_audit_team_auditee_departments(ap.team_rows),
       auditor_user_ids = public.app_audit_team_auditor_ids(ap.team_rows),
       independence_conflicts = public.app_audit_team_conflicts(ap.team_rows)
 WHERE ap.auditee_departments IS DISTINCT FROM public.app_audit_team_auditee_departments(ap.team_rows)
    OR ap.auditor_user_ids IS DISTINCT FROM public.app_audit_team_auditor_ids(ap.team_rows)
    OR ap.independence_conflicts IS DISTINCT FROM public.app_audit_team_conflicts(ap.team_rows);

-- ---------------------------------------------------------------------------
-- 3. Row level security and grants (known staff instead of USING (true))
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['gr_risk_opportunities', 'audit_plans', 'audit_checklist_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lims_' || rel || '_authenticated_all', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'lims_' || rel || '_known_staff_all', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      'lims_' || rel || '_known_staff_all', rel);
    -- Same outer gate as every other public table (20261009063000).
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', rel);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', rel);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
  END LOOP;
END $$;

-- auditee_departments, auditor_user_ids and independence_conflicts are
-- overwritten by trg_audit_plans_derive_team on every insert and update, so a
-- value sent by the browser never sticks.

-- ---------------------------------------------------------------------------
-- 4. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: risk / audit tables are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['gr_risk_opportunities', 'audit_plans', 'audit_checklist_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

COMMENT ON COLUMN public.gr_risk_opportunities.risk_score IS
  'Inherent risk: likelihood x severity (1-25). >= 15 High, >= 8 Medium, else Low.';
COMMENT ON COLUMN public.gr_risk_opportunities.residual_score IS
  'Residual risk after actions: residual_likelihood x residual_severity (1-25).';
COMMENT ON COLUMN public.audit_plans.independence_conflicts IS
  'Team rows whose auditor is from the audited department (ISO/IEC 17025 8.8.2). Set by trigger.';

NOTIFY pgrst, 'reload schema';
