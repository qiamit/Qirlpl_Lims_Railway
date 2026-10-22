-- Database-level module access (security finding M-1, plan S-14/S-15,
-- ISO/IEC 17025 7.11.3 a).
--
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- while the lab is idle, after 20261009063000, 20261022120000 and
-- 20261023000001. Every block is idempotent; re-running keeps the current
-- enforcement mode.
--
-- Until now Module Access (none / view / edit per user, designation,
-- department, division) was enforced only by the React app. In the database
-- every "known staff" user could read and write every table. This file:
--
--   1. app_module_level_ctx / app_module_level_for / app_module_level_full:
--      the same decision as resolveModuleAccessLevel() in
--      frontend/src/features/settings/module-access/resolveModuleAccess.ts,
--      including the legacy role allowlists of frontend/src/lib/moduleAccess.ts
--      (used when no saved rule applies), Director = edit, public support
--      paths = view, the CAPA hub and Feedback Evaluation special cases.
--      app_module_level (finance, 20261023000001) is left unchanged.
--      Deliberate differences from the browser: an inactive user, or a login
--      with no user_profiles row, gets 'none' everywhere (the app signs an
--      inactive user out; app_is_known_staff() already refuses both).
--   2. module_access_catalog: the module keys of the sidebar (appNav.ts). The
--      browser uses "is this path a catalog module?" to choose between saved
--      rules and the legacy allowlists, so the database needs the same list.
--      Seeded below; the enforcement page shows drift and lets the Director
--      re-sync it (app_sync_module_access_catalog).
--   3. module_table_map: which module paths give access to which table. Any
--      mapped path is enough. read_requires 'open' keeps reads open to known
--      staff (reference data used by many screens); write_requires 'never'
--      marks a screen that only reads the table. Tables not in the map are
--      not affected at all (lookup/option tables, lab_settings, lab_prefixes,
--      lab_letterheads/documents/accreditations, user_profiles,
--      module_access_rules and audit_log already have their own gates).
--   4. module_access_enforcement (one row): mode 'off' | 'log' |
--      'enforce_writes' | 'enforce'. Default 'log'.
--        off            - nothing is checked.
--        log            - nothing is blocked. Each INSERT/UPDATE/DELETE
--                         statement by a browser user is checked by a
--                         statement trigger and a would-be denial is written
--                         to module_access_denials (one row per user, table
--                         and operation per hour, with a hit counter).
--                         Reads are NOT logged: PostgREST runs GET requests
--                         in read-only transactions and a policy cannot write.
--                         Use app_module_access_dry_run[_summary] for reads.
--        enforce_writes - writes need the mapped level (edit, or view where
--                         write_requires = 'view'); reads stay as today.
--        enforce        - also reads need view on a mapped path.
--      Only the Laboratory Director changes the mode
--      (app_set_module_access_mode). The Director is never restricted.
--      Writes made inside SECURITY DEFINER functions or triggers (RPCs,
--      audit log, cascades) run as the table owner and are not affected.
--   5. RESTRICTIVE policies lims_module_access_{select,insert,update,delete}
--      on every mapped table, calling the STABLE SECURITY DEFINER function
--      app_module_table_check(table, op) once per statement (InitPlan).
--   6. Reports for the Director: app_module_access_dry_run(user),
--      app_module_access_dry_run_summary(), app_module_access_levels(user).
--
-- Roll-out: stay in 'log' for at least 10 working days, review
-- /lab-settings/module-access-enforcement (denials + dry run for every
-- user), fix rules, then 'enforce_writes', then 'enforce'. Back-out at any
-- time: SELECT public.app_set_module_access_mode('off', 'reason');
-- or as owner: UPDATE public.module_access_enforcement SET mode = 'off';

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Small pure helpers (same normalisation as the browser).
-- ---------------------------------------------------------------------------

