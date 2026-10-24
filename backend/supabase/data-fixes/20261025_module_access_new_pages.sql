-- Module access for the pages the branch adds (QM review on staging, 24 Oct
-- 2026). Every staff member's module access is a list of per-user rules, so
-- a page that is in no one's list opens only for the Laboratory Director:
-- after go-live the Quality Manager would get "Access Denied" on the Audit
-- Trail, Software Changes, Validation Runs, Backup Tests and the other new
-- registers. This adds per-user rules for the new pages by designation.
--
-- A one-off data fix, not a migration. Run it at go-live after the
-- migrations, as one transaction, without a signed-in user:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261025_module_access_new_pages.sql
--
-- Only adds rules: a page a user already has a rule for keeps that rule
-- (never lowered or raised). Inactive users and users without any module
-- access rule (for example the Workshop Incharge) are left alone. The
-- Director needs no rules. The rules can be changed afterwards in Lab
-- Settings → Module Access as usual. Safe to run more than once.
-- (Annual Declarations and My Acknowledgements are open to every signed-in
-- user already.)

DO $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Run this without a signed-in user (psql / Railway console).';
  END IF;

  WITH grants(role, module_key, access_level) AS (
    VALUES
    -- Quality Manager: every new page
    ('qm','/audit-mrm/audit-coverage','edit'), ('qm','/audit-mrm/audit-trail','edit'), ('qm','/audit-mrm/recycle-bin','edit'),
    ('qm','/externally-providers/approved-suppliers','edit'), ('qm','/externally-providers/evaluations','edit'),
    ('qm','/externally-providers/receipt-inspection','edit'), ('qm','/externally-providers/subcontracting','edit'),
    ('qm','/facilities/access-log','edit'), ('qm','/facilities/areas','edit'), ('qm','/facilities/environment-log','edit'),
    ('qm','/facilities/housekeeping','edit'), ('qm','/general-requirements/confidentiality','edit'),
    ('qm','/general-requirements/impartiality','edit'), ('qm','/general-requirements/organisation-chart','edit'),
    ('qm','/masters/decision-rules','edit'), ('qm','/personnel/authorization-matrix','edit'),
    ('qm','/personnel/competence-monitoring','edit'), ('qm','/personnel/competence-requirements','edit'),
    ('qm','/personnel/dossier','edit'), ('qm','/quality/backup-tests','edit'), ('qm','/quality/control-charts','edit'),
    ('qm','/quality/it-incidents','edit'), ('qm','/quality/method-verifications','edit'), ('qm','/quality/pt-participations','edit'),
    ('qm','/quality/pt-plan','edit'), ('qm','/quality/records-retention','edit'), ('qm','/quality/scope-verification-status','edit'),
    ('qm','/quality/software-changes','edit'), ('qm','/quality/validation-runs','edit'), ('qm','/sampling/plans','edit'),
    ('qm','/sampling/records','edit'), ('qm','/training/records','edit'),
    -- Technical Manager: technical registers to work in, quality registers to read
    ('tm','/facilities/areas','edit'), ('tm','/facilities/environment-log','edit'), ('tm','/facilities/housekeeping','edit'),
    ('tm','/facilities/access-log','edit'), ('tm','/quality/control-charts','edit'), ('tm','/quality/method-verifications','edit'),
    ('tm','/quality/pt-plan','edit'), ('tm','/quality/pt-participations','edit'), ('tm','/quality/scope-verification-status','edit'),
    ('tm','/personnel/competence-monitoring','edit'), ('tm','/training/records','edit'),
    ('tm','/externally-providers/receipt-inspection','edit'), ('tm','/sampling/plans','edit'), ('tm','/sampling/records','edit'),
    ('tm','/personnel/authorization-matrix','view'), ('tm','/personnel/competence-requirements','view'), ('tm','/personnel/dossier','view'),
    ('tm','/masters/decision-rules','view'), ('tm','/externally-providers/approved-suppliers','view'),
    ('tm','/externally-providers/evaluations','view'), ('tm','/externally-providers/subcontracting','view'),
    ('tm','/quality/it-incidents','view'), ('tm','/quality/software-changes','view'), ('tm','/quality/records-retention','view'),
    ('tm','/general-requirements/impartiality','view'), ('tm','/general-requirements/confidentiality','view'),
    ('tm','/general-requirements/organisation-chart','view'),
    -- Testing and calibration engineers: daily environment log and control charts; reference pages to read
    ('eng','/facilities/environment-log','edit'), ('eng','/quality/control-charts','edit'),
    ('eng','/facilities/areas','view'), ('eng','/personnel/authorization-matrix','view'), ('eng','/masters/decision-rules','view'),
    ('eng','/training/records','view'), ('eng','/quality/it-incidents','view'), ('eng','/quality/software-changes','view'),
    ('eng','/general-requirements/organisation-chart','view'),
    -- Sample Cell (Receptionist, Sample Incharge)
    ('sc','/facilities/access-log','edit'), ('sc','/masters/decision-rules','view'),
    ('sc','/quality/it-incidents','view'), ('sc','/general-requirements/organisation-chart','view'),
    -- Auditor: read every new page except the Recycle Bin
    ('aud','/audit-mrm/audit-coverage','view'), ('aud','/audit-mrm/audit-trail','view'),
    ('aud','/externally-providers/approved-suppliers','view'), ('aud','/externally-providers/evaluations','view'),
    ('aud','/externally-providers/receipt-inspection','view'), ('aud','/externally-providers/subcontracting','view'),
    ('aud','/facilities/access-log','view'), ('aud','/facilities/areas','view'), ('aud','/facilities/environment-log','view'),
    ('aud','/facilities/housekeeping','view'), ('aud','/general-requirements/confidentiality','view'),
    ('aud','/general-requirements/impartiality','view'), ('aud','/general-requirements/organisation-chart','view'),
    ('aud','/masters/decision-rules','view'), ('aud','/personnel/authorization-matrix','view'),
    ('aud','/personnel/competence-monitoring','view'), ('aud','/personnel/competence-requirements','view'),
    ('aud','/personnel/dossier','view'), ('aud','/quality/backup-tests','view'), ('aud','/quality/control-charts','view'),
    ('aud','/quality/it-incidents','view'), ('aud','/quality/method-verifications','view'), ('aud','/quality/pt-participations','view'),
    ('aud','/quality/pt-plan','view'), ('aud','/quality/records-retention','view'), ('aud','/quality/scope-verification-status','view'),
    ('aud','/quality/software-changes','view'), ('aud','/quality/validation-runs','view'), ('aud','/sampling/plans','view'),
    ('aud','/sampling/records','view'), ('aud','/training/records','view')
  ),
  staff AS (
    SELECT up.id::text AS user_id,
           CASE
             WHEN lower(btrim(up.designation)) = 'quality manager' THEN 'qm'
             WHEN lower(btrim(up.designation)) = 'technical manager' THEN 'tm'
             WHEN lower(btrim(up.designation)) IN ('testing engineer', 'calibration engineer') THEN 'eng'
             WHEN lower(btrim(up.designation)) IN ('receptionist', 'sample incharge') THEN 'sc'
             WHEN lower(btrim(up.designation)) = 'auditor' THEN 'aud'
           END AS role
      FROM public.user_profiles up
     WHERE lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
       AND EXISTS (SELECT 1 FROM public.module_access_rules r
                    WHERE r.subject_type = 'user' AND r.subject_key = up.id::text)
  )
  INSERT INTO public.module_access_rules (subject_type, subject_key, module_key, access_level)
  SELECT 'user', s.user_id, g.module_key, g.access_level
    FROM staff s JOIN grants g ON g.role = s.role
  ON CONFLICT (subject_type, subject_key, module_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'module access rules added for new pages: %', v_n;
END $$;
