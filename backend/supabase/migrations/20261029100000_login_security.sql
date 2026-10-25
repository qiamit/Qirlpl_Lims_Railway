-- Login and session security (security audit M-8: forced password change
-- after a director reset, sign-in event log, failed-login log).
-- NOT applied automatically. Apply on Railway Postgres only when Amit asks,
-- after 20261009063000_security_role_checks.sql (app_is_laboratory_director),
-- while the lab is idle. Safe to re-run.
--
-- What it adds
--   user_profiles.must_change_password  Set by the functions service route
--                        POST /reset-user-password (director reset). The app
--                        then forces the change-password dialog at sign-in.
--                        Signed-in users cannot clear it with a plain UPDATE
--                        (trigger); only app_clear_must_change_password()
--                        clears it, for the caller's own row. A Laboratory
--                        Director may set it to true.
--   auth_events          login / logout / failed_login / password_changed /
--                        password_reset_by_director / idle_logout /
--                        mfa_enrolled, with time, IP and user agent (from the
--                        PostgREST request headers). No direct table access
--                        for anon or authenticated; written through the RPCs
--                        below or by the functions service (service_role).
--   app_log_auth_event(event, details)   signed-in caller, own events only.
--   app_log_failed_login(email)          anon-callable, insert only, at most
--                        20 rows per email and 2000 rows in total per hour.
--                        Returns nothing, so it does not reveal whether an
--                        account exists.
--   app_recent_auth_events(limit)        Laboratory Director only; also
--                        returns GoTrue's auth.audit_log_entries when the
--                        database role that owns the function can read them.
--   app_clear_must_change_password()     caller's own row only.
--   app_revoke_user_sessions(user_id)    service_role only; deletes the
--                        user's GoTrue sessions (refresh tokens cascade) after
--                        a director reset. Returns -1 when auth.sessions is
--                        not readable by the function owner.
--
-- IP addresses come from X-Forwarded-For / X-Real-IP as passed by the
-- gateway; they are only as trustworthy as the gateway's header handling.

-- ---------------------------------------------------------------------------
-- 1. must_change_password
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.user_profiles_guard_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- current_user is the API role for direct UPDATEs and the function owner
  -- inside SECURITY DEFINER functions (app_clear_must_change_password).
  -- Nested IFs: SQL does not promise short-circuit order, and service_role
  -- cannot execute app_is_laboratory_director().
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
     AND current_user IN ('anon', 'authenticated')
  THEN
    IF NEW.must_change_password THEN
      IF public.app_is_laboratory_director() THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'must_change_password can only be cleared by changing the password'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.user_profiles_guard_must_change_password() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_profiles_guard_must_change_password ON public.user_profiles;
CREATE TRIGGER user_profiles_guard_must_change_password
  BEFORE UPDATE OF must_change_password ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profiles_guard_must_change_password();

CREATE OR REPLACE FUNCTION public.app_clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_profiles
  SET must_change_password = false
  WHERE id = auth.uid()
    AND must_change_password;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. auth_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  email text NULL,
  event text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  ip text NULL,
  user_agent text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.auth_events DROP CONSTRAINT IF EXISTS auth_events_event_check;
ALTER TABLE public.auth_events
  ADD CONSTRAINT auth_events_event_check CHECK (event IN (
    'login', 'logout', 'failed_login', 'password_changed',
    'password_reset_by_director', 'idle_logout', 'mfa_enrolled'
  ));

CREATE INDEX IF NOT EXISTS auth_events_at_idx ON public.auth_events (at DESC);
CREATE INDEX IF NOT EXISTS auth_events_user_at_idx ON public.auth_events (user_id, at DESC);
CREATE INDEX IF NOT EXISTS auth_events_failed_email_idx
  ON public.auth_events (email, at DESC)
  WHERE event = 'failed_login';

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
-- No policies: anon and authenticated have no direct access at all.
REVOKE ALL ON TABLE public.auth_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.auth_events TO service_role;

