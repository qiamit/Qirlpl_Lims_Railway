-- Close privilege escalation found in the 2026-10-09 audit.
-- Any logged-in user could rewrite user_profiles.designation and then pass
-- Laboratory Director checks. Operational tables stay usable by known staff
-- and by people who already have a module-access grant. Unknown designations
-- no longer get the whole database.
-- This file is not applied automatically. Apply it on Railway Postgres only
-- when Amit asks, and only while the lab is idle.

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so policies do not recurse through RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_is_laboratory_director()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.designation, ''))) = 'laboratory director'
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_is_known_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.app_is_laboratory_director()
  OR EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive'
      AND (
        (
          lower(btrim(coalesce(up.department_name, ''))) = 'sample cell'
          AND lower(btrim(coalesce(up.designation, ''))) IN ('receptionist', 'sample incharge')
        )
        OR (
          lower(btrim(coalesce(up.department_name, ''))) IN ('mechanical', 'chemical')
          AND lower(btrim(coalesce(up.designation, ''))) IN ('technical manager', 'testing engineer')
        )
        OR (
          lower(btrim(coalesce(up.department_name, ''))) = 'quality assurance'
          AND lower(btrim(coalesce(up.designation, ''))) = 'quality manager'
        )
        OR EXISTS (
          SELECT 1
          FROM public.module_access_rules r
          WHERE r.access_level IN ('view', 'edit')
            AND (
              (r.subject_type = 'user' AND r.subject_key = auth.uid()::text)
              OR (
                r.subject_type = 'designation'
                AND lower(btrim(r.subject_key)) = lower(btrim(coalesce(up.designation, '')))
                AND btrim(coalesce(up.designation, '')) <> ''
              )
              OR (
                r.subject_type = 'department'
                AND lower(btrim(r.subject_key)) = lower(btrim(coalesce(up.department_name, '')))
                AND btrim(coalesce(up.department_name, '')) <> ''
              )
              OR (
                r.subject_type = 'division'
                AND lower(btrim(r.subject_key)) = lower(btrim(coalesce(up.division, '')))
                AND btrim(coalesce(up.division, '')) <> ''
              )
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.app_profile_privileged_unchanged(
  p_id uuid,
  p_designation text,
  p_status text,
  p_email text,
  p_department text,
  p_division text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles p
    WHERE p.id = p_id
      AND p.designation IS NOT DISTINCT FROM p_designation
      AND p.status IS NOT DISTINCT FROM p_status
      AND p.email IS NOT DISTINCT FROM p_email
      AND p.department_name IS NOT DISTINCT FROM p_department
      AND p.division IS NOT DISTINCT FROM p_division
  );
$$;

REVOKE ALL ON FUNCTION public.app_is_laboratory_director() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_is_active_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_is_known_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_profile_privileged_unchanged(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_laboratory_director() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_known_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_profile_privileged_unchanged(uuid, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- user_profiles: nobody except a Laboratory Director may change designation,
-- status, email, department or division. A user may still edit their own name
-- and mobile.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow update for authenticated" ON public.user_profiles;
DROP POLICY IF EXISTS lims_user_profiles_all ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_select_own_or_staff ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_insert_director ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_director ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_self_safe ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_delete_director ON public.user_profiles;

CREATE POLICY user_profiles_select_own_or_staff
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.app_is_known_staff());

CREATE POLICY user_profiles_insert_director
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.app_is_laboratory_director());

CREATE POLICY user_profiles_update_director
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.app_is_laboratory_director())
  WITH CHECK (public.app_is_laboratory_director());

CREATE POLICY user_profiles_update_self_safe
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() AND NOT public.app_is_laboratory_director())
  WITH CHECK (
    id = auth.uid()
    AND public.app_profile_privileged_unchanged(
      id, designation, status, email, department_name, division
    )
  );

CREATE POLICY user_profiles_delete_director
  ON public.user_profiles
  FOR DELETE
  TO authenticated
  USING (public.app_is_laboratory_director());

-- Inactive users cannot sign in through GoTrue once a director sets status.
CREATE OR REPLACE FUNCTION public.update_team_user(
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_mobile text DEFAULT NULL,
  p_designation text DEFAULT NULL,
  p_department_name text DEFAULT NULL,
  p_division text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_designation text;
  next_email text;
  next_status text;
BEGIN
  SELECT btrim(coalesce(up.designation, ''))
  INTO caller_designation
  FROM public.user_profiles up
  WHERE up.id = auth.uid()
    AND lower(btrim(coalesce(up.status, 'active'))) <> 'inactive';

  IF lower(coalesce(caller_designation, '')) <> 'laboratory director' THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  IF p_user_id = auth.uid() AND lower(btrim(coalesce(p_status, ''))) = 'inactive' THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  UPDATE public.user_profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    mobile = COALESCE(p_mobile, mobile),
    designation = COALESCE(p_designation, designation),
    department_name = COALESCE(p_department_name, department_name),
    division = COALESCE(p_division, division),
    status = COALESCE(p_status, status),
    email = COALESCE(NULLIF(btrim(p_email), ''), email),
    updated_at = now()
  WHERE id = p_user_id;

  next_email := NULLIF(btrim(coalesce(p_email, '')), '');
  IF next_email IS NOT NULL THEN
    UPDATE auth.users
    SET email = next_email, updated_at = now()
    WHERE id = p_user_id;

    UPDATE auth.identities
    SET
      identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', next_email),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  next_status := NULLIF(btrim(coalesce(p_status, '')), '');
  IF next_status IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'banned_until'
     )
  THEN
    IF lower(next_status) = 'inactive' THEN
      UPDATE auth.users SET banned_until = 'infinity', updated_at = now() WHERE id = p_user_id;
    ELSE
      UPDATE auth.users SET banned_until = NULL, updated_at = now() WHERE id = p_user_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Module access matrix: only a Laboratory Director may write it.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS lims_module_access_rules_select ON public.module_access_rules;
DROP POLICY IF EXISTS lims_module_access_rules_insert ON public.module_access_rules;
DROP POLICY IF EXISTS lims_module_access_rules_update ON public.module_access_rules;
DROP POLICY IF EXISTS lims_module_access_rules_delete ON public.module_access_rules;

CREATE POLICY lims_module_access_rules_select
  ON public.module_access_rules
  FOR SELECT
  TO authenticated
  USING (public.app_is_active_user());

CREATE POLICY lims_module_access_rules_insert
  ON public.module_access_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (public.app_is_laboratory_director());

CREATE POLICY lims_module_access_rules_update
  ON public.module_access_rules
  FOR UPDATE
  TO authenticated
  USING (public.app_is_laboratory_director())
  WITH CHECK (public.app_is_laboratory_director());

CREATE POLICY lims_module_access_rules_delete
  ON public.module_access_rules
  FOR DELETE
  TO authenticated
  USING (public.app_is_laboratory_director());

-- ---------------------------------------------------------------------------
-- AI keys never leave the database for the browser role.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_models
  ADD COLUMN IF NOT EXISTS has_api_key boolean
  GENERATED ALWAYS AS (api_key IS NOT NULL AND length(btrim(api_key)) > 0) STORED;

REVOKE SELECT (api_key) ON public.ai_models FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS lims_ai_models_authenticated_all ON public.ai_models;
DROP POLICY IF EXISTS lims_ai_settings_authenticated_all ON public.ai_settings;
DROP POLICY IF EXISTS lims_ai_skills_authenticated_all ON public.ai_skills;

CREATE POLICY lims_ai_models_director_all
  ON public.ai_models
  FOR ALL
  TO authenticated
  USING (public.app_is_laboratory_director())
  WITH CHECK (public.app_is_laboratory_director());

CREATE POLICY lims_ai_settings_select_staff
  ON public.ai_settings
  FOR SELECT
  TO authenticated
  USING (public.app_is_known_staff());

CREATE POLICY lims_ai_settings_write_director
  ON public.ai_settings
  FOR ALL
  TO authenticated
  USING (public.app_is_laboratory_director())
  WITH CHECK (public.app_is_laboratory_director());

CREATE POLICY lims_ai_skills_select_staff
  ON public.ai_skills
  FOR SELECT
  TO authenticated
  USING (public.app_is_known_staff());

CREATE POLICY lims_ai_skills_write_director
  ON public.ai_skills
  FOR ALL
  TO authenticated
  USING (public.app_is_laboratory_director())
  WITH CHECK (public.app_is_laboratory_director());

-- ---------------------------------------------------------------------------
-- Every other public table: a logged-in user with no known role and no
-- module grant cannot read or write. Existing USING (true) policies stay,
-- and this RESTRICTIVE policy is AND-ed with them.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel record;
BEGIN
  FOR rel IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> 'user_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel.relname);
    EXECUTE format(
      'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
      rel.relname
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Issued samples and their parameter results are frozen for everyone except
-- the Laboratory Director.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_issued_sample_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.stage = 'completed' AND NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Issued samples can only be changed by the Laboratory Director'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS samples_guard_issued_update ON public.samples;
CREATE TRIGGER samples_guard_issued_update
  BEFORE UPDATE ON public.samples
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_issued_sample_update();

CREATE OR REPLACE FUNCTION public.guard_issued_parameter_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.app_is_laboratory_director() AND EXISTS (
    SELECT 1
    FROM public.test_allocations ta
    JOIN public.sample_allocations sa ON sa.id = ta.sample_allocation_id
    JOIN public.samples s ON s.id = sa.sample_id
    WHERE ta.id = OLD.test_allocation_id
      AND s.stage = 'completed'
  ) THEN
    RAISE EXCEPTION 'Issued results can only be changed by the Laboratory Director'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tap_guard_issued_update ON public.test_allocation_parameters;
CREATE TRIGGER tap_guard_issued_update
  BEFORE UPDATE ON public.test_allocation_parameters
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_issued_parameter_update();

-- ---------------------------------------------------------------------------
-- Audit trail for the records ISO 17025 expects to be traceable.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  actor uuid,
  table_name text NOT NULL,
  row_id text,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select_director ON public.audit_log;
CREATE POLICY audit_log_select_director
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.app_is_laboratory_director());

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_key text;
  previous_row jsonb;
  next_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    previous_row := to_jsonb(OLD);
    row_key := coalesce(previous_row ->> 'id', '');
  ELSIF TG_OP = 'UPDATE' THEN
    previous_row := to_jsonb(OLD);
    next_row := to_jsonb(NEW);
    row_key := coalesce(next_row ->> 'id', previous_row ->> 'id', '');
    IF previous_row = next_row THEN
      RETURN NEW;
    END IF;
  ELSE
    next_row := to_jsonb(NEW);
    row_key := coalesce(next_row ->> 'id', '');
  END IF;

  IF previous_row ? 'api_key' THEN
    previous_row := previous_row - 'api_key';
  END IF;
  IF next_row ? 'api_key' THEN
    next_row := next_row - 'api_key';
  END IF;

  INSERT INTO public.audit_log (actor, table_name, row_id, action, old_row, new_row)
  VALUES (auth.uid(), TG_TABLE_NAME, row_key, TG_OP, previous_row, next_row);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  rel text;
BEGIN
  FOREACH rel IN ARRAY ARRAY['samples', 'test_allocation_parameters', 'user_profiles', 'module_access_rules']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_log ON public.%I', rel, rel);
    EXECUTE format(
      'CREATE TRIGGER %I_audit_log AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
      rel, rel
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- SRF and NABL ULR cannot be stored twice. If duplicates already exist, the
-- index is skipped and a notice is raised instead of aborting this migration.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS samples_srf_number_uidx
    ON public.samples (lower(btrim(srf_number)))
    WHERE srf_number IS NOT NULL AND btrim(srf_number) <> '';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'samples_srf_number_uidx skipped because duplicate SRF numbers already exist';
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS quotations_number_uidx
    ON public.quotations (lower(btrim(quotation_number)))
    WHERE quotation_number IS NOT NULL AND btrim(quotation_number) <> '';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'quotations_number_uidx skipped because duplicate quotation numbers already exist';
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS samples_nabl_ulr_uidx
    ON public.samples (lower(btrim(test_report_nabl_ulr_number)))
    WHERE test_report_nabl_ulr_number IS NOT NULL AND btrim(test_report_nabl_ulr_number) <> '';
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'samples_nabl_ulr_uidx skipped because duplicate ULR numbers already exist';
END $$;

NOTIFY pgrst, 'reload schema';
