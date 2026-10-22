-- Security hardening from the 2026-10-22 code audit.
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- while the lab is idle, after 20261009063000, 20261009103000, 20261009120000
-- and 20261022000000 are on the database. Every block is idempotent.
--
-- Assumptions (checked against the frontend on 2026-10-22):
--  * Staff use the app as role `authenticated`; anon only needs the
--    get_public_company_brand() RPC and the laboratory-files/company/% logo.
--    No public page reads a public table directly as anon.
--  * public.app_is_known_staff() / app_is_laboratory_director() from
--    20261009063000 exist. If they do not, the dependent blocks are skipped.
--  * lab_letterheads, lab_documents and lab_accreditations are written only
--    from Lab Settings (Laboratory Director route). Other screens read them.
--  * lab_prefixes rows are inserted/deleted only from Lab Settings; other
--    screens UPDATE last_number, so UPDATE stays open to known staff.
--  * lab_settings is NOT tightened: report preparation, print dialogs and
--    quotation templates upsert template JSON into it as non-directors.
--  * storage-api sets request.jwt.claims for each request, so auth.uid()
--    resolves inside storage.objects policies. Verify one upload and one
--    download as a non-director staff user after applying.
--  * User creation goes through the functions service (service role), which
--    upserts the profile with status 'Active' after handle_new_user runs.
--    A profile created by anything else (open /signup) starts as 'Inactive'.

-- ---------------------------------------------------------------------------
-- 1. Self sign-ups start Inactive and carry no role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    full_name,
    mobile,
    designation,
    department_name,
    division,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'mobile', ''),
    '',
    '',
    '',
    'Inactive'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.user_profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
    mobile = COALESCE(NULLIF(EXCLUDED.mobile, ''), public.user_profiles.mobile),
    updated_at = now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. SECURITY DEFINER helpers: pin search_path, role checks, no anon.
-- ---------------------------------------------------------------------------

-- Only answers for the caller's own row, so it cannot be used to probe other
-- users' email / designation / status.
DO $$
BEGIN
  IF to_regprocedure('public.app_profile_privileged_unchanged(uuid, text, text, text, text, text)') IS NOT NULL THEN
    EXECUTE $f$
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
      AS $body$
        SELECT p_id = auth.uid() AND EXISTS (
          SELECT 1
          FROM public.user_profiles p
          WHERE p.id = p_id
            AND p.designation IS NOT DISTINCT FROM p_designation
            AND p.status IS NOT DISTINCT FROM p_status
            AND p.email IS NOT DISTINCT FROM p_email
            AND p.department_name IS NOT DISTINCT FROM p_department
            AND p.division IS NOT DISTINCT FROM p_division
        );
      $body$
    $f$;
    REVOKE ALL ON FUNCTION public.app_profile_privileged_unchanged(uuid, text, text, text, text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.app_profile_privileged_unchanged(uuid, text, text, text, text, text) TO authenticated;
  END IF;
END $$;

-- list_team_users: inactive directors are refused; pg_temp last.
CREATE OR REPLACE FUNCTION public.list_team_users()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  mobile text,
  designation text,
  department_name text,
  division text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_designation text;
BEGIN
  SELECT btrim(COALESCE(up.designation, ''))
  INTO caller_designation
  FROM public.user_profiles up
  WHERE up.id = auth.uid()
    AND lower(btrim(COALESCE(up.status, 'active'))) <> 'inactive';

  IF lower(COALESCE(caller_designation, '')) <> 'laboratory director' THEN
    RAISE EXCEPTION 'Forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(NULLIF(p.email, ''), u.email, ''::text)::text,
    COALESCE(p.full_name, ''::text),
    COALESCE(p.mobile, ''::text),
    COALESCE(p.designation, ''::text),
    COALESCE(p.department_name, ''::text),
    COALESCE(p.division, ''::text),
    COALESCE(p.status, 'Active'::text)
  FROM public.user_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.full_name ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_team_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_team_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_team_users() TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.get_public_company_brand()') IS NOT NULL THEN
    ALTER FUNCTION public.get_public_company_brand() SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.update_team_user(uuid, text, text, text, text, text, text, text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.update_team_user(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
  END IF;
END $$;

-- No SECURITY DEFINER function in public is callable by anon except the
-- public logo lookup. Definer functions without a pinned search_path are
-- reported (not changed, because their bodies are not in the repo).
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    IF fn.proname <> 'get_public_company_brand' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
    END IF;
    IF fn.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(fn.proconfig) c WHERE c LIKE 'search_path=%') THEN
      RAISE NOTICE 'SECURITY DEFINER function % has no pinned search_path; review it', fn.sig;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. anon has no business with public tables or sequences.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Every public table has RLS on, and every one except user_profiles has
--    the RESTRICTIVE known-staff policy (tables created after 20261009063000
--    never got it).
--    A table found with RLS OFF was open to everyone; it gets RLS plus a
--    known-staff policy so the app keeps working for staff.
--    A table with RLS ON and no policy stays deny-all (service role only).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rel record;
  has_known_staff_fn boolean := to_regprocedure('public.app_is_known_staff()') IS NOT NULL;
BEGIN
  IF NOT has_known_staff_fn THEN
    RAISE NOTICE 'public.app_is_known_staff() missing; apply 20261009063000 first. RLS block skipped.';
    RETURN;
  END IF;

  FOR rel IN
    SELECT c.oid, c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    IF NOT rel.relrowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rel.relname);
      IF NOT EXISTS (
        SELECT 1 FROM pg_policy pol
        WHERE pol.polrelid = rel.oid AND pol.polpermissive
      ) THEN
        EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_all ON public.%I', rel.relname);
        EXECUTE format(
          'CREATE POLICY lims_known_staff_all ON public.%I FOR ALL TO authenticated USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
          rel.relname
        );
      END IF;
      RAISE NOTICE 'RLS was OFF on public.%; enabled', rel.relname;
    END IF;

    IF rel.relname <> 'user_profiles' THEN
      EXECUTE format('DROP POLICY IF EXISTS lims_known_staff_only ON public.%I', rel.relname);
      EXECUTE format(
        'CREATE POLICY lims_known_staff_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.app_is_known_staff()) WITH CHECK (public.app_is_known_staff())',
        rel.relname
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. ai_models.api_key: the column REVOKE in 20261009063000 has no effect
--    while authenticated holds table-level SELECT. Replace the table grant
--    with a column grant that leaves api_key out. INSERT/UPDATE stay, so the
--    director can still set a key; the functions service reads it as
--    service_role.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  cols text;
BEGIN
  IF to_regclass('public.ai_models') IS NULL THEN
    RETURN;
  END IF;

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.ai_models'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname <> 'api_key';

  REVOKE SELECT ON public.ai_models FROM PUBLIC, anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.ai_models TO authenticated', cols);
  GRANT INSERT, UPDATE, DELETE ON public.ai_models TO authenticated;
  GRANT ALL ON public.ai_models TO service_role;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Lab Settings tables that only the Laboratory Director edits.
--    Letterhead header/footer HTML is rendered into reports and previews, so
--    a non-director must not be able to plant markup there through REST.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  IF to_regprocedure('public.app_is_laboratory_director()') IS NULL THEN
    RAISE NOTICE 'public.app_is_laboratory_director() missing; Lab Settings block skipped.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['lab_letterheads', 'lab_documents', 'lab_accreditations']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS lims_director_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_director_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS lims_director_delete ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY lims_director_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.app_is_laboratory_director())',
      t
    );
    EXECUTE format(
      'CREATE POLICY lims_director_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.app_is_laboratory_director()) WITH CHECK (public.app_is_laboratory_director())',
      t
    );
    EXECUTE format(
      'CREATE POLICY lims_director_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.app_is_laboratory_director())',
      t
    );
  END LOOP;

  -- lab_prefixes: counters are bumped by staff (UPDATE), rows are created and
  -- removed only from Lab Settings.
  IF to_regclass('public.lab_prefixes') IS NOT NULL THEN
    DROP POLICY IF EXISTS lims_director_insert ON public.lab_prefixes;
    DROP POLICY IF EXISTS lims_director_delete ON public.lab_prefixes;
    CREATE POLICY lims_director_insert ON public.lab_prefixes
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.app_is_laboratory_director());
    CREATE POLICY lims_director_delete ON public.lab_prefixes
      AS RESTRICTIVE FOR DELETE TO authenticated
      USING (public.app_is_laboratory_director());
  END IF;
