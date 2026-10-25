-- ISO/IEC 17025 gap P1-9: the LIMS itself (7.11.2, 7.11.3 c-e, 7.11.6).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_known_staff,
-- app_is_laboratory_director), 20261009103000 (app_is_quality_manager),
-- 20261024100000_audit_trail_expansion.sql (write_audit_log) and the NC
-- module (nc_work_records), while the lab is idle. Safe to re-run.
--
-- What it adds
--   software_changes      Change control for the LIMS (7.11.2: validated
--                         after changes). One row per change / release:
--                         version and commit, risk, whether validation is
--                         needed, approval, deployment, rollback plan.
--                         A change that needs validation cannot be marked
--                         deployed until it has a validation reference or a
--                         linked validation run with result 'pass'.
--   validation_test_runs  Records of validation runs (IQ / OQ / PQ /
--                         regression / calculation checks, 7.11.2, 7.11.6):
--                         app version, environment, who ran it, result and
--                         evidence. The result and evidence are frozen once
--                         recorded: a wrong run is superseded by a new run.
--   it_incidents          LIMS failures and IT incidents (7.11.3 c-e):
--                         outage, data integrity, security, backup,
--                         performance. Immediate action, root cause,
--                         corrective action and an optional link to a
--                         nonconforming work record.
--   backup_restore_tests  Restore tests of the Railway Postgres backups
--                         (7.11.3 c: data protected against loss): which
--                         backup, where it was restored, checks done, result.
--
-- Numbers (set by the database for app users, never typed):
--   CHG-2026-001, VAL-2026-001, ITI-2026-001, BRT-2026-001 (per calendar year).
--
-- Access
--   Read: known staff. Insert / update: Laboratory Director or Quality
--   Manager. Delete: Laboratory Director only (stays in the audit trail).
--   Restrictive gate lims_known_staff_only like every other public table.
--   Soft delete (20261025100000) is not applied to these tables, same as the
--   environmental monitoring registers.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.app_is_known_staff()') IS NULL
     OR to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261009063000_security_role_checks.sql first';
  END IF;
  IF to_regclass('public.nc_work_records') IS NULL THEN
    RAISE EXCEPTION 'nc_work_records must exist first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Who may write: Laboratory Director or Quality Manager.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_lims_validation_can_write()
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
    RETURN coalesce(v_ok, false);
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lims_validation_can_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_lims_validation_can_write() TO authenticated, service_role;

-- Profile name of the signed-in user (falls back to the e-mail).
CREATE OR REPLACE FUNCTION public.app_lims_validation_user_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(nullif(btrim(up.full_name), ''), up.email)
  FROM public.user_profiles up
  WHERE up.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.app_lims_validation_user_name() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_lims_validation_user_name() TO authenticated, service_role;