-- Request header from PostgREST (lower-case name), NULL outside a request.
CREATE OR REPLACE FUNCTION public.app_request_header(p_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  h json;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF h IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN left(nullif(btrim(h ->> lower(p_name)), ''), 512);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_request_ip()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT left(coalesce(
    nullif(btrim(split_part(public.app_request_header('x-forwarded-for'), ',', 1)), ''),
    public.app_request_header('x-real-ip')
  ), 64);
$$;

REVOKE ALL ON FUNCTION public.app_request_header(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_request_ip() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_log_auth_event(p_event text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  -- failed_login and password_reset_by_director have their own paths.
  IF p_event IS NULL OR p_event NOT IN ('login', 'logout', 'password_changed', 'idle_logout', 'mfa_enrolled') THEN
    RAISE EXCEPTION 'Unsupported auth event: %', coalesce(p_event, 'null') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_details) <> 'object' OR length(v_details::text) > 2000 THEN
    v_details := jsonb_build_object('details_dropped', true);
  END IF;
  -- Flood guard: at most 200 events per user per hour.
  IF (SELECT count(*) FROM public.auth_events e
      WHERE e.user_id = v_uid AND e.at > now() - interval '1 hour') >= 200 THEN
    RETURN;
  END IF;
  INSERT INTO public.auth_events (user_id, email, event, ip, user_agent, details)
  VALUES (
    v_uid,
    (SELECT up.email FROM public.user_profiles up WHERE up.id = v_uid),
    p_event,
    public.app_request_ip(),
    public.app_request_header('user-agent'),
    v_details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_log_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_per_email_limit constant integer := 20;
  v_total_limit constant integer := 2000;
BEGIN
  IF v_email = '' OR length(v_email) > 254 OR position('@' IN v_email) = 0 THEN
    RETURN;
  END IF;
  -- Serialise per email so the limit holds under concurrent calls.
  PERFORM pg_advisory_xact_lock(hashtext('app_log_failed_login:' || v_email));
  IF (SELECT count(*) FROM public.auth_events e
      WHERE e.event = 'failed_login' AND e.email = v_email
        AND e.at > now() - interval '1 hour') >= v_per_email_limit THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.auth_events e
      WHERE e.event = 'failed_login' AND e.at > now() - interval '1 hour') >= v_total_limit THEN
    RETURN;
  END IF;
  INSERT INTO public.auth_events (user_id, email, event, ip, user_agent, details)
  VALUES (
    (SELECT up.id FROM public.user_profiles up WHERE lower(btrim(up.email)) = v_email LIMIT 1),
    v_email,
    'failed_login',
    public.app_request_ip(),
    public.app_request_header('user-agent'),
    '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.app_recent_auth_events(p_limit integer DEFAULT 200)
RETURNS TABLE (
  source text,
  at timestamptz,
  event text,
  user_id uuid,
  email text,
  ip text,
  user_agent text,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_gotrue boolean := false;
BEGIN
  IF NOT public.app_is_laboratory_director() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_gotrue := to_regclass('auth.audit_log_entries') IS NOT NULL
      AND has_table_privilege('auth.audit_log_entries', 'SELECT');
  EXCEPTION WHEN others THEN
    v_gotrue := false;
  END;

  IF v_gotrue THEN
    BEGIN
      RETURN QUERY EXECUTE $q$
        SELECT x.source, x.at, x.event, x.user_id, x.email, x.ip, x.user_agent, x.details
        FROM (
          SELECT 'app'::text AS source, e.at, e.event, e.user_id, e.email, e.ip, e.user_agent, e.details
          FROM public.auth_events e
          UNION ALL
          SELECT 'gotrue'::text,
                 a.created_at,
                 coalesce(a.payload::jsonb ->> 'action', 'unknown'),
                 CASE WHEN (a.payload::jsonb ->> 'actor_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      THEN (a.payload::jsonb ->> 'actor_id')::uuid END,
                 a.payload::jsonb ->> 'actor_username',
                 nullif(a.ip_address::text, ''),
                 NULL::text,
                 coalesce(a.payload::jsonb, '{}'::jsonb)
          FROM auth.audit_log_entries a
        ) x
        ORDER BY x.at DESC NULLS LAST
        LIMIT $1
      $q$ USING v_limit;
      RETURN;
    EXCEPTION WHEN others THEN
      -- GoTrue table shape differs or is unreadable: app events only.
      NULL;
    END;
  END IF;

  RETURN QUERY
    SELECT 'app'::text, e.at, e.event, e.user_id, e.email, e.ip, e.user_agent, e.details
    FROM public.auth_events e
    ORDER BY e.at DESC
    LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR to_regclass('auth.sessions') IS NULL THEN
    RETURN -1;
  END IF;
  BEGIN
    EXECUTE 'DELETE FROM auth.sessions WHERE user_id = $1' USING p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN others THEN
    RETURN -1;
  END;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants (explicit; anon only on app_log_failed_login)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.app_clear_must_change_password() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_log_auth_event(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_log_failed_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_recent_auth_events(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.app_clear_must_change_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_log_auth_event(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_log_failed_login(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_recent_auth_events(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_revoke_user_sessions(uuid) TO service_role;

-- PostgREST picks up the new column, table and functions.
NOTIFY pgrst, 'reload schema';