END $$;

-- issued_report_amendments had an explicit anon SELECT grant (removed in
-- step 3); keep it removed even if step 3 is edited later.
DO $$
BEGIN
  IF to_regclass('public.issued_report_amendments') IS NOT NULL THEN
    REVOKE ALL ON public.issued_report_amendments FROM anon;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Storage: every bucket policy is "any authenticated user". Add
--    RESTRICTIVE known-staff policies so a self-signed-up or deactivated
--    account cannot list, download, upload, overwrite or delete lab files.
--    The public company logo (laboratory-files/company/%) stays readable.
--    All buckets stay private; the app uses signed URLs only.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects missing; storage block skipped.';
    RETURN;
  END IF;
  IF to_regprocedure('public.app_is_known_staff()') IS NULL THEN
    RAISE NOTICE 'public.app_is_known_staff() missing; storage block skipped.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS lims_storage_known_staff_select ON storage.objects;
  DROP POLICY IF EXISTS lims_storage_known_staff_insert ON storage.objects;
  DROP POLICY IF EXISTS lims_storage_known_staff_update ON storage.objects;
  DROP POLICY IF EXISTS lims_storage_known_staff_delete ON storage.objects;

  CREATE POLICY lims_storage_known_staff_select ON storage.objects
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (
      public.app_is_known_staff()
      OR (bucket_id = 'laboratory-files' AND name LIKE 'company/%')
    );

  CREATE POLICY lims_storage_known_staff_insert ON storage.objects
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (public.app_is_known_staff());

  CREATE POLICY lims_storage_known_staff_update ON storage.objects
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (public.app_is_known_staff())
    WITH CHECK (public.app_is_known_staff());

  CREATE POLICY lims_storage_known_staff_delete ON storage.objects
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (public.app_is_known_staff());

  UPDATE storage.buckets SET public = false WHERE public IS TRUE;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Deactivated users cannot sign in: keep auth.users.banned_until in step
--    with user_profiles.status, whichever path changes the status.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_profile_status_to_auth_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'banned_until'
  ) THEN
    RETURN NEW;
  END IF;
  IF lower(btrim(COALESCE(NEW.status, ''))) = 'inactive' THEN
    UPDATE auth.users SET banned_until = 'infinity', updated_at = now() WHERE id = NEW.id;
  ELSE
    UPDATE auth.users SET banned_until = NULL, updated_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_status_to_auth_ban() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_sync_auth_ban ON public.user_profiles;
CREATE TRIGGER user_profiles_sync_auth_ban
  AFTER UPDATE OF status ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_status_to_auth_ban();

NOTIFY pgrst, 'reload schema';
