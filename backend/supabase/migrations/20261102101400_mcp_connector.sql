-- MCP connector (docs/mcp-connector-plan.md v0.3, lab decisions of 25 Oct
-- 2026; ISO/IEC 17025:2017 4.2, 7.11). The `mcp` service lets the Laboratory
-- Director, Quality Manager and Technical Manager use the LIMS from Claude with
-- their own login. This file adds what the service needs in the database:
--
--   1. lab_settings.mcp_enabled: the Director's switch (default off). Off
--      refuses sign-in and every call.
--   2. mcp_oauth_clients, mcp_sessions: OAuth clients registered by Claude and
--      the connector's sign-in sessions (GoTrue tokens encrypted by the
--      service). Only the service (service role) reads or writes them.
--   3. mcp_calls: one row per tool call (user, tool, arguments, table, rows,
--      outcome). Read by the QM and the Director, written only by the service,
--      never changed or deleted.
--   4. app_mcp_whoami(), app_mcp_table_access(text[]): who the caller is for
--      the connector, and the caller's Module Access decision per table
--      (read / write), whatever the database enforcement mode is. The service
--      applies these on top of row level security, so the connector never
--      gives more than the app does.
--   5. write_audit_log(): rows changed through the connector carry
--      reason = 'via MCP' in the Audit Trail (request header x-lims-via: mcp,
--      set by the service). Otherwise unchanged.
--
-- Safe to run more than once.

-- 1. Switch -------------------------------------------------------------------

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS mcp_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lab_settings.mcp_enabled IS
  'MCP connector (Claude) on/off. Changed by the Laboratory Director. Off refuses sign-in and every call.';

-- 2. OAuth clients and sessions (service only) ---------------------------------

CREATE TABLE IF NOT EXISTS public.mcp_oauth_clients (
  client_id text PRIMARY KEY,
  client_info jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.mcp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  access_hash text UNIQUE,
  access_expires_at timestamptz,
  refresh_hash text UNIQUE,
  session_expires_at timestamptz NOT NULL,
  gotrue_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);

CREATE INDEX IF NOT EXISTS mcp_sessions_user_idx ON public.mcp_sessions (user_id);

ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mcp_oauth_clients FROM anon, authenticated;
REVOKE ALL ON TABLE public.mcp_sessions FROM anon, authenticated;
GRANT ALL ON TABLE public.mcp_oauth_clients TO service_role;
GRANT ALL ON TABLE public.mcp_sessions TO service_role;

-- 3. Call log -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mcp_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_name text,
  designation text,
  session_id uuid,
  tool text NOT NULL,
  arguments jsonb,
  table_name text,
  row_ids text[],
  rows_returned integer,
  is_write boolean NOT NULL DEFAULT false,
  outcome text NOT NULL CHECK (outcome IN ('ok', 'refused', 'error')),
  message text,
  duration_ms integer
);

CREATE INDEX IF NOT EXISTS mcp_calls_at_idx ON public.mcp_calls (at DESC);
CREATE INDEX IF NOT EXISTS mcp_calls_user_idx ON public.mcp_calls (user_id, at DESC);

COMMENT ON TABLE public.mcp_calls IS
  'ISO 17025 7.11: every MCP connector tool call (who, tool, arguments, table, rows, outcome). Written by the mcp service only; read by the QM and the Laboratory Director.';

ALTER TABLE public.mcp_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mcp_calls FROM anon, authenticated;
GRANT SELECT ON TABLE public.mcp_calls TO authenticated;
GRANT ALL ON TABLE public.mcp_calls TO service_role;

DROP POLICY IF EXISTS lims_mcp_calls_read ON public.mcp_calls;
CREATE POLICY lims_mcp_calls_read ON public.mcp_calls
  FOR SELECT TO authenticated
  USING (public.app_can_read_audit_log());

CREATE OR REPLACE FUNCTION public.mcp_calls_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'The MCP call log cannot be changed or deleted.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS mcp_calls_append_only ON public.mcp_calls;
CREATE TRIGGER mcp_calls_append_only
  BEFORE UPDATE OR DELETE ON public.mcp_calls
  FOR EACH ROW EXECUTE FUNCTION public.mcp_calls_append_only();

