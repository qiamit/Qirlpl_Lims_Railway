-- Module access for the Metallurgy & Metallography pages (migration 55,
-- 20261102101700_metallurgy_module.sql; design docs/metallography-module-design.md
-- section 3.2 "Outside the migration"). Every staff member's module access is
-- a list of per-user rules, so a page that is in no one's list opens only for
-- the Laboratory Director. This adds per-user rules for the new pages.
--
-- CONSERVATIVE on purpose (the lab has not yet named who runs metallography,
-- design 3.12 item 3):
--   * Technical Manager and Quality Manager: edit on Analyses, Microscope
--     Calibration (µm/px) and Method Setup; view on the Periodic Table.
--   * Everyone else who already has a rule for Results Under Review
--     (/samples/results-review, view or edit): view on the same four pages,
--     so a reviewer can open an analysis and its calibration.
--   * Nobody else gets anything. Testing engineers who will run analyses get
--     edit on /metallography/analyses only when the lab names them (Lab
--     Settings → Module Access, or a later data fix). Running an analysis is a
--     competence decision (ISO/IEC 17025 6.2), not a default.
--
-- A one-off data fix, not a migration. Run it after migration 55 and after the
-- Director has pressed "Sync module catalog" on
-- /lab-settings/module-access-enforcement, as one transaction, without a
-- signed-in user, staging first:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f 20261103_module_access_metallography.sql
--
-- Only adds rules: a page a user already has a rule for keeps that rule
-- (never lowered or raised). Inactive users and users without any module
-- access rule are left alone. The Director needs no rules. The rules can be
-- changed afterwards in Lab Settings → Module Access as usual. The legacy
-- allowlists (moduleAccess.ts, app_legacy_allowed_paths) are not changed.
-- Safe to run more than once.

DO $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Run this without a signed-in user (psql / Railway console).';
  END IF;
  IF to_regclass('public.metallography_analyses') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 20261102101700_metallurgy_module.sql first.';
  END IF;

  WITH grants(role, module_key, access_level) AS (
    VALUES
    -- Technical Manager / Quality Manager: run, calibrate, set up methods
    ('mgr', '/metallography/analyses', 'edit'),
    ('mgr', '/metallography/scale-calibrations', 'edit'),
    ('mgr', '/metallography/methods', 'edit'),
    ('mgr', '/metallography/periodic-table', 'view'),
    -- Results reviewers: read the analyses behind the results they review
    ('rev', '/metallography/analyses', 'view'),
    ('rev', '/metallography/scale-calibrations', 'view'),
    ('rev', '/metallography/methods', 'view'),
    ('rev', '/metallography/periodic-table', 'view')
  ),
  staff AS (
    SELECT up.id::text AS user_id,
           CASE
             WHEN lower(btrim(coalesce(up.designation, ''))) IN ('technical manager', 'quality manager') THEN 'mgr'
             WHEN EXISTS (
               SELECT 1 FROM public.module_access_rules r
                WHERE r.subject_type = 'user'
                  AND r.subject_key = up.id::text
                  AND r.module_key = '/samples/results-review'
                  AND r.access_level IN ('view', 'edit')
             ) THEN 'rev'
           END AS role
      FROM public.user_profiles up
     WHERE lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
       AND lower(btrim(coalesce(up.designation, ''))) <> 'laboratory director'
       AND EXISTS (SELECT 1 FROM public.module_access_rules r
                    WHERE r.subject_type = 'user' AND r.subject_key = up.id::text)
  )
  INSERT INTO public.module_access_rules (subject_type, subject_key, module_key, access_level)
  SELECT 'user', s.user_id, g.module_key, g.access_level
    FROM staff s JOIN grants g ON g.role = s.role
  ON CONFLICT (subject_type, subject_key, module_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'module access rules added for the metallography pages: %', v_n;
END $$;