-- Next register number PREFIX-YYYY-NNN for a table / column (year of p_on).
-- Serialised with a transaction advisory lock so two saves never share one.
CREATE OR REPLACE FUNCTION public.app_lims_register_next_no(
  p_table regclass,
  p_column text,
  p_prefix text,
  p_on date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year text := to_char(coalesce(p_on, current_date), 'YYYY');
  v_head text;
  v_max int;
BEGIN
  v_head := p_prefix || '-' || v_year || '-';
  PERFORM pg_advisory_xact_lock(hashtext('lims_register_no:' || p_table::text));
  EXECUTE format(
    'SELECT max(substring(%1$I FROM %2$s)::int) FROM %3$s WHERE %1$I LIKE %4$L AND substring(%1$I FROM %2$s) ~ ''^[0-9]+$''',
    p_column, length(v_head) + 1, p_table, v_head || '%'
  ) INTO v_max;
  RETURN v_head || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.app_lims_register_next_no(regclass, text, text, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.software_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_no text NOT NULL,
  title text NOT NULL,
  description text,
  reason text,
  modules_affected text,
  app_version text,
  commit_sha text,
  risk text NOT NULL DEFAULT 'medium',
  validation_required boolean NOT NULL DEFAULT true,
  validation_ref text,
  requested_by text,
  requested_on date NOT NULL DEFAULT current_date,
  approved_by text,
  approved_by_user uuid,
  approved_at timestamptz,
  deployed_at timestamptz,
  deployed_by text,
  status text NOT NULL DEFAULT 'requested',
  rollback_plan text,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT software_changes_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT software_changes_risk_check CHECK (risk IN ('low', 'medium', 'high')),
  CONSTRAINT software_changes_status_check CHECK (
    status IN ('requested', 'approved', 'rejected', 'deployed', 'rolled_back', 'cancelled')
  ),
  CONSTRAINT software_changes_commit_check CHECK (
    commit_sha IS NULL OR commit_sha ~ '^[0-9a-f]{7,40}$'
  ),
  CONSTRAINT software_changes_approval_check CHECK (
    status NOT IN ('approved', 'deployed', 'rolled_back')
    OR (approved_at IS NOT NULL AND btrim(coalesce(approved_by, '')) <> '')
  ),
  CONSTRAINT software_changes_deployed_check CHECK (
    status NOT IN ('deployed', 'rolled_back') OR deployed_at IS NOT NULL
  ),
  -- A high-risk change needs a rollback plan before it is approved.
  CONSTRAINT software_changes_rollback_check CHECK (
    risk <> 'high'
    OR status IN ('requested', 'rejected', 'cancelled')
    OR btrim(coalesce(rollback_plan, '')) <> ''
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS software_changes_change_no_key ON public.software_changes (change_no);
CREATE INDEX IF NOT EXISTS idx_software_changes_status ON public.software_changes (status, requested_on DESC);

CREATE TABLE IF NOT EXISTS public.validation_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_no text NOT NULL,
  title text NOT NULL,
  scope text NOT NULL,
  app_version text NOT NULL,
  commit_sha text,
  -- 'local' = a developer / QM machine (for example the offline
  -- calculation suite, npm run validate:calculations).
  environment text NOT NULL DEFAULT 'staging',
  executed_by text NOT NULL,
  executed_by_user uuid,
  executed_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL,
  cases_total int,
  cases_passed int,
  cases_failed int,
  -- Machine-readable evidence (for example the JSON written by the
  -- calculation suite) and paths / links of screenshots, PDFs, logs.
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_paths text[] NOT NULL DEFAULT '{}'::text[],
  deviations text,
  linked_change_id uuid REFERENCES public.software_changes (id) ON DELETE SET NULL,
  reviewed_by text,
  reviewed_at timestamptz,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT validation_test_runs_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT validation_test_runs_version_check CHECK (btrim(app_version) <> ''),
  CONSTRAINT validation_test_runs_executed_by_check CHECK (btrim(executed_by) <> ''),
  CONSTRAINT validation_test_runs_scope_check CHECK (scope IN ('IQ', 'OQ', 'PQ', 'regression', 'calculation')),
  CONSTRAINT validation_test_runs_environment_check CHECK (environment IN ('staging', 'production', 'local')),
  CONSTRAINT validation_test_runs_result_check CHECK (result IN ('pass', 'fail', 'partial')),
  CONSTRAINT validation_test_runs_commit_check CHECK (commit_sha IS NULL OR commit_sha ~ '^[0-9a-f]{7,40}$'),
  CONSTRAINT validation_test_runs_counts_check CHECK (
    (cases_total IS NULL OR cases_total >= 0)
    AND (cases_passed IS NULL OR cases_passed >= 0)
    AND (cases_failed IS NULL OR cases_failed >= 0)
    AND (cases_total IS NULL OR coalesce(cases_passed, 0) + coalesce(cases_failed, 0) <= cases_total)
  ),
  CONSTRAINT validation_test_runs_pass_check CHECK (result <> 'pass' OR coalesce(cases_failed, 0) = 0),
  -- A failed or partial run says what went wrong.
  CONSTRAINT validation_test_runs_deviation_check CHECK (
    result = 'pass' OR btrim(coalesce(deviations, '')) <> ''
  ),
  CONSTRAINT validation_test_runs_evidence_check CHECK (jsonb_typeof(evidence) IN ('object', 'array'))
);

CREATE UNIQUE INDEX IF NOT EXISTS validation_test_runs_run_no_key ON public.validation_test_runs (run_no);
CREATE INDEX IF NOT EXISTS idx_validation_test_runs_executed ON public.validation_test_runs (executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_test_runs_change
  ON public.validation_test_runs (linked_change_id) WHERE linked_change_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.it_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_no text NOT NULL,
  occurred_at timestamptz NOT NULL,
  detected_at timestamptz,
  detected_by text,
  category text NOT NULL,
  description text NOT NULL,
  data_impact text,
  affected_records text,
  immediate_action text,
  root_cause text,
  corrective_action text,
  nc_record_id uuid REFERENCES public.nc_work_records (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  closed_by text,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT it_incidents_description_check CHECK (btrim(description) <> ''),
  CONSTRAINT it_incidents_category_check CHECK (
    category IN ('outage', 'data_integrity', 'security', 'backup', 'performance', 'other')
  ),
  CONSTRAINT it_incidents_status_check CHECK (status IN ('open', 'investigating', 'closed')),
  CONSTRAINT it_incidents_detected_check CHECK (detected_at IS NULL OR detected_at >= occurred_at),
  CONSTRAINT it_incidents_closed_check CHECK (
    status <> 'closed'
    OR (closed_at IS NOT NULL AND closed_at >= occurred_at AND btrim(coalesce(corrective_action, '')) <> '')
  ),
  -- Data integrity, security and backup incidents state the effect on data
  -- (records, results, reports) before they are closed.
  CONSTRAINT it_incidents_impact_check CHECK (
    status <> 'closed'
    OR category NOT IN ('data_integrity', 'security', 'backup')
    OR btrim(coalesce(data_impact, '')) <> ''
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS it_incidents_incident_no_key ON public.it_incidents (incident_no);
CREATE INDEX IF NOT EXISTS idx_it_incidents_status ON public.it_incidents (status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_it_incidents_nc ON public.it_incidents (nc_record_id) WHERE nc_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.backup_restore_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_no text NOT NULL,
  tested_on date NOT NULL DEFAULT current_date,
  backup_kind text NOT NULL DEFAULT 'daily',
  backup_id text,
  backup_name text,
  backup_taken_at timestamptz,
  restored_to text NOT NULL,
  -- [{"check": "Row count samples", "ok": true, "note": "4 210 = 4 210"}]
  checks_done jsonb NOT NULL DEFAULT '[]'::jsonb,
  result text NOT NULL,
  restore_minutes int,
  performed_by text NOT NULL,
  witnessed_by text,
  linked_incident_id uuid REFERENCES public.it_incidents (id) ON DELETE SET NULL,
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backup_restore_tests_kind_check CHECK (backup_kind IN ('daily', 'weekly', 'manual', 'other')),
  CONSTRAINT backup_restore_tests_backup_check CHECK (
    btrim(coalesce(backup_id, '')) <> '' OR btrim(coalesce(backup_name, '')) <> ''
  ),
  CONSTRAINT backup_restore_tests_restored_to_check CHECK (btrim(restored_to) <> ''),
  CONSTRAINT backup_restore_tests_performed_by_check CHECK (btrim(performed_by) <> ''),
  CONSTRAINT backup_restore_tests_result_check CHECK (result IN ('pass', 'fail', 'partial')),
  CONSTRAINT backup_restore_tests_checks_check CHECK (jsonb_typeof(checks_done) = 'array'),
  CONSTRAINT backup_restore_tests_minutes_check CHECK (restore_minutes IS NULL OR restore_minutes >= 0),
  CONSTRAINT backup_restore_tests_remarks_check CHECK (
    result = 'pass' OR btrim(coalesce(remarks, '')) <> ''
  ),
  CONSTRAINT backup_restore_tests_date_check CHECK (
    backup_taken_at IS NULL OR backup_taken_at::date <= tested_on
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS backup_restore_tests_test_no_key ON public.backup_restore_tests (test_no);
CREATE INDEX IF NOT EXISTS idx_backup_restore_tests_date ON public.backup_restore_tests (tested_on DESC);

-- updated_at
DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['software_changes', 'validation_test_runs', 'it_incidents', 'backup_restore_tests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || rel || '_updated_at', rel);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      'trg_' || rel || '_updated_at', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Triggers: numbers, who did it, and the rules that need other rows.
--    "App users" are signed-in callers (auth.uid() set). The functions are
--    SECURITY DEFINER, so current_user cannot tell them apart. The owner and
--    service_role (imports, fixes by the administrator, no user id) are not
--    limited.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.software_changes_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := auth.uid() IS NOT NULL;
  v_name text := public.app_lims_validation_user_name();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_app OR btrim(coalesce(NEW.change_no, '')) = '' THEN
      NEW.change_no := public.app_lims_register_next_no(
        'public.software_changes'::regclass, 'change_no', 'CHG', coalesce(NEW.requested_on, current_date));
    END IF;
    IF v_app THEN
      NEW.created_by := auth.uid();
      NEW.created_at := now();
      NEW.requested_by := coalesce(nullif(btrim(NEW.requested_by), ''), v_name);
    END IF;
  ELSIF v_app AND NEW.change_no IS DISTINCT FROM OLD.change_no THEN
    RAISE EXCEPTION 'The change number cannot be changed' USING ERRCODE = '42501';
  END IF;

  NEW.commit_sha := nullif(lower(btrim(coalesce(NEW.commit_sha, ''))), '');

  -- Approval is stamped with the signed-in approver, never typed.
  IF v_app AND NEW.status IN ('approved', 'deployed', 'rolled_back')
     AND (TG_OP = 'INSERT' OR OLD.status IN ('requested', 'rejected', 'cancelled')) THEN
    NEW.approved_by_user := auth.uid();
    NEW.approved_by := coalesce(v_name, NEW.approved_by);
    NEW.approved_at := now();
  ELSIF v_app AND TG_OP = 'UPDATE' THEN
    NEW.approved_by_user := OLD.approved_by_user;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
  ELSIF v_app THEN
    NEW.approved_by_user := NULL;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  IF NEW.status IN ('deployed', 'rolled_back') THEN
    NEW.deployed_at := coalesce(NEW.deployed_at, now());
    IF v_app AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('deployed', 'rolled_back')) THEN
      NEW.deployed_by := coalesce(nullif(btrim(NEW.deployed_by), ''), v_name);
    END IF;
  END IF;

  -- 7.11.2: validated before use. A change that needs validation is deployed
  -- only with a validation reference or a passed validation run linked to it.
  IF NEW.status = 'deployed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'deployed')
     AND NEW.validation_required
     AND btrim(coalesce(NEW.validation_ref, '')) = ''
     AND NOT EXISTS (
       SELECT 1 FROM public.validation_test_runs v
       WHERE v.linked_change_id = NEW.id AND v.result = 'pass'
     ) THEN
    RAISE EXCEPTION 'This change needs validation before it is deployed.'
      USING ERRCODE = '23514',
            HINT = 'Record a passed validation run linked to the change, or enter the validation reference (ISO/IEC 17025 7.11.2).';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.software_changes_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_software_changes_before_write ON public.software_changes;
CREATE TRIGGER trg_software_changes_before_write
  BEFORE INSERT OR UPDATE ON public.software_changes
  FOR EACH ROW EXECUTE FUNCTION public.software_changes_before_write();

CREATE OR REPLACE FUNCTION public.validation_test_runs_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := auth.uid() IS NOT NULL;
  v_name text := public.app_lims_validation_user_name();
  v_frozen text[] := ARRAY[
    'run_no', 'title', 'scope', 'app_version', 'commit_sha', 'environment', 'executed_by',
    'executed_by_user', 'executed_at', 'result', 'cases_total', 'cases_passed', 'cases_failed',
    'evidence', 'evidence_paths', 'deviations', 'created_by', 'created_at'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_app OR btrim(coalesce(NEW.run_no, '')) = '' THEN
      NEW.run_no := public.app_lims_register_next_no(
        'public.validation_test_runs'::regclass, 'run_no', 'VAL', coalesce(NEW.executed_at, now())::date);
    END IF;
    NEW.commit_sha := nullif(lower(btrim(coalesce(NEW.commit_sha, ''))), '');
    IF v_app THEN
      NEW.created_by := auth.uid();
      NEW.created_at := now();
      NEW.executed_by_user := auth.uid();
      NEW.executed_by := coalesce(nullif(btrim(NEW.executed_by), ''), v_name, '');
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      IF NEW.executed_at > now() + interval '1 hour' THEN
        RAISE EXCEPTION 'A validation run cannot be dated in the future (%).', NEW.executed_at
          USING ERRCODE = '22007';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT v_app THEN
    RETURN NEW;
  END IF;

  -- The result and its evidence are a record: frozen after saving.
  IF (to_jsonb(NEW) - ARRAY(SELECT k FROM jsonb_object_keys(to_jsonb(NEW)) k WHERE k <> ALL (v_frozen)))
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY(SELECT k FROM jsonb_object_keys(to_jsonb(OLD)) k WHERE k <> ALL (v_frozen))) THEN
    RAISE EXCEPTION 'The result and evidence of a validation run cannot be changed. Record a new run instead.'
      USING ERRCODE = '42501',
            HINT = 'Only the linked change, review and remarks can be updated (ISO/IEC 17025 7.5.2, 7.11.2).';
  END IF;

  -- Review is stamped with the signed-in reviewer.
  IF NEW.reviewed_at IS NOT NULL AND OLD.reviewed_at IS NULL THEN
    NEW.reviewed_at := now();
    NEW.reviewed_by := coalesce(v_name, NEW.reviewed_by);
  ELSE
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewed_by := OLD.reviewed_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validation_test_runs_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validation_test_runs_before_write ON public.validation_test_runs;
CREATE TRIGGER trg_validation_test_runs_before_write
  BEFORE INSERT OR UPDATE ON public.validation_test_runs
  FOR EACH ROW EXECUTE FUNCTION public.validation_test_runs_before_write();

CREATE OR REPLACE FUNCTION public.it_incidents_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := auth.uid() IS NOT NULL;
  v_name text := public.app_lims_validation_user_name();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_app OR btrim(coalesce(NEW.incident_no, '')) = '' THEN
      NEW.incident_no := public.app_lims_register_next_no(
        'public.it_incidents'::regclass, 'incident_no', 'ITI', coalesce(NEW.occurred_at, now())::date);
    END IF;
    IF v_app THEN
      NEW.created_by := auth.uid();
      NEW.created_at := now();
      NEW.detected_by := coalesce(nullif(btrim(NEW.detected_by), ''), v_name);
      IF NEW.occurred_at > now() + interval '1 hour' THEN
        RAISE EXCEPTION 'An incident cannot be dated in the future (%).', NEW.occurred_at
          USING ERRCODE = '22007';
      END IF;
    END IF;
  ELSIF v_app AND NEW.incident_no IS DISTINCT FROM OLD.incident_no THEN
    RAISE EXCEPTION 'The incident number cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'closed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'closed') THEN
    NEW.closed_at := coalesce(NEW.closed_at, now());
    IF v_app THEN
      NEW.closed_by := coalesce(v_name, NEW.closed_by);
    END IF;
  ELSIF NEW.status <> 'closed' THEN
    NEW.closed_at := NULL;
    NEW.closed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.it_incidents_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_it_incidents_before_write ON public.it_incidents;
CREATE TRIGGER trg_it_incidents_before_write
  BEFORE INSERT OR UPDATE ON public.it_incidents
  FOR EACH ROW EXECUTE FUNCTION public.it_incidents_before_write();

CREATE OR REPLACE FUNCTION public.backup_restore_tests_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app boolean := auth.uid() IS NOT NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_app OR btrim(coalesce(NEW.test_no, '')) = '' THEN
      NEW.test_no := public.app_lims_register_next_no(
        'public.backup_restore_tests'::regclass, 'test_no', 'BRT', coalesce(NEW.tested_on, current_date));
    END IF;
    IF v_app THEN
      NEW.created_by := auth.uid();
      NEW.created_at := now();
      NEW.performed_by := coalesce(nullif(btrim(NEW.performed_by), ''), public.app_lims_validation_user_name(), '');
      IF NEW.tested_on > current_date + 1 THEN
        RAISE EXCEPTION 'A restore test cannot be dated in the future (%).', NEW.tested_on
          USING ERRCODE = '22007';
      END IF;
    END IF;
  ELSIF v_app AND NEW.test_no IS DISTINCT FROM OLD.test_no THEN
    RAISE EXCEPTION 'The test number cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.backup_restore_tests_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_backup_restore_tests_before_write ON public.backup_restore_tests;
CREATE TRIGGER trg_backup_restore_tests_before_write
  BEFORE INSERT OR UPDATE ON public.backup_restore_tests
  FOR EACH ROW EXECUTE FUNCTION public.backup_restore_tests_before_write();

-- ---------------------------------------------------------------------------
-- 4. Row level security and grants
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['software_changes', 'validation_test_runs', 'it_incidents', 'backup_restore_tests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rel);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_select', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.app_is_known_staff())',
      rel || '_select', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_insert', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.app_lims_validation_can_write())',
      rel || '_insert', rel);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rel || '_update', rel);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.app_lims_validation_can_write()) WITH CHECK (public.app_lims_validation_can_write())',
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

    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', rel);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', rel);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Audit trail (ISO/IEC 17025 7.5). Recreated so a re-run keeps one trigger.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel text;
BEGIN
  IF to_regprocedure('public.write_audit_log()') IS NULL THEN
    RAISE NOTICE 'write_audit_log() missing: LIMS validation registers are not audited yet';
    RETURN;
  END IF;
  FOREACH rel IN ARRAY ARRAY['software_changes', 'validation_test_runs', 'it_incidents', 'backup_restore_tests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', rel || '_audit_log', rel);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel || '_audit_log', rel);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