-- 4. Who the caller is, and Module Access per table -------------------------------

-- mcp_role: 'director' | 'qm' | 'tm' | null (not allowed to use the connector).
CREATE OR REPLACE FUNCTION public.app_mcp_whoami()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'user_id', auth.uid(),
    'full_name', up.full_name,
    'designation', up.designation,
    'department', up.department_name,
    'active', lower(btrim(coalesce(up.status, 'active'))) <> 'inactive',
    'mcp_role', CASE
      WHEN up.id IS NULL OR lower(btrim(coalesce(up.status, 'active'))) = 'inactive' THEN NULL
      WHEN lower(btrim(coalesce(up.designation, ''))) = 'laboratory director' THEN 'director'
      WHEN lower(btrim(coalesce(up.designation, ''))) = 'quality manager' THEN 'qm'
      WHEN lower(btrim(coalesce(up.designation, ''))) = 'technical manager' THEN 'tm'
      ELSE NULL
    END,
    'mcp_enabled', coalesce((SELECT ls.mcp_enabled FROM public.lab_settings ls
                              ORDER BY (ls.id = '00000000-0000-0000-0000-000000000001'::uuid) DESC, ls.created_at DESC
                              LIMIT 1), false)
  )
  FROM (SELECT auth.uid() AS uid) me
  LEFT JOIN public.user_profiles up ON up.id = me.uid;
$$;

-- The app's Module Access decision for the caller, per table. Unmapped tables
-- are not restricted by Module Access (row level security still applies).
CREATE OR REPLACE FUNCTION public.app_mcp_table_access(p_tables text[])
RETURNS TABLE (table_name text, can_read boolean, can_write boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t,
         auth.uid() IS NOT NULL AND public.app_module_table_decision(auth.uid(), t, 'select'),
         auth.uid() IS NOT NULL AND public.app_module_table_decision(auth.uid(), t, 'update')
    FROM unnest(coalesce(p_tables, '{}'::text[])) AS t;
$$;

REVOKE ALL ON FUNCTION public.app_mcp_whoami() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_mcp_table_access(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_mcp_whoami() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_mcp_table_access(text[]) TO authenticated;

-- 5. Audit Trail: changes through the connector say 'via MCP' ---------------------

-- 'mcp' when the request came from the mcp service (PostgREST request header
-- x-lims-via), else NULL. Never raises.
CREATE OR REPLACE FUNCTION public.app_request_via()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := lower(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-lims-via', '')));
  RETURN CASE WHEN v = 'mcp' THEN 'mcp' ELSE NULL END;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  row_key text;
  previous_row jsonb;
  next_row jsonb;
  key_source jsonb;
  key_cols text[];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    previous_row := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    next_row := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' AND (previous_row - 'updated_at') = (next_row - 'updated_at') THEN
    RETURN NEW;
  END IF;

  key_source := coalesce(next_row, previous_row);
  IF TG_NARGS > 0 THEN
    key_cols := TG_ARGV;
  ELSIF key_source ? 'id' THEN
    key_cols := ARRAY['id'];
  ELSE
    SELECT array_agg(a.attname::text ORDER BY k.ord)
    INTO key_cols
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
    WHERE i.indrelid = TG_RELID
      AND i.indisprimary;
  END IF;

  IF key_cols IS NOT NULL THEN
    SELECT string_agg(coalesce(key_source ->> c.col, ''), ',' ORDER BY c.ord)
    INTO row_key
    FROM unnest(key_cols) WITH ORDINALITY AS c(col, ord);
  END IF;
  row_key := coalesce(row_key, '');

  previous_row := public.app_audit_strip_secrets(previous_row);
  next_row := public.app_audit_strip_secrets(next_row);

  INSERT INTO public.audit_log (actor, table_name, row_id, action, old_row, new_row, reason)
  VALUES (auth.uid(), TG_TABLE_NAME, row_key, TG_OP, previous_row, next_row,
          CASE WHEN public.app_request_via() = 'mcp' THEN 'via MCP' END);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
