-- User administration and Lab Settings hardening (security plan items
-- S-10 to S-13, S-16 and S-17; audit findings M-2 and the user-management
-- notes).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_laboratory_director,
-- app_is_known_staff, update_team_user) and 20261022120000_security_hardening.sql,
-- while the lab is idle. Safe to re-run.
--
-- What it changes
--   user_profiles_guard_last_director   BEFORE UPDATE OR DELETE trigger on
--                        user_profiles. The last active Laboratory Director
--                        cannot be deactivated, given another designation or
--                        deleted, whoever does it (update_team_user, a direct
--                        REST update, or the functions service delete-user
--                        route, which deletes the profile before the auth
--                        user and so stops there).
--   app_lab_master_option_ok(category, value)
--                        true when value is blank, when the category has no
--                        options yet, or when it matches an option label or
--                        value (case and surrounding spaces ignored).
--   update_team_user(...) same signature and behaviour as before, plus:
--                        designation / department / division must be Lab
--                        Master options (stored as the option label, so a
--                        value slug cannot slip past label-based role checks),
--                        status must be Active or Inactive,
--                        and the last active Director is refused with a clear
--                        message.
--   team_user_has_records(user_id)
--                        Laboratory Director only. true when the user is
--                        referenced by any record (uuid columns named user_id,
--                        *_by, *_by_id, *_user_id, *_employee_id, actor, or a
--                        foreign key to user_profiles / auth.users) or appears
--                        as actor in audit_log. The UI then offers
--                        "Deactivate instead" (ISO/IEC 17025 7.5 / 8.4:
--                        records keep their author).
--   user_admin_audit     view over audit_log for user_profiles and
--                        module_access_rules changes. security_invoker, so the
--                        audit_log RLS (Director only) applies.
--   save_lab_settings(p jsonb)
--                        Laboratory Director only. Writes the core Lab
--                        Settings fields (laboratory details, bank, system)
--                        listed in the function; any other key is refused.
--                        Text values may not contain HTML markup.
--   save_report_templates(p_key text, p jsonb)
--                        Any known staff member. p_key is one of
--                        report_scope_templates, print_settings,
--                        document_templates. The JSON shape is checked
--                        (allowed top-level keys, objects / arrays / scalars
--                        only, depth <= 8, strings <= 20000 characters with no
--                        HTML markup, whole document <= 512 kB).
--   lab_settings         once both RPCs exist: RESTRICTIVE policies make
--                        direct INSERT, UPDATE and DELETE Director only.
--                        Reads are unchanged. Non-directors save templates
--                        through save_report_templates.
--
-- Before this migration the frontend falls back to the old direct writes when
-- the RPCs are missing, so report preparation, print dialogs and quotation
-- templates keep working. User management no longer falls back to direct
-- user_profiles updates: update_team_user is required (it already exists from
-- 20261009063000).

-- ---------------------------------------------------------------------------
-- 1. Last active Laboratory Director guard.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_profile_is_active_director(p_designation text, p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(btrim(coalesce(p_designation, ''))) = 'laboratory director'
     AND lower(btrim(coalesce(p_status, 'active'))) <> 'inactive';
$$;

CREATE OR REPLACE FUNCTION public.user_profiles_guard_last_director()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.app_profile_is_active_director(OLD.designation, OLD.status) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' AND public.app_profile_is_active_director(NEW.designation, NEW.status) THEN
    RETURN NEW;
  END IF;

  -- Serialise concurrent demotions so two directors cannot remove each other.
  PERFORM pg_advisory_xact_lock(hashtext('public.user_profiles.last_director'));

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id <> OLD.id
      AND public.app_profile_is_active_director(up.designation, up.status)
  ) THEN
    RAISE EXCEPTION 'The last active Laboratory Director cannot be deactivated, deleted or given another designation. Appoint another Laboratory Director first.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.user_profiles_guard_last_director() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_guard_last_director ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_last_director
  BEFORE UPDATE OF designation, status OR DELETE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profiles_guard_last_director();