-- JavaScript String.prototype.trim() + toLowerCase() for ASCII and the usual
-- Unicode spaces.
CREATE OR REPLACE FUNCTION public.app_norm_access_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(regexp_replace(
    COALESCE(p, ''),
    '^[ \t\n\r\f\v ﻿  -     　]+|[ \t\n\r\f\v ﻿  -     　]+$',
    '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.app_js_trim(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(
    COALESCE(p, ''),
    '^[ \t\n\r\f\v ﻿  -     　]+|[ \t\n\r\f\v ﻿  -     　]+$',
    '', 'g');
$$;

-- pathname.replace(/\/+$/, '') || '/'
CREATE OR REPLACE FUNCTION public.app_norm_module_path(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(NULLIF(rtrim(COALESCE(p, ''), '/'), ''), '/');
$$;

-- path === key || path.startsWith(key + '/')   (both already normalised)
CREATE OR REPLACE FUNCTION public.app_path_under(p_path text, p_key text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_path = p_key OR left(p_path, length(p_key) + 1) = p_key || '/';
$$;

-- isPublicSupportPath() in moduleAccess.ts
CREATE OR REPLACE FUNCTION public.app_is_public_support_path(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_path IS NULL OR p_path = '' THEN false ELSE (
    public.app_path_under(public.app_norm_module_path(p_path), '/help')
    OR public.app_path_under(public.app_norm_module_path(p_path), '/contact-us')
    OR public.app_norm_module_path(p_path) IN ('/personnel/declarations', '/management-docs/my-acknowledgements')
  ) END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Legacy role allowlists (frontend/src/lib/moduleAccess.ts).
--    Keep in step with that file; module_access_test.mjs compares them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_legacy_module_role(p_designation text, p_department text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.app_norm_access_key(p_department) = 'sample cell'
     AND public.app_norm_access_key(p_designation) = 'receptionist' THEN 'receptionist'
    WHEN public.app_norm_access_key(p_department) = 'sample cell'
     AND public.app_norm_access_key(p_designation) = 'sample incharge' THEN 'sample_incharge'
    WHEN public.app_norm_access_key(p_department) = 'mechanical'
     AND public.app_norm_access_key(p_designation) = 'technical manager' THEN 'mechanical_technical_manager'
    WHEN public.app_norm_access_key(p_department) = 'chemical'
     AND public.app_norm_access_key(p_designation) = 'technical manager' THEN 'chemical_technical_manager'
    WHEN public.app_norm_access_key(p_department) = 'chemical'
     AND public.app_norm_access_key(p_designation) = 'testing engineer' THEN 'chemical_testing_engineer'
    WHEN public.app_norm_access_key(p_department) = 'mechanical'
     AND public.app_norm_access_key(p_designation) = 'testing engineer' THEN 'mechanical_testing_engineer'
    WHEN public.app_norm_access_key(p_department) = 'quality assurance'
     AND public.app_norm_access_key(p_designation) = 'quality manager' THEN 'quality_assurance_quality_manager'
  END;
$$;

CREATE OR REPLACE FUNCTION public.app_legacy_allowed_paths(p_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_role
    WHEN 'receptionist' THEN ARRAY[
      '/', '/samples/receiving', '/samples/retain-disposed', '/masters/clients', '/masters/is-codes',
      '/masters/nabl-scope', '/calibration/nabl-scope', '/masters/product-services', '/masters/test-parameter']
    WHEN 'sample_incharge' THEN ARRAY[
      '/', '/samples/allocation', '/samples/retain-disposed', '/samples/result-validation', '/masters/is-codes',
      '/masters/consent-letter', '/masters/nabl-scope', '/calibration/nabl-scope', '/masters/product-services',
      '/masters/test-parameter', '/masters/equipment', '/masters/iqc', '/equipment-management/iqc',
      '/calibration/equipments', '/calibration/handling', '/calibration/handling/service-request',
      '/calibration/equipment-for-calibration', '/calibration/masters-for-iqc']
    WHEN 'mechanical_technical_manager' THEN ARRAY[
      '/', '/samples/test-allocation', '/samples/results-review', '/samples/result-validation', '/masters/is-codes',
      '/masters/consent-letter', '/masters/nabl-scope', '/calibration/nabl-scope', '/masters/product-services',
      '/masters/test-parameter', '/masters/equipment', '/masters/iqc', '/equipment-management/iqc',
      '/calibration/equipments', '/calibration/handling']
    WHEN 'chemical_technical_manager' THEN ARRAY[
      '/', '/samples/test-allocation', '/samples/results-review', '/samples/result-validation', '/masters/is-codes',
      '/masters/consent-letter', '/masters/nabl-scope', '/calibration/nabl-scope', '/masters/product-services',
      '/masters/test-parameter', '/masters/equipment', '/masters/iqc', '/equipment-management/iqc',
      '/calibration/equipments', '/calibration/handling']
    WHEN 'chemical_testing_engineer' THEN ARRAY[
      '/', '/samples/under-testing', '/samples/result-validation', '/masters/is-codes', '/masters/nabl-scope',
      '/calibration/nabl-scope', '/masters/product-services', '/masters/equipment', '/masters/iqc',
      '/equipment-management/iqc', '/calibration/equipments', '/calibration/handling']
    WHEN 'mechanical_testing_engineer' THEN ARRAY[
      '/', '/samples/under-testing', '/samples/result-validation', '/masters/is-codes', '/masters/nabl-scope',
      '/calibration/nabl-scope', '/masters/equipment', '/masters/iqc', '/equipment-management/iqc',
      '/calibration/equipments', '/calibration/handling']
    WHEN 'quality_assurance_quality_manager' THEN ARRAY[
      '/', '/samples/report-preparation', '/samples/completed', '/samples/retain-disposed',
      '/samples/result-validation', '/masters/clients', '/masters/is-codes', '/masters/consent-letter',
      '/masters/nabl-scope', '/calibration/nabl-scope', '/masters/test-parameter', '/masters/equipment',
      '/masters/iqc', '/equipment-management/iqc', '/calibration/equipments', '/calibration/handling']
  END;
$$;

-- canAccessPath() in moduleAccess.ts (legacy, used when no saved rule applies).
CREATE OR REPLACE FUNCTION public.app_legacy_can_access_path(p_path text, p_designation text, p_department text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path text := public.app_norm_module_path(p_path);
  v_role text := public.app_legacy_module_role(p_designation, p_department);
  v_allowed text[];
BEGIN
  IF public.app_norm_access_key(p_designation) = 'laboratory director' THEN
    RETURN true;
  END IF;
  IF public.app_is_public_support_path(p_path) THEN
    RETURN true;
  END IF;
  IF public.app_path_under(v_path, '/masters/consent-letter') THEN
    RETURN COALESCE(v_role IN ('chemical_technical_manager', 'mechanical_technical_manager',
                               'sample_incharge', 'quality_assurance_quality_manager'), false);
  END IF;
  IF public.app_path_under(v_path, '/samples/retain-disposed') THEN
    RETURN COALESCE(v_role IN ('receptionist', 'sample_incharge', 'quality_assurance_quality_manager'), false);
  END IF;
  IF public.app_path_under(v_path, '/masters/equipment')
     OR public.app_path_under(v_path, '/calibration/equipment-for-calibration')
     OR public.app_path_under(v_path, '/calibration/masters-for-iqc')
     OR public.app_path_under(v_path, '/masters/iqc')
     OR public.app_path_under(v_path, '/equipment-management/iqc')
     OR public.app_path_under(v_path, '/samples/result-validation') THEN
    RETURN COALESCE(v_role IN ('chemical_testing_engineer', 'chemical_technical_manager',
                               'mechanical_testing_engineer', 'mechanical_technical_manager',
                               'sample_incharge', 'quality_assurance_quality_manager'), false);
  END IF;
  v_allowed := public.app_legacy_allowed_paths(v_role);
  IF v_allowed IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM unnest(v_allowed) AS a(entry)
     WHERE CASE WHEN a.entry = '/' THEN v_path = '/' ELSE public.app_path_under(v_path, a.entry) END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Module catalog (sidebar module keys, appNav.ts flattenNavModules()).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.module_access_catalog (
  module_key text PRIMARY KEY,
  label text NOT NULL DEFAULT '',
  section text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now(),
  synced_by uuid
);

COMMENT ON TABLE public.module_access_catalog IS
  'Module keys of the sidebar (frontend appNav.ts). Paths under a catalog key follow saved Module Access rules; other paths follow the legacy role allowlists, exactly as in the browser.';

ALTER TABLE public.module_access_catalog ENABLE ROW LEVEL SECURITY;

-- Seed only when empty: a re-run must not undo a later sync from the app.
INSERT INTO public.module_access_catalog (module_key, label, section)
SELECT v.module_key, v.label, v.section
  FROM (VALUES
  ('/', 'Dashboard', 'General'),
  ('/management-docs/level-1', 'Level 1 Documents', 'Management Documentation'),
  ('/management-docs/level-2', 'Level 2 Documents', 'Management Documentation'),
  ('/management-docs/level-3', 'Level 3 Documents', 'Management Documentation'),
  ('/management-docs/level-4', 'Level 4 Documents', 'Management Documentation'),
  ('/general-requirements/list-of-objectives', 'List of Objectives', 'Management Documentation'),
  ('/general-requirements/risk-analysis', 'Risk Analysis', 'Management Documentation'),
  ('/general-requirements/improvement', 'Improvement', 'Management Documentation'),
  ('/general-requirements/impartiality', 'Impartiality', 'Management Documentation'),
  ('/general-requirements/confidentiality', 'Confidentiality', 'Management Documentation'),
  ('/audit-mrm/audit-plan', 'Audit Plan', 'Management Documentation'),
  ('/audit-mrm/audit-checklist', 'Audit Checklist', 'Management Documentation'),
  ('/audit-mrm/audit-summary', 'Audit Summary', 'Management Documentation'),
  ('/audit-mrm/non-conformities', 'Non Conformities', 'Management Documentation'),
  ('/audit-mrm/mrm-agenda', 'MRM Agenda', 'Management Documentation'),
  ('/audit-mrm/management-review-meeting', 'Management Review Meeting', 'Management Documentation'),
  ('/audit-mrm/audit-coverage', 'Audit Coverage', 'Management Documentation'),
  ('/audit-mrm/audit-trail', 'Audit Trail', 'Management Documentation'),
  ('/audit-mrm/recycle-bin', 'Recycle Bin', 'Management Documentation'),
  ('/personnel/employees', 'Employee List', 'Management Documentation'),
  ('/personnel/selection', 'Selection', 'Management Documentation'),
  ('/personnel/required-competency-matrix', 'Required Competency Matrix', 'Management Documentation'),
  ('/personnel/actual-competency-matrix', 'Actual Competency Matrix', 'Management Documentation'),
  ('/personnel/roles-responsibilities', 'Roles & Responsibilities', 'Management Documentation'),
  ('/personnel/authorities', 'Authorities', 'Management Documentation'),
  ('/personnel/declarations', 'Annual Declarations', 'Management Documentation'),
  ('/personnel/authorization-matrix', 'Authorization Matrix', 'Management Documentation'),
  ('/personnel/dossier', 'Employee Dossier', 'Management Documentation'),
  ('/personnel/competence-requirements', 'Competence Requirements', 'Management Documentation'),
  ('/personnel/competence-monitoring', 'Competence Monitoring', 'Management Documentation'),
  ('/training/records', 'Training Records', 'Management Documentation'),
  ('/complaints/customer-complaints', 'Customer Complaints', 'Management Documentation'),
  ('/complaints/customer-feedback', 'Customer Feedback', 'Management Documentation'),
  ('/complaints/feedback-evaluation', 'Feedback Evaluation', 'Management Documentation'),
  ('/nonconforming-work/records', 'Nonconforming Work Records', 'Management Documentation'),
  ('/nonconforming-work/evaluation-actions', 'Evaluation & Actions', 'Management Documentation'),
  ('/nonconforming-work/corrective-action', 'Corrective Action (CAPA)', 'Management Documentation'),
  ('/externally-providers/approved-suppliers', 'Approved Supplier List', 'Management Documentation'),
  ('/externally-providers/evaluations', 'Supplier Evaluations', 'Management Documentation'),
  ('/externally-providers/receipt-inspection', 'Receipt Inspection', 'Management Documentation'),
  ('/externally-providers/subcontracting', 'Subcontracting Register', 'Management Documentation'),
  ('/externally-providers/supplier-list', 'Supplier List', 'Management Documentation'),
  ('/externally-providers/supplier-evaluation', 'Supplier Evaluation', 'Management Documentation'),
  ('/externally-providers/list-of-consumables', 'List of Consumables', 'Management Documentation'),
  ('/training/competency-matrix', 'Competency Matrix', 'Management Documentation'),
  ('/training/need-identification', 'Need Identification', 'Management Documentation'),
  ('/training/plan', 'Training Plan', 'Management Documentation'),
  ('/training/calendar', 'Training Calendar', 'Management Documentation'),
  ('/training/register', 'Training Register', 'Management Documentation'),
  ('/training/evaluation', 'Training Evaluation', 'Management Documentation'),
  ('/training/induction', 'Induction Training', 'Management Documentation'),
  ('/training/effectiveness-review', 'Effectiveness Review', 'Management Documentation'),
  ('/calibration/equipment-for-calibration', 'Equipment for Calibration', 'Equipment Management'),
  ('/masters/equipment', 'Equipment Master', 'Equipment Management'),
  ('/equipment-management/iqc', 'Masters for IQC', 'Equipment Management'),
  ('/equipment-management/crm-list', 'CRM List', 'Equipment Management'),
  ('/equipment-management/maintenance-schedule', 'Maintenance Schedule', 'Equipment Management'),
  ('/equipment-management/calibration-schedule', 'Calibration Schedule', 'Equipment Management'),
  ('/equipment-management/breakdown-register', 'Breakdown Register', 'Equipment Management'),
  ('/quality/pt-plan', 'PT Plan (4-year)', 'Quality Assurance'),
  ('/quality/pt-participations', 'PT / ILC Participation', 'Quality Assurance'),
  ('/quality/control-charts', 'Control Charts', 'Quality Assurance'),
  ('/quality/method-verifications', 'Method Verification & Validation', 'Quality Assurance'),
  ('/quality/scope-verification-status', 'Scope Verification Status', 'Quality Assurance'),
  ('/quality/software-changes', 'Software Change Control', 'Quality Assurance'),
  ('/quality/validation-runs', 'LIMS Validation Runs', 'Quality Assurance'),
  ('/quality/it-incidents', 'IT Incidents', 'Quality Assurance'),
  ('/quality/backup-tests', 'Backup Restore Tests', 'Quality Assurance'),
  ('/quality/records-retention', 'Records Retention', 'Quality Assurance'),
  ('/management-docs/my-acknowledgements', 'Documents to Read', 'Quality Assurance'),
  ('/facilities/areas', 'Lab Areas', 'Facilities & Environment'),
  ('/facilities/environment-log', 'Environment Log', 'Facilities & Environment'),
  ('/facilities/access-log', 'Access Log', 'Facilities & Environment'),
  ('/facilities/housekeeping', 'Housekeeping', 'Facilities & Environment'),
  ('/samples/receiving', 'Sample Receiving', 'Testing LIMS'),
  ('/samples/allocation', 'Sample Allocation', 'Testing LIMS'),
  ('/samples/test-allocation', 'Test Allocation', 'Testing LIMS'),
  ('/samples/under-testing', 'Sample Under Testing', 'Testing LIMS'),
  ('/samples/results-review', 'Results Under Review', 'Testing LIMS'),
  ('/samples/report-preparation', 'Test Report Preparation', 'Testing LIMS'),
  ('/samples/completed', 'Completed Results', 'Testing LIMS'),
  ('/samples/retain-disposed', 'Retain & Disposed Sample', 'Testing LIMS'),
  ('/masters/consent-letter', 'Consent Letter', 'Testing LIMS'),
  ('/samples/result-validation/iqc-plan', 'IQC Plan', 'Testing LIMS'),
  ('/samples/result-validation/reference-material-check', 'Reference Material Check', 'Testing LIMS'),
  ('/samples/result-validation/alternate-instrument-check', 'Alternate Instrument Check', 'Testing LIMS'),
  ('/samples/result-validation/functional-check', 'Functional Check', 'Testing LIMS'),
  ('/samples/result-validation/control-chart', 'Control Chart', 'Testing LIMS'),
  ('/samples/result-validation/replicate-check', 'Replicate Check', 'Testing LIMS'),
  ('/samples/result-validation/retesting-check', 'Retesting Check', 'Testing LIMS'),
  ('/samples/result-validation/correlation-check', 'Correlation Check', 'Testing LIMS'),
  ('/samples/result-validation/results-review-check', 'Results Review Check', 'Testing LIMS'),
  ('/samples/result-validation/intralab-check', 'Intralab Check', 'Testing LIMS'),
  ('/samples/result-validation/blind-sampling-check', 'Blind Sampling Check', 'Testing LIMS'),
  ('/masters/nabl-scope', 'NABL Scope', 'Testing LIMS'),
  ('/masters/test-parameter', 'Test Parameter', 'Testing LIMS'),
  ('/calibration/handling/service-request', 'Service Request', 'Calibration LIMS'),
  ('/calibration/handling/job-allocation', 'Job Allocation', 'Calibration LIMS'),
  ('/calibration/handling/calibration-conduct-inside', 'Calibration Conduct (Inside)', 'Calibration LIMS'),
  ('/calibration/handling/calibration-conduct-outside', 'Calibration Conduct (Outside)', 'Calibration LIMS'),
  ('/calibration/handling/review-data', 'Review Data', 'Calibration LIMS'),
  ('/calibration/handling/certificate-preparation', 'Certificate Preparation', 'Calibration LIMS'),
  ('/calibration/equipments', 'Equipments', 'Calibration LIMS'),
  ('/calibration/nabl-scope', 'NABL Scope', 'Calibration LIMS'),
  ('/finance/sale/quotation', 'Quotation', 'Finance Management'),
  ('/finance/sale/proforma-invoice', 'Proforma Invoice', 'Finance Management'),
  ('/finance/sale/invoice', 'Invoice', 'Finance Management'),
  ('/finance/sale/credit-note', 'Credit Note', 'Finance Management'),
  ('/finance/sale/payment-receipt', 'Payment Receipt', 'Finance Management'),
  ('/masters/clients', 'Client Master', 'Master Managements'),
  ('/masters/is-codes', 'IS Code Master', 'Master Managements'),
  ('/masters/product-services', 'Product & Services', 'Master Managements'),
  ('/masters/decision-rules', 'Decision Rules', 'Master Managements')
  ) AS v(module_key, label, section)
 WHERE NOT EXISTS (SELECT 1 FROM public.module_access_catalog);

-- ---------------------------------------------------------------------------
-- 4. The decision (mirror of resolveModuleAccessLevel).
-- ---------------------------------------------------------------------------

-- resolveConfiguredAccessLevel(): NULL when no saved rule applies.
CREATE OR REPLACE FUNCTION public.app_module_configured_level(
  p_user_key text,
  p_designation text,
  p_department text,
  p_division text,
  p_path text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path  text := public.app_norm_module_path(p_path);
  v_type  text;
  v_key   text;
  v_level text;
  v_found boolean;
BEGIN
  IF public.app_norm_access_key(p_designation) = 'laboratory director' THEN
    RETURN 'edit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.module_access_rules) THEN
    RETURN NULL;
  END IF;
  -- pathToModuleKey(): the path must be (under) a catalog module.
  IF v_path <> '/' AND NOT EXISTS (
    SELECT 1 FROM public.module_access_catalog c
     WHERE c.module_key <> '/' AND public.app_path_under(v_path, c.module_key)
  ) THEN
    RETURN NULL;
  END IF;

  FOREACH v_type IN ARRAY ARRAY['user', 'designation', 'department', 'division'] LOOP
    v_key := CASE v_type
      WHEN 'user' THEN public.app_js_trim(p_user_key)
      WHEN 'designation' THEN public.app_norm_access_key(p_designation)
      WHEN 'department' THEN public.app_norm_access_key(p_department)
      ELSE public.app_norm_access_key(p_division)
    END;
    CONTINUE WHEN v_key = '';

    SELECT EXISTS (
      SELECT 1 FROM public.module_access_rules r
       WHERE r.subject_type = v_type
         AND CASE WHEN v_type = 'user' THEN r.subject_key = v_key
                  ELSE public.app_norm_access_key(r.subject_key) = v_key END
    ) INTO v_found;
    CONTINUE WHEN NOT v_found;

    -- resolveLevelFromSubjectRules(): longest matching key wins; on a tie the
    -- first row in the app's fetch order (subject_key, module_key) wins.
    SELECT r.access_level INTO v_level
      FROM public.module_access_rules r
      CROSS JOIN LATERAL (SELECT public.app_norm_module_path(r.module_key) AS k) n
     WHERE r.subject_type = v_type
       AND CASE WHEN v_type = 'user' THEN r.subject_key = v_key
                ELSE public.app_norm_access_key(r.subject_key) = v_key END
       AND CASE WHEN n.k = '/' THEN v_path = '/' ELSE public.app_path_under(v_path, n.k) END
     ORDER BY length(n.k) DESC, r.subject_key, r.module_key
     LIMIT 1;

    IF FOUND THEN
      RETURN v_level;
    END IF;
    RETURN CASE WHEN v_path = '/' THEN 'view' ELSE 'none' END;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_module_single_level(
  p_user_key text, p_designation text, p_department text, p_division text, p_path text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public.app_module_configured_level(p_user_key, p_designation, p_department, p_division, p_path),
    CASE WHEN public.app_legacy_can_access_path(p_path, p_designation, p_department) THEN 'edit' ELSE 'none' END
  );
$$;

CREATE OR REPLACE FUNCTION public.app_module_max_level(a text, b text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN a = 'edit' OR b = 'edit' THEN 'edit'
    WHEN a = 'view' OR b = 'view' THEN 'view'
    ELSE 'none'
  END;
$$;

-- resolveModuleAccessLevel() for an explicit user context.
CREATE OR REPLACE FUNCTION public.app_module_level_ctx(
  p_user_key text, p_designation text, p_department text, p_division text, p_path text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path text := public.app_norm_module_path(p_path);
BEGIN
  IF public.app_norm_access_key(p_designation) = 'laboratory director' THEN
    RETURN 'edit';
  END IF;
  IF public.app_is_public_support_path(p_path) THEN
    RETURN 'view';
  END IF;
  -- Unified CAPA hub: NCW Corrective Action or Audit Non Conformities.
  IF public.app_path_under(v_path, '/nonconforming-work/corrective-action') THEN
    RETURN public.app_module_max_level(
      public.app_module_single_level(p_user_key, p_designation, p_department, p_division, '/nonconforming-work/corrective-action'),
      public.app_module_single_level(p_user_key, p_designation, p_department, p_division, '/audit-mrm/non-conformities'));
  END IF;
  -- Feedback Evaluation also honours the older combined Customer Feedback grant.
  IF public.app_path_under(v_path, '/complaints/feedback-evaluation') THEN
    RETURN public.app_module_max_level(
      public.app_module_single_level(p_user_key, p_designation, p_department, p_division, '/complaints/feedback-evaluation'),
      public.app_module_single_level(p_user_key, p_designation, p_department, p_division, '/complaints/customer-feedback'));
  END IF;
  RETURN public.app_module_single_level(p_user_key, p_designation, p_department, p_division, p_path);
END;
$$;

-- For a stored user. Inactive users and logins without a profile get 'none'.
CREATE OR REPLACE FUNCTION public.app_module_level_for(p_user_id uuid, p_path text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_des text;
  v_dep text;
  v_div text;
  v_st  text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'none';
  END IF;
  SELECT COALESCE(designation, ''), COALESCE(department_name, ''), COALESCE(division, ''),
         lower(btrim(COALESCE(status, 'active')))
    INTO v_des, v_dep, v_div, v_st
    FROM public.user_profiles
   WHERE id = p_user_id;
  IF NOT FOUND OR v_st = 'inactive' THEN
    RETURN 'none';
  END IF;
  RETURN public.app_module_level_ctx(p_user_id::text, v_des, v_dep, v_div, p_path);
END;
$$;

-- For the signed-in user.
CREATE OR REPLACE FUNCTION public.app_module_level_full(p_path text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_module_level_for(auth.uid(), p_path);
$$;

-- ---------------------------------------------------------------------------
-- 5. Table -> module map.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.module_table_map (
  table_name text NOT NULL,
  module_path text NOT NULL,
  write_requires text NOT NULL DEFAULT 'edit'
    CHECK (write_requires IN ('edit', 'view', 'never')),
  read_requires text NOT NULL DEFAULT 'view'
    CHECK (read_requires IN ('view', 'open')),
  source text NOT NULL DEFAULT 'manual',
  note text,
  PRIMARY KEY (table_name, module_path)
);

COMMENT ON TABLE public.module_table_map IS
  'Which module paths give access to a table. Read: view on any mapped path (or any row read_requires=open). Write: edit on a row with write_requires=edit, or view on a row with write_requires=view. Unmapped tables are not restricted by module access.';

ALTER TABLE public.module_table_map ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION pg_temp.mtm_add(p_tables text[], p_paths text[], p_write text, p_read text, p_note text)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.module_table_map (table_name, module_path, write_requires, read_requires, source, note)
  SELECT t, p, p_write, p_read, 'seed:20261029100200', p_note
    FROM unnest(p_tables) AS t, unnest(p_paths) AS p
  ON CONFLICT (table_name, module_path) DO UPDATE
    SET write_requires = CASE
          WHEN module_table_map.write_requires = 'view' OR EXCLUDED.write_requires = 'view' THEN 'view'
          WHEN module_table_map.write_requires = 'edit' OR EXCLUDED.write_requires = 'edit' THEN 'edit'
          ELSE 'never' END,
        read_requires = CASE
          WHEN module_table_map.read_requires = 'open' OR EXCLUDED.read_requires = 'open' THEN 'open'
          ELSE 'view' END;
$$;

DO $$
DECLARE
  -- Path groups (sidebar keys + routes outside the sidebar that render the same screens).
  samples_stages text[] := ARRAY['/samples/receiving', '/samples/allocation', '/samples/test-allocation',
    '/samples/under-testing', '/samples/results-review', '/samples/report-preparation', '/samples/completed',
    '/samples/retain-disposed'];
  result_validation text[] := ARRAY['/samples/result-validation/iqc-plan',
    '/samples/result-validation/reference-material-check', '/samples/result-validation/alternate-instrument-check',
    '/samples/result-validation/functional-check', '/samples/result-validation/control-chart',
    '/samples/result-validation/replicate-check', '/samples/result-validation/retesting-check',
    '/samples/result-validation/correlation-check', '/samples/result-validation/results-review-check',
    '/samples/result-validation/intralab-check', '/samples/result-validation/blind-sampling-check'];
  calibration_handling text[] := ARRAY['/calibration/handling/service-request', '/calibration/handling/job-allocation',
    '/calibration/handling/calibration-conduct-inside', '/calibration/handling/calibration-conduct-outside',
    '/calibration/handling/review-data', '/calibration/handling/certificate-preparation',
    '/calibration/handling/certificates', '/calibration/handling/calibration-conduct'];
  equipment text[] := ARRAY['/masters/equipment', '/calibration/equipments', '/calibration/equipment-for-calibration',
    '/equipment-management/iqc', '/masters/iqc', '/calibration/masters-for-iqc', '/equipment-management/crm-list',
    '/equipment-management/maintenance-schedule', '/equipment-management/calibration-schedule',
    '/equipment-management/breakdown-register'];
  finance text[] := ARRAY['/finance/sale/quotation', '/finance/sale/proforma-invoice', '/finance/sale/invoice',
    '/finance/sale/credit-note', '/finance/sale/payment-receipt'];
  audit text[] := ARRAY['/audit-mrm/audit-plan', '/audit-mrm/audit-checklist', '/audit-mrm/audit-summary',
    '/audit-mrm/non-conformities'];
  mrm text[] := ARRAY['/audit-mrm/mrm-agenda', '/audit-mrm/management-review-meeting'];
  ncw text[] := ARRAY['/nonconforming-work/records', '/nonconforming-work/evaluation-actions',
    '/nonconforming-work/corrective-action'];
  personnel_competence text[] := ARRAY['/personnel/authorization-matrix', '/personnel/dossier',
    '/personnel/competence-requirements', '/personnel/competence-monitoring', '/training/records'];
  compliance_pages text[] := ARRAY['/personnel/employees', '/personnel/selection',
    '/personnel/required-competency-matrix', '/personnel/actual-competency-matrix',
    '/personnel/roles-responsibilities', '/personnel/authorities', '/training/competency-matrix',
    '/training/need-identification', '/training/plan', '/training/calendar', '/training/register',
    '/training/evaluation', '/training/induction', '/training/effectiveness-review',
    '/externally-providers/supplier-list', '/externally-providers/supplier-evaluation',
    '/externally-providers/list-of-consumables'];
  mgmt_docs text[] := ARRAY['/management-docs/level-1', '/management-docs/level-2', '/management-docs/level-3',
    '/management-docs/level-4'];
  facilities text[] := ARRAY['/facilities/areas', '/facilities/environment-log', '/facilities/access-log',
    '/facilities/housekeeping'];
  sample_tables text[] := ARRAY['samples', 'sample_allocations', 'test_allocations', 'test_allocation_parameters',
    'issued_report_archive', 'issued_report_amendments'];
  calibration_tables text[] := ARRAY['calibration_service_requests', 'calibration_jobs',
    'calibration_raw_data_sheets', 'calibration_certificate_amendments'];
  finance_tables text[] := ARRAY['quotations', 'quotation_line_items', 'quotation_notes', 'quotation_remarks',
    'quotation_terms_conditions', 'sale_documents', 'sale_document_signature_defaults', 'document_series'];
BEGIN
  DELETE FROM public.module_table_map WHERE source = 'seed:20261029100200';

  -- Writers first (edit), then read-only screens ('never' never downgrades a writer).
  -- Samples and every sample-handling stage: one family, any stage editor may
  -- write (stages hand records to each other and the referback flow spans them).
  PERFORM pg_temp.mtm_add(sample_tables, samples_stages, 'edit', 'view', 'sample handling stages');
  PERFORM pg_temp.mtm_add(sample_tables, result_validation, 'never', 'view', 'result validation reads results');
  PERFORM pg_temp.mtm_add(sample_tables, ARRAY['/audit-mrm/audit-coverage', '/masters/decision-rules',
    '/quality/control-charts', '/masters/equipment', '/calibration/equipments',
    '/equipment-management/breakdown-register', '/facilities/environment-log'] || mrm,
    'never', 'view', 'reads sample data (traceability, coverage, MRM inputs)');

  -- Calibration LIMS.
  PERFORM pg_temp.mtm_add(calibration_tables, calibration_handling, 'edit', 'view', 'calibration handling');
  PERFORM pg_temp.mtm_add(calibration_tables, ARRAY['/samples/report-preparation',
    '/externally-providers/subcontracting'] || mrm, 'never', 'view', 'reads calibration jobs');

  -- Finance.
  PERFORM pg_temp.mtm_add(finance_tables, finance, 'edit', 'view', 'finance sale documents');

  -- Masters and reference data: reads open to known staff, writes need edit on a writer screen.
  PERFORM pg_temp.mtm_add(ARRAY['clients'], ARRAY['/masters/clients', '/samples/receiving'], 'edit', 'open', 'client master');
  PERFORM pg_temp.mtm_add(ARRAY['is_codes'], ARRAY['/masters/is-codes', '/masters/test-parameter', '/samples/receiving'], 'edit', 'open', 'IS codes');
  PERFORM pg_temp.mtm_add(ARRAY['is_code_files'], ARRAY['/masters/is-codes'], 'edit', 'open', 'IS code files');
  PERFORM pg_temp.mtm_add(ARRAY['test_parameters', 'accreditation_bodies'], ARRAY['/masters/test-parameter'], 'edit', 'open', 'test parameters');
  PERFORM pg_temp.mtm_add(ARRAY['consent_letters'], ARRAY['/masters/consent-letter'], 'edit', 'open', 'consent letters');
  PERFORM pg_temp.mtm_add(ARRAY['decision_rules'], ARRAY['/masters/decision-rules'], 'edit', 'open', 'decision rules');
  PERFORM pg_temp.mtm_add(ARRAY['nabl_scope', 'products_services_master'], ARRAY['/masters/nabl-scope', '/masters/product-services'], 'edit', 'open', 'NABL scope / products');
  PERFORM pg_temp.mtm_add(ARRAY['calibration_nabl_scope'], ARRAY['/calibration/nabl-scope', '/masters/nabl-scope', '/masters/product-services'], 'edit', 'open', 'calibration NABL scope (lookup renames from Product & Services)');
  PERFORM pg_temp.mtm_add(ARRAY['equipment_master', 'equipment_for_calibration', 'iqc_masters',
    'equipment_calibration_history', 'equipment_correction_factors', 'equipment_acceptance', 'equipment_crms',
    'equipment_breakdown_register'], equipment, 'edit', 'open', 'equipment registers');
  PERFORM pg_temp.mtm_add(ARRAY['equipment_for_calibration'], calibration_handling, 'edit', 'open', 'calibration jobs update the unit under calibration');

  -- Result validation (7.7).
  PERFORM pg_temp.mtm_add(ARRAY['result_validity_checks'], result_validation || ARRAY['/quality/control-charts'], 'edit', 'view', 'result validity checks');
  PERFORM pg_temp.mtm_add(ARRAY['iqc_plan_items'], result_validation, 'edit', 'view', 'IQC plan');
  PERFORM pg_temp.mtm_add(ARRAY['result_validity_checks', 'iqc_plan_items'], mrm, 'never', 'view', 'MRM inputs');

  -- Quality assurance registers.
  PERFORM pg_temp.mtm_add(ARRAY['pt_plans'], ARRAY['/quality/pt-plan', '/quality/pt-participations'], 'edit', 'view', 'PT plan');
  PERFORM pg_temp.mtm_add(ARRAY['pt_participations'], ARRAY['/quality/pt-participations', '/quality/pt-plan'], 'edit', 'view', 'PT participations');
  PERFORM pg_temp.mtm_add(ARRAY['pt_participations'], personnel_competence || mrm || ARRAY['/quality/scope-verification-status'], 'never', 'view', 'reads PT results');
  PERFORM pg_temp.mtm_add(ARRAY['method_verifications'], ARRAY['/quality/method-verifications'], 'edit', 'view', 'method verification');
  PERFORM pg_temp.mtm_add(ARRAY['method_verifications'], ARRAY['/quality/scope-verification-status'], 'never', 'view', 'scope verification status');
  PERFORM pg_temp.mtm_add(ARRAY['software_changes', 'validation_test_runs'], ARRAY['/quality/software-changes', '/quality/validation-runs'], 'edit', 'view', 'LIMS validation');
  PERFORM pg_temp.mtm_add(ARRAY['it_incidents'], ARRAY['/quality/it-incidents'], 'edit', 'view', 'IT incidents');
  PERFORM pg_temp.mtm_add(ARRAY['it_incidents'], ARRAY['/quality/backup-tests'], 'never', 'view', 'backup tests link incidents');
  PERFORM pg_temp.mtm_add(ARRAY['backup_restore_tests'], ARRAY['/quality/backup-tests'], 'edit', 'view', 'backup restore tests');
  PERFORM pg_temp.mtm_add(ARRAY['record_retention_rules'], ARRAY['/quality/records-retention'], 'edit', 'view', 'records retention');

  -- Facilities & environment (6.3). Areas and readings are reference data for results.
  PERFORM pg_temp.mtm_add(ARRAY['lab_areas'], ARRAY['/facilities/areas'], 'edit', 'open', 'lab areas');
  PERFORM pg_temp.mtm_add(ARRAY['environment_readings'], ARRAY['/facilities/environment-log'], 'edit', 'open', 'environment log');
  PERFORM pg_temp.mtm_add(ARRAY['area_access_log'], ARRAY['/facilities/access-log'], 'edit', 'view', 'access log');
  PERFORM pg_temp.mtm_add(ARRAY['housekeeping_log'], ARRAY['/facilities/housekeeping'], 'edit', 'view', 'housekeeping');

  -- Nonconforming work and CAPA. NCs are also raised from other modules.
  PERFORM pg_temp.mtm_add(ARRAY['nc_work_records'], ncw || ARRAY['/facilities/environment-log',
    '/quality/pt-participations', '/quality/control-charts', '/quality/it-incidents',
    '/equipment-management/breakdown-register'], 'edit', 'view', 'NC records (raised from several modules)');
  PERFORM pg_temp.mtm_add(ARRAY['nc_work_corrective_actions'], ncw, 'edit', 'view', 'NC corrective actions');
  PERFORM pg_temp.mtm_add(ARRAY['nc_work_records', 'nc_work_corrective_actions'], mrm, 'never', 'view', 'MRM inputs');

  -- Internal audit and management review.
  PERFORM pg_temp.mtm_add(ARRAY['audit_plans', 'audit_checklist_items', 'audit_nc_actions'],
    audit || ARRAY['/nonconforming-work/corrective-action'], 'edit', 'view', 'internal audit');
  PERFORM pg_temp.mtm_add(ARRAY['audit_plans', 'audit_checklist_items', 'audit_nc_actions'],
    mrm || ARRAY['/audit-mrm/audit-coverage'], 'never', 'view', 'audit coverage / MRM inputs');
  PERFORM pg_temp.mtm_add(ARRAY['mrm_plans', 'mrm_plan_recipients', 'mrm_agenda_items', 'mrm_meetings',
    'mrm_meeting_attendance', 'mrm_meeting_inputs', 'mrm_meeting_outputs', 'mrm_actions'], mrm, 'edit', 'view', 'management review');

  -- General requirements registers.
  PERFORM pg_temp.mtm_add(ARRAY['gr_objectives'], ARRAY['/general-requirements/list-of-objectives'], 'edit', 'view', 'objectives');
  PERFORM pg_temp.mtm_add(ARRAY['gr_confidentiality_records'], ARRAY['/general-requirements/confidentiality'], 'edit', 'view', 'confidentiality');
  PERFORM pg_temp.mtm_add(ARRAY['gr_impartiality_risks'], ARRAY['/general-requirements/impartiality'], 'edit', 'view', 'impartiality risks');
  PERFORM pg_temp.mtm_add(ARRAY['gr_impartiality_risks'], ARRAY['/general-requirements/risk-analysis'], 'never', 'view', 'risk heat map');
  PERFORM pg_temp.mtm_add(ARRAY['gr_risk_opportunities'], ARRAY['/general-requirements/risk-analysis'], 'edit', 'view', 'risks and opportunities');
  PERFORM pg_temp.mtm_add(ARRAY['gr_improvements'], ARRAY['/general-requirements/improvement'], 'edit', 'view', 'improvements');
  PERFORM pg_temp.mtm_add(ARRAY['gr_objectives', 'gr_impartiality_risks', 'gr_risk_opportunities', 'gr_improvements'], mrm, 'never', 'view', 'MRM inputs');

  -- Complaints and feedback.
  PERFORM pg_temp.mtm_add(ARRAY['customer_complaints'], ARRAY['/complaints/customer-complaints'], 'edit', 'view', 'complaints');
  PERFORM pg_temp.mtm_add(ARRAY['customer_complaints'], mrm, 'never', 'view', 'MRM inputs');
  PERFORM pg_temp.mtm_add(ARRAY['customer_feedback'], ARRAY['/complaints/customer-feedback', '/complaints/feedback-evaluation'], 'edit', 'view', 'customer feedback');

  -- Management documents: everyone reads (Documents to Read); acknowledging needs only view.
  PERFORM pg_temp.mtm_add(ARRAY['management_documents', 'management_document_versions'], mgmt_docs, 'edit', 'open', 'controlled documents');
  PERFORM pg_temp.mtm_add(ARRAY['management_document_acknowledgements'], mgmt_docs, 'edit', 'open', 'document acknowledgements');
  PERFORM pg_temp.mtm_add(ARRAY['management_document_acknowledgements'], ARRAY['/management-docs/my-acknowledgements'], 'view', 'open', 'every employee acknowledges');

  -- Compliance registers (personnel, training, supplier lists share one table).
  PERFORM pg_temp.mtm_add(ARRAY['compliance_registers'], compliance_pages, 'edit', 'view', 'compliance registers');

  -- Personnel competence (6.2). Authorization exceptions are recorded from result entry and calibration.
  PERFORM pg_temp.mtm_add(ARRAY['competence_requirements', 'competence_monitoring', 'personnel_authorizations',
    'personnel_qualifications', 'training_records', 'training_attendees'], personnel_competence, 'edit', 'view', 'personnel competence');
  PERFORM pg_temp.mtm_add(ARRAY['personnel_authorizations'], ARRAY['/audit-mrm/audit-coverage'], 'never', 'view', 'audit coverage');
  PERFORM pg_temp.mtm_add(ARRAY['authorization_exceptions'], personnel_competence || samples_stages || calibration_handling, 'edit', 'view', 'authorization exceptions');

  -- Suppliers (6.6). Approved supplier ids are looked up by other screens.
  PERFORM pg_temp.mtm_add(ARRAY['supplier_approvals'], ARRAY['/externally-providers/approved-suppliers'], 'edit', 'open', 'approved suppliers');
  PERFORM pg_temp.mtm_add(ARRAY['supplier_evaluations', 'supplier_criteria_templates'], ARRAY['/externally-providers/evaluations'], 'edit', 'view', 'supplier evaluations');
  PERFORM pg_temp.mtm_add(ARRAY['receipt_inspections'], ARRAY['/externally-providers/receipt-inspection'], 'edit', 'view', 'receipt inspection');
  PERFORM pg_temp.mtm_add(ARRAY['subcontracting_register'], ARRAY['/externally-providers/subcontracting'], 'edit', 'view', 'subcontracting');

  -- AI settings (Director route). The assistant reads settings and skills.
  PERFORM pg_temp.mtm_add(ARRAY['ai_models'], ARRAY['/lab-settings/ai-settings'], 'edit', 'view', 'AI models');
  PERFORM pg_temp.mtm_add(ARRAY['ai_settings', 'ai_skills'], ARRAY['/lab-settings/ai-settings'], 'edit', 'open', 'AI settings');
END $$;

DROP FUNCTION IF EXISTS pg_temp.mtm_add(text[], text[], text, text, text);

-- ---------------------------------------------------------------------------
-- 6. Enforcement setting, denial log, mode history.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.module_access_enforcement (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  mode text NOT NULL DEFAULT 'log' CHECK (mode IN ('off', 'log', 'enforce_writes', 'enforce')),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  reason text
);

INSERT INTO public.module_access_enforcement (id, mode, reason)
VALUES (true, 'log', 'Initial roll-out: log would-be denials only')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.module_access_enforcement ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.module_access_mode_history (
  id bigserial PRIMARY KEY,
  old_mode text,
  new_mode text NOT NULL,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.module_access_mode_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.module_access_denials (
  id bigserial PRIMARY KEY,
  user_id uuid,
  table_name text NOT NULL,
  op text NOT NULL,
  mode text NOT NULL,
  paths text[] NOT NULL DEFAULT '{}',
  levels jsonb NOT NULL DEFAULT '{}'::jsonb,
  bucket timestamptz NOT NULL,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 1,
  CONSTRAINT module_access_denials_bucket_uq UNIQUE (user_id, table_name, op, bucket)
);

CREATE INDEX IF NOT EXISTS module_access_denials_last_idx ON public.module_access_denials (last_at DESC);
CREATE INDEX IF NOT EXISTS module_access_denials_bucket_idx ON public.module_access_denials (bucket);

COMMENT ON TABLE public.module_access_denials IS
  'Would-be module-access denials of INSERT/UPDATE/DELETE statements (one row per user, table, op and hour). Reads are not logged.';

ALTER TABLE public.module_access_denials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.app_module_access_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT mode FROM public.module_access_enforcement WHERE id), 'log');
$$;

-- ---------------------------------------------------------------------------
-- 7. Table decision and policy check.
-- ---------------------------------------------------------------------------

-- Pure decision for a user (no mode): may p_user_id do p_op on p_table?
CREATE OR REPLACE FUNCTION public.app_module_table_decision(p_user_id uuid, p_table text, p_op text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_des text;
  v_dep text;
  v_div text;
  v_st  text;
  v_op  text := lower(COALESCE(p_op, ''));
  r     record;
  v_lvl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.module_table_map m WHERE m.table_name = p_table) THEN
    RETURN true;
  END IF;
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT COALESCE(designation, ''), COALESCE(department_name, ''), COALESCE(division, ''),
         lower(btrim(COALESCE(status, 'active')))
    INTO v_des, v_dep, v_div, v_st
    FROM public.user_profiles WHERE id = p_user_id;
  IF NOT FOUND OR v_st = 'inactive' THEN
    RETURN false;
  END IF;
  IF public.app_norm_access_key(v_des) = 'laboratory director' THEN
    RETURN true;
  END IF;

  IF v_op = 'select' THEN
    IF EXISTS (SELECT 1 FROM public.module_table_map m WHERE m.table_name = p_table AND m.read_requires = 'open') THEN
      RETURN true;
    END IF;
    FOR r IN SELECT m.module_path FROM public.module_table_map m WHERE m.table_name = p_table LOOP
      v_lvl := public.app_module_level_ctx(p_user_id::text, v_des, v_dep, v_div, r.module_path);
      IF v_lvl IN ('view', 'edit') THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;

  FOR r IN SELECT m.module_path, m.write_requires FROM public.module_table_map m
            WHERE m.table_name = p_table AND m.write_requires <> 'never' LOOP
    v_lvl := public.app_module_level_ctx(p_user_id::text, v_des, v_dep, v_div, r.module_path);
    IF v_lvl = 'edit' OR (r.write_requires = 'view' AND v_lvl = 'view') THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- Used by the RESTRICTIVE policies, once per statement.
CREATE OR REPLACE FUNCTION public.app_module_table_check(p_table text, p_op text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text;
BEGIN
  v_mode := public.app_module_access_mode();
  IF v_mode IN ('off', 'log') THEN
    RETURN true;
  END IF;
  IF v_mode = 'enforce_writes' AND lower(p_op) = 'select' THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN true; -- not a browser user; the table's other policies decide
  END IF;
  RETURN public.app_module_table_decision(auth.uid(), p_table, p_op);
EXCEPTION WHEN OTHERS THEN
  -- Never lock the Director out because of an unexpected error.
  RETURN public.app_is_laboratory_director();
END;
$$;

-- Path -> level for one user and table (for the denial log and dry run).
CREATE OR REPLACE FUNCTION public.app_module_table_levels(p_user_id uuid, p_table text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(m.module_path, public.app_module_level_for(p_user_id, m.module_path)), '{}'::jsonb)
    FROM public.module_table_map m
   WHERE m.table_name = p_table;
$$;

-- Records a would-be write denial for the signed-in user (throttled to one
-- row per user, table, operation and hour). Called by the statement trigger
-- below; harmless if called directly (it only logs real denials of the caller).
CREATE OR REPLACE FUNCTION public.app_module_access_note_write(p_table text, p_op text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_mode   text;
  v_op     text := lower(COALESCE(p_op, ''));
  v_bucket timestamptz := date_trunc('hour', now());
  v_new    boolean;
BEGIN
  IF v_uid IS NULL OR v_op NOT IN ('insert', 'update', 'delete') THEN
    RETURN;
  END IF;
  v_mode := public.app_module_access_mode();
  IF v_mode = 'off' THEN
    RETURN;
  END IF;
  IF public.app_module_table_decision(v_uid, p_table, v_op) THEN
    RETURN;
  END IF;
  INSERT INTO public.module_access_denials AS d (user_id, table_name, op, mode, paths, levels, bucket)
  VALUES (
    v_uid, p_table, v_op, v_mode,
    COALESCE((SELECT array_agg(m.module_path ORDER BY m.module_path) FROM public.module_table_map m
               WHERE m.table_name = p_table AND m.write_requires <> 'never'), '{}'),
    public.app_module_table_levels(v_uid, p_table),
    v_bucket)
  ON CONFLICT (user_id, table_name, op, bucket)
    DO UPDATE SET hits = d.hits + 1, last_at = now(), mode = EXCLUDED.mode
  RETURNING (xmax = 0) INTO v_new;
  IF v_new THEN
    DELETE FROM public.module_access_denials WHERE bucket < now() - interval '180 days';
  END IF;
END;
$$;

-- Statement trigger (SECURITY INVOKER on purpose: current_user is then the
-- role that runs the statement). Only statements subject to RLS as the
-- browser role are checked; SECURITY DEFINER functions, triggers and FK
-- cascades run as the table owner and are skipped. Never raises.
CREATE OR REPLACE FUNCTION public.app_module_access_log_stmt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public.app_module_access_note_write(TG_TABLE_NAME, TG_OP);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'module access log skipped on %: %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Install policies and log triggers on every mapped table.
--    Re-run after adding rows to module_table_map for a new table:
--      SELECT * FROM public.app_module_access_install();   (as owner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_module_access_install()
RETURNS TABLE (table_name text, status text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  t text;
  v_rls boolean;
BEGIN
  FOR t IN SELECT DISTINCT m.table_name FROM public.module_table_map m ORDER BY 1 LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      table_name := t; status := 'skipped: table missing'; RETURN NEXT; CONTINUE;
    END IF;
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', t));
    IF NOT v_rls THEN
      table_name := t; status := 'skipped: RLS is off (enable RLS first)'; RETURN NEXT; CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY lims_module_access_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated '
      'USING ((SELECT public.app_module_table_check(%L, ''select'')))', t, t);
    EXECUTE format(
      'CREATE POLICY lims_module_access_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
      'WITH CHECK ((SELECT public.app_module_table_check(%L, ''insert'')))', t, t);
    EXECUTE format(
      'CREATE POLICY lims_module_access_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING ((SELECT public.app_module_table_check(%L, ''update''))) '
      'WITH CHECK ((SELECT public.app_module_table_check(%L, ''update'')))', t, t, t);
    EXECUTE format(
      'CREATE POLICY lims_module_access_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      'USING ((SELECT public.app_module_table_check(%L, ''delete'')))', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS lims_module_access_log ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER lims_module_access_log BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.app_module_access_log_stmt()', t);
    table_name := t; status := 'installed'; RETURN NEXT;
  END LOOP;
END;
$$;

-- Removes everything installed above (emergency back-out without dropping data).
CREATE OR REPLACE FUNCTION public.app_module_access_uninstall()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  t text;
  n integer := 0;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
            WHERE s.nspname = 'public' AND c.relkind IN ('r', 'p') LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_delete ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS lims_module_access_log ON public.%I', t);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

SELECT count(*) FILTER (WHERE status = 'installed') AS installed,
       count(*) FILTER (WHERE status <> 'installed') AS skipped
  FROM public.app_module_access_install();

-- ---------------------------------------------------------------------------
-- 9. Director RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_set_module_access_mode(p_mode text, p_reason text DEFAULT NULL)
RETURNS public.module_access_enforcement
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old text;
  v_row public.module_access_enforcement;
BEGIN
  IF NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can change module access enforcement.' USING ERRCODE = '42501';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('off', 'log', 'enforce_writes', 'enforce') THEN
    RAISE EXCEPTION 'Mode must be off, log, enforce_writes or enforce.' USING ERRCODE = '22023';
  END IF;
  IF p_mode IN ('off', 'enforce_writes', 'enforce') AND length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Give a reason (at least 5 characters) for this change.' USING ERRCODE = '22023';
  END IF;
  SELECT mode INTO v_old FROM public.module_access_enforcement WHERE id;
  INSERT INTO public.module_access_enforcement (id, mode, changed_at, changed_by, reason)
  VALUES (true, p_mode, now(), auth.uid(), NULLIF(btrim(COALESCE(p_reason, '')), ''))
  ON CONFLICT (id) DO UPDATE
    SET mode = EXCLUDED.mode, changed_at = EXCLUDED.changed_at,
        changed_by = EXCLUDED.changed_by, reason = EXCLUDED.reason
  RETURNING * INTO v_row;
  INSERT INTO public.module_access_mode_history (old_mode, new_mode, reason, changed_by)
  VALUES (v_old, p_mode, v_row.reason, auth.uid());
  RETURN v_row;
END;
$$;

-- Per mapped table: what this user could do under 'enforce'.
CREATE OR REPLACE FUNCTION public.app_module_access_dry_run(p_user_id uuid)
RETURNS TABLE (
  table_name text,
  can_view boolean,
  can_edit boolean,
  read_open boolean,
  view_paths text[],
  edit_paths text[],
  mapped_paths text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.app_is_laboratory_director() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can run the dry run for another user.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH lv AS (
    SELECT m.table_name AS t, m.module_path AS p, m.write_requires AS w, m.read_requires AS r,
           public.app_module_level_for(p_user_id, m.module_path) AS lvl
      FROM public.module_table_map m
  )
  SELECT lv.t,
         public.app_module_table_decision(p_user_id, lv.t, 'select'),
         public.app_module_table_decision(p_user_id, lv.t, 'update'),
         bool_or(lv.r = 'open'),
         COALESCE(array_agg(lv.p ORDER BY lv.p) FILTER (WHERE lv.lvl IN ('view', 'edit')), '{}'),
         COALESCE(array_agg(lv.p ORDER BY lv.p) FILTER (WHERE lv.w <> 'never' AND
           (lv.lvl = 'edit' OR (lv.w = 'view' AND lv.lvl = 'view'))), '{}'),
         array_agg(lv.p ORDER BY lv.p)
    FROM lv
   GROUP BY lv.t
   ORDER BY lv.t;
END;
$$;

-- One line per active user: how many mapped tables they would lose.
CREATE OR REPLACE FUNCTION public.app_module_access_dry_run_summary()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  designation text,
  department_name text,
  has_user_rules boolean,
  tables_mapped integer,
  tables_no_view integer,
  tables_no_edit integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can run the dry run.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH tabs AS (SELECT DISTINCT m.table_name AS t FROM public.module_table_map m),
  users AS (
    SELECT up.id, up.full_name, up.designation, up.department_name
      FROM public.user_profiles up
     WHERE lower(btrim(COALESCE(up.status, 'active'))) <> 'inactive'
  )
  SELECT u.id, u.full_name::text, u.designation::text, u.department_name::text,
         EXISTS (SELECT 1 FROM public.module_access_rules r WHERE r.subject_type = 'user' AND r.subject_key = u.id::text),
         (SELECT count(*)::int FROM tabs),
         (SELECT count(*)::int FROM tabs WHERE NOT public.app_module_table_decision(u.id, tabs.t, 'select')),
         (SELECT count(*)::int FROM tabs WHERE NOT public.app_module_table_decision(u.id, tabs.t, 'update'))
    FROM users u
   ORDER BY u.full_name;
END;
$$;

-- Database decision for every catalog key and mapped path (the page compares
-- it with the browser's resolveModuleAccessLevel for the same user).
CREATE OR REPLACE FUNCTION public.app_module_access_levels(p_user_id uuid)
RETURNS TABLE (module_path text, level text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.app_is_laboratory_director() AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can read another user''s access levels.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.k, public.app_module_level_for(p_user_id, p.k)
    FROM (SELECT c.module_key AS k FROM public.module_access_catalog c
          UNION SELECT m.module_path FROM public.module_table_map m) p
   ORDER BY p.k;
END;
$$;

-- Replace the catalog with the app's current sidebar keys.
CREATE OR REPLACE FUNCTION public.app_sync_module_access_catalog(p_entries jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Only the Laboratory Director can sync the module catalog.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) < 20 THEN
    RAISE EXCEPTION 'Catalog looks incomplete (need at least 20 modules).' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_entries) e WHERE e->>'key' = '/') THEN
    RAISE EXCEPTION 'Catalog must contain the dashboard key /.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.module_access_catalog c
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_entries) e WHERE e->>'key' = c.module_key);
  INSERT INTO public.module_access_catalog (module_key, label, section, synced_at, synced_by)
  SELECT DISTINCT ON (e->>'key') e->>'key', COALESCE(e->>'label', ''), COALESCE(e->>'section', ''), now(), auth.uid()
    FROM jsonb_array_elements(p_entries) e
   WHERE COALESCE(e->>'key', '') <> ''
  ON CONFLICT (module_key) DO UPDATE
    SET label = EXCLUDED.label, section = EXCLUDED.section, synced_at = EXCLUDED.synced_at, synced_by = EXCLUDED.synced_by;
  SELECT count(*)::int INTO v_n FROM public.module_access_catalog;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Policies on the new tables and grants.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['module_access_catalog', 'module_table_map', 'module_access_enforcement',
                           'module_access_mode_history', 'module_access_denials']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_module_access_meta_select ON public.%I', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Catalog, map and mode are not secret: any active user may read them.
CREATE POLICY lims_module_access_meta_select ON public.module_access_catalog
  FOR SELECT TO authenticated USING (public.app_is_active_user());
CREATE POLICY lims_module_access_meta_select ON public.module_table_map
  FOR SELECT TO authenticated USING (public.app_is_active_user());
CREATE POLICY lims_module_access_meta_select ON public.module_access_enforcement
  FOR SELECT TO authenticated USING (public.app_is_active_user());
-- Denials and mode history: Director only. No direct writes for anyone.
CREATE POLICY lims_module_access_meta_select ON public.module_access_mode_history
  FOR SELECT TO authenticated USING (public.app_is_laboratory_director());
CREATE POLICY lims_module_access_meta_select ON public.module_access_denials
  FOR SELECT TO authenticated USING (public.app_is_laboratory_director());

REVOKE ALL ON FUNCTION public.app_norm_access_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_js_trim(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_norm_module_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_path_under(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_is_public_support_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_legacy_module_role(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_legacy_allowed_paths(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_legacy_can_access_path(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_configured_level(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_module_single_level(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_module_max_level(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_level_ctx(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_module_level_for(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_module_level_full(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_access_mode() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_table_decision(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_module_table_check(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_table_levels(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_module_access_log_stmt() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_access_note_write(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_access_install() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_module_access_uninstall() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_set_module_access_mode(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_access_dry_run(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_access_dry_run_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_access_levels(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_sync_module_access_catalog(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.app_norm_access_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_js_trim(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_norm_module_path(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_path_under(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_is_public_support_path(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_legacy_module_role(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_legacy_allowed_paths(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_legacy_can_access_path(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_max_level(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_configured_level(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_module_single_level(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_module_level_ctx(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_module_level_for(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_module_level_full(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_access_mode() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_table_decision(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_module_table_check(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_table_levels(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_module_access_log_stmt() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_access_note_write(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_set_module_access_mode(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_module_access_dry_run(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_access_dry_run_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_access_levels(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_sync_module_access_catalog(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
