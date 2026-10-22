-- Finance port, Phase 1a: module-access checks the database can enforce.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261022000000 and 20261022120000, while the lab is idle.
--
-- Ported from Consultancy Pro (s4_masters_settings_rls.sql) and adapted to the
-- LIMS rules in frontend/src/features/settings/module-access/resolveModuleAccess.ts:
--   * Laboratory Director (active) gets 'edit' everywhere.
--   * Otherwise the first subject type with any saved rule decides, in the
--     order user → designation → department → division. Within it the
--     longest matching module_key wins; no match means 'none' (the dashboard
--     '/' stays 'view').
--   * When no subject has any rule, the UI falls back to the fixed role
--     allowlists in frontend/src/lib/moduleAccess.ts. None of those lists
--     contains a /finance path, so for finance that fallback is 'none'.
--     These helpers return 'none' there as well: they are meant for finance
--     (and other modules missing from the legacy allowlists) only.
--
-- Nothing here changes an existing policy. Phase 1b (document series) and
-- the later finance tables use these helpers.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.app_is_admin()
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

CREATE OR REPLACE FUNCTION public.app_module_level(p_path text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_path  text := COALESCE(NULLIF(rtrim(btrim(COALESCE(p_path, '')), '/'), ''), '/');
  v_des   text;
  v_dep   text;
  v_div   text;
  v_st    text;
  v_type  text;
  v_key   text;
  v_level text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'none';
  END IF;

  SELECT lower(btrim(COALESCE(designation, ''))),
         lower(btrim(COALESCE(department_name, ''))),
         lower(btrim(COALESCE(division, ''))),
         lower(btrim(COALESCE(status, 'active')))
    INTO v_des, v_dep, v_div, v_st
    FROM public.user_profiles
   WHERE id = v_uid;
  IF NOT FOUND OR v_st = 'inactive' THEN
    RETURN 'none';
  END IF;
  IF v_des = 'laboratory director' THEN
    RETURN 'edit';
  END IF;

  FOREACH v_type IN ARRAY ARRAY['user', 'designation', 'department', 'division'] LOOP
    v_key := CASE v_type
      WHEN 'user' THEN v_uid::text
      WHEN 'designation' THEN v_des
      WHEN 'department' THEN v_dep
      ELSE v_div
    END;
    CONTINUE WHEN v_key = '';
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM public.module_access_rules r
       WHERE r.subject_type = v_type
         AND CASE WHEN v_type = 'user' THEN btrim(r.subject_key) = v_key
                  ELSE lower(btrim(r.subject_key)) = v_key END
    );

    SELECT lower(btrim(r.access_level)) INTO v_level
      FROM public.module_access_rules r
      CROSS JOIN LATERAL (
        SELECT COALESCE(NULLIF(rtrim(btrim(r.module_key), '/'), ''), '/') AS k
      ) n
     WHERE r.subject_type = v_type
       AND CASE WHEN v_type = 'user' THEN btrim(r.subject_key) = v_key
                ELSE lower(btrim(r.subject_key)) = v_key END
       AND CASE WHEN n.k = '/' THEN v_path = '/'
                ELSE v_path = n.k OR left(v_path, length(n.k) + 1) = n.k || '/' END
     ORDER BY length(n.k) DESC
     LIMIT 1;

    IF v_level IN ('none', 'view', 'edit') THEN
      RETURN v_level;
    END IF;
    RETURN CASE WHEN v_path = '/' THEN 'view' ELSE 'none' END;
  END LOOP;

  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.app_can_view(VARIADIC p_paths text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(p_paths) AS x(p)
    WHERE public.app_module_level(x.p) IN ('view', 'edit')
  );
$$;

CREATE OR REPLACE FUNCTION public.app_can_edit(VARIADIC p_paths text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(p_paths) AS x(p)
    WHERE public.app_module_level(x.p) = 'edit'
  );
$$;

REVOKE ALL ON FUNCTION public.app_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_module_level(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_can_view(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_can_edit(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_module_level(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_view(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_can_edit(text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