-- ---------------------------------------------------------------------------
-- 2. Lab Master option check (designation / department / division).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_lab_master_option_ok(p_category text, p_value text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    btrim(coalesce(p_value, '')) = ''
    OR NOT EXISTS (
      SELECT 1 FROM public.lab_master_options o WHERE o.category = p_category
    )
    OR EXISTS (
      SELECT 1
      FROM public.lab_master_options o
      WHERE o.category = p_category
        AND (
          lower(btrim(o.label)) = lower(btrim(p_value))
          OR lower(btrim(o.value)) = lower(btrim(p_value))
        )
    );
$$;

REVOKE ALL ON FUNCTION public.app_lab_master_option_ok(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_lab_master_option_ok(text, text) TO authenticated, service_role;

-- The option's label for a value given as label or value slug (so roles that
-- are matched by label, e.g. app_is_known_staff(), keep working). Falls back
-- to the trimmed input when there is no matching option.
CREATE OR REPLACE FUNCTION public.app_lab_master_option_label(p_category text, p_value text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (
      SELECT btrim(o.label)
      FROM public.lab_master_options o
      WHERE o.category = p_category
        AND btrim(coalesce(p_value, '')) <> ''
        AND (
          lower(btrim(o.label)) = lower(btrim(p_value))
          OR lower(btrim(o.value)) = lower(btrim(p_value))
        )
      ORDER BY (lower(btrim(o.label)) = lower(btrim(p_value))) DESC, o.created_at NULLS LAST
      LIMIT 1
    ),
    btrim(p_value)
  );
$$;

REVOKE ALL ON FUNCTION public.app_lab_master_option_label(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_lab_master_option_label(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. update_team_user: option validation, status values, last Director.
-- ---------------------------------------------------------------------------

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
  next_designation text;
  target public.user_profiles%ROWTYPE;
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

  SELECT * INTO target FROM public.user_profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found'
      USING ERRCODE = 'P0002';
  END IF;

  next_status := NULLIF(btrim(coalesce(p_status, '')), '');
  IF next_status IS NOT NULL THEN
    IF lower(next_status) = 'active' THEN
      next_status := 'Active';
    ELSIF lower(next_status) = 'inactive' THEN
      next_status := 'Inactive';
    ELSE
      RAISE EXCEPTION 'Status must be Active or Inactive'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_user_id = auth.uid() AND next_status = 'Inactive' THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  IF NOT public.app_lab_master_option_ok('designation', p_designation) THEN
    RAISE EXCEPTION 'Designation "%" is not a Lab Master option. Add it under Lab Settings first.', btrim(p_designation)
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.app_lab_master_option_ok('department', p_department_name) THEN
    RAISE EXCEPTION 'Department "%" is not a Lab Master option. Add it under Lab Settings first.', btrim(p_department_name)
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.app_lab_master_option_ok('division', p_division) THEN
    RAISE EXCEPTION 'Division "%" is not a Lab Master option. Add it under Lab Settings first.', btrim(p_division)
      USING ERRCODE = '22023';
  END IF;

  next_designation := CASE
    WHEN p_designation IS NULL THEN target.designation
    ELSE public.app_lab_master_option_label('designation', p_designation)
  END;

  IF public.app_profile_is_active_director(target.designation, target.status)
     AND NOT public.app_profile_is_active_director(next_designation, coalesce(next_status, target.status))
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_profiles up
       WHERE up.id <> p_user_id
         AND public.app_profile_is_active_director(up.designation, up.status)
     )
  THEN
    RAISE EXCEPTION 'The last active Laboratory Director cannot be deactivated or given another designation. Appoint another Laboratory Director first.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    mobile = COALESCE(p_mobile, mobile),
    designation = CASE WHEN p_designation IS NULL THEN designation ELSE next_designation END,
    department_name = COALESCE(public.app_lab_master_option_label('department', p_department_name), department_name),
    division = COALESCE(public.app_lab_master_option_label('division', p_division), division),
    status = COALESCE(next_status, status),
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

  IF next_status IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'banned_until'
     )
  THEN
    IF next_status = 'Inactive' THEN
      EXECUTE 'UPDATE auth.users SET banned_until = ''infinity'', updated_at = now() WHERE id = $1' USING p_user_id;
    ELSE
      EXECUTE 'UPDATE auth.users SET banned_until = NULL, updated_at = now() WHERE id = $1' USING p_user_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Does a user have records? (delete only users without any).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.team_user_has_records(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  col record;
  found_row boolean;
BEGIN
  IF NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  FOR col IN
    SELECT DISTINCT c.relname AS table_name, a.attname AS column_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND a.atttypid = 'uuid'::regtype
      AND c.relname NOT IN (
        'user_profiles', 'profiles', 'module_access_rules', 'reminders', 'tasks', 'auth_events'
      )
      AND (
        a.attname IN ('user_id', 'actor')
        OR a.attname ~ '(_by|_by_id|_user_id|_employee_id)$'
        OR EXISTS (
          SELECT 1
          FROM pg_constraint fk
          WHERE fk.contype = 'f'
            AND fk.conrelid = c.oid
            AND a.attnum = ANY (fk.conkey)
            AND fk.confrelid IN (
              SELECT oid FROM pg_class
              WHERE oid = to_regclass('public.user_profiles') OR oid = to_regclass('auth.users')
            )
        )
      )
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = $1)', col.table_name, col.column_name)
      INTO found_row
      USING p_user_id;
    IF found_row THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.team_user_has_records(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_user_has_records(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Director view of user-administration changes (S-12).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE NOTICE 'public.audit_log missing; user_admin_audit view skipped.';
    RETURN;
  END IF;
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE NOTICE 'PostgreSQL < 15 has no security_invoker views; user_admin_audit skipped.';
    RETURN;
  END IF;

  EXECUTE $view$
    CREATE OR REPLACE VIEW public.user_admin_audit
    WITH (security_invoker = true)
    AS
    SELECT
      al.id,
      al.at,
      al.actor,
      coalesce(actor_profile.full_name, '') AS actor_name,
      al.table_name,
      al.row_id,
      al.action,
      al.old_row,
      al.new_row
    FROM public.audit_log al
    LEFT JOIN public.user_profiles actor_profile ON actor_profile.id = al.actor
    WHERE al.table_name IN ('user_profiles', 'module_access_rules')
  $view$;

  REVOKE ALL ON public.user_admin_audit FROM PUBLIC, anon;
  GRANT SELECT ON public.user_admin_audit TO authenticated;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Lab Settings RPCs.
-- ---------------------------------------------------------------------------

-- Same row choice as the frontend: the singleton row, else the newest row,
-- else a new singleton row.
CREATE OR REPLACE FUNCTION public.app_lab_settings_target_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  singleton constant uuid := '00000000-0000-0000-0000-000000000001';
  row_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.lab_settings WHERE id = singleton) THEN
    RETURN singleton;
  END IF;
  SELECT id INTO row_id FROM public.lab_settings ORDER BY created_at DESC NULLS LAST LIMIT 1;
  IF row_id IS NOT NULL THEN
    RETURN row_id;
  END IF;
  INSERT INTO public.lab_settings (id) VALUES (singleton) ON CONFLICT (id) DO NOTHING;
  RETURN singleton;
END;
$$;

REVOKE ALL ON FUNCTION public.app_lab_settings_target_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_text_has_markup(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(p_text, '') ~* '<[a-z!?/][^>]*>|<!--|javascript\s*:';
$$;

GRANT EXECUTE ON FUNCTION public.app_text_has_markup(text) TO authenticated, service_role;

-- Recursive JSON shape check for template documents.
CREATE OR REPLACE FUNCTION public.app_template_json_ok(p jsonb, p_depth integer DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  kind text := jsonb_typeof(p);
  item jsonb;
  k text;
BEGIN
  IF p IS NULL OR p_depth > 8 THEN
    RETURN p IS NULL;
  END IF;
  IF kind = 'object' THEN
    FOR k, item IN SELECT key, value FROM jsonb_each(p) LOOP
      IF length(k) > 100 OR public.app_text_has_markup(k) THEN
        RETURN false;
      END IF;
      IF NOT public.app_template_json_ok(item, p_depth + 1) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  ELSIF kind = 'array' THEN
    IF jsonb_array_length(p) > 500 THEN
      RETURN false;
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p) LOOP
      IF NOT public.app_template_json_ok(item, p_depth + 1) THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  ELSIF kind = 'string' THEN
    RETURN length(p #>> '{}') <= 20000 AND NOT public.app_text_has_markup(p #>> '{}');
  END IF;
  RETURN true; -- number, boolean, null
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_template_json_ok(jsonb, integer) TO authenticated, service_role;

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
    'ai_client_data_mode'
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

CREATE OR REPLACE FUNCTION public.save_report_templates(p_key text, p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  top_keys text[];
  k text;
  v jsonb;
  row_id uuid;
BEGIN
  IF NOT public.app_is_known_staff() THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  top_keys := CASE p_key
    WHEN 'report_scope_templates' THEN ARRAY['nabl', 'non_nabl']
    WHEN 'print_settings' THEN ARRAY['testReport', 'srf']
    WHEN 'document_templates' THEN ARRAY['quotation', 'proformaInvoice', 'invoice', 'creditNote', 'paymentReceipt']
    ELSE NULL
  END;
  IF top_keys IS NULL THEN
    RAISE EXCEPTION 'Unknown template setting "%"', p_key
      USING ERRCODE = '22023';
  END IF;

  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Template settings must be a JSON object'
      USING ERRCODE = '22023';
  END IF;
  IF length(p::text) > 524288 THEN
    RAISE EXCEPTION 'Template settings are too large'
      USING ERRCODE = '22023';
  END IF;

  FOR k, v IN SELECT key, value FROM jsonb_each(p) LOOP
    IF NOT (k = ANY (top_keys)) THEN
      RAISE EXCEPTION 'Unexpected key "%" in %', k, p_key
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v) <> 'object' THEN
      RAISE EXCEPTION '%.% must be an object', p_key, k
        USING ERRCODE = '22023';
    END IF;
    IF p_key = 'report_scope_templates' AND EXISTS (
      SELECT 1 FROM jsonb_each(v) b
      WHERE b.key NOT IN ('headerName', 'footerName', 'termsName', 'watermarkName')
         OR jsonb_typeof(b.value) NOT IN ('string', 'null')
    ) THEN
      RAISE EXCEPTION 'report_scope_templates.% may only hold headerName, footerName, termsName and watermarkName text', k
        USING ERRCODE = '22023';
    END IF;
    IF p_key = 'document_templates' AND EXISTS (
      SELECT 1 FROM jsonb_each(v) b WHERE jsonb_typeof(b.value) IN ('object', 'array')
    ) THEN
      RAISE EXCEPTION 'document_templates.% may only hold plain values', k
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF NOT public.app_template_json_ok(p) THEN
    RAISE EXCEPTION 'Template settings contain HTML, text over 20000 characters or nesting deeper than 8 levels'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lab_settings' AND column_name = p_key
  ) THEN
    RAISE EXCEPTION 'lab_settings.% is not on this database yet', p_key
      USING ERRCODE = '42703';
  END IF;

  row_id := public.app_lab_settings_target_id();
  EXECUTE format('UPDATE public.lab_settings SET %I = $1, updated_at = now() WHERE id = $2', p_key)
    USING p, row_id;

  RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION public.save_report_templates(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_report_templates(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. lab_settings: direct writes are Director only, once the RPCs exist.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.lab_settings') IS NULL THEN
    RETURN;
  END IF;
  IF to_regprocedure('public.app_is_laboratory_director()') IS NULL
     OR to_regprocedure('public.save_lab_settings(jsonb)') IS NULL
     OR to_regprocedure('public.save_report_templates(text, jsonb)') IS NULL
  THEN
    RAISE NOTICE 'Lab Settings RPCs or app_is_laboratory_director() missing; lab_settings left open.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS lims_director_insert ON public.lab_settings;
  DROP POLICY IF EXISTS lims_director_update ON public.lab_settings;
  DROP POLICY IF EXISTS lims_director_delete ON public.lab_settings;

  CREATE POLICY lims_director_insert ON public.lab_settings
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.app_is_laboratory_director());
  CREATE POLICY lims_director_update ON public.lab_settings
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.app_is_laboratory_director())
    WITH CHECK (public.app_is_laboratory_director());
  CREATE POLICY lims_director_delete ON public.lab_settings
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.app_is_laboratory_director());
END $$;

NOTIFY pgrst, 'reload schema';
