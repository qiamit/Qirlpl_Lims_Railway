-- MCP connector (25 Oct 2026): Grok Bot registered itself as "Cursor" with
-- the loopback callback http://localhost:8787/callback, which does not run on
-- the user's computer, so sign-in never reached Grok Bot. Removing that
-- registration makes Grok Bot register again with its real callback address
-- (allowed after the lab decision of 25 Oct, plan section 9). Only the
-- connector's own client table is touched; no session used it.
DELETE FROM public.mcp_oauth_clients c
 WHERE c.client_info->>'client_name' = 'Cursor'
   AND c.client_info->'redirect_uris' = '["http://localhost:8787/callback"]'::jsonb
   AND NOT EXISTS (SELECT 1 FROM public.mcp_sessions s WHERE s.client_id = c.client_id);
