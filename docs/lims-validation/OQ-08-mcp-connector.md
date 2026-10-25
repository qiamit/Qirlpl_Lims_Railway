# OQ-08: MCP connector (staging)

| | |
|---|---|
| Change | MCP connector, plan `docs/mcp-connector-plan.md` v0.3 (lab decisions of 25 Oct 2026) |
| Software | branch `claude/priceless-ramanujan-5f501a`: `backend/mcp-server/` (commits b5d0c51, d44470b), migration 52 `20261102101400_mcp_connector.sql`, AI Settings switch (c66ea20), gateway client-IP fix (4bc24af) |
| Environment | staging only: service `mcp` at `https://mcp-staging-9e9a.up.railway.app/mcp`; migration 52 applied to the staging database 25 Oct 2026 09:16 IST. **Production: nothing applied or deployed** (the `mcp` service exists there without a source, so nothing runs) |
| Run | 25 Oct 2026 09:39 IST (first run), 10:00 IST (after the GoTrue fix), script `scratchpad/mcptest/e2e.mjs`, OQ test accounts (Director, QM, TM, Testing Engineer, Sample Incharge, Auditor, Calibration Engineer) |
| Result | First run 44 of 45 (M-17 failed: GoTrue could not refresh any session). After the GoTrue fix on staging: **45 of 45 pass** |

## What was checked

| Id | Check | Result | Detail |
|---|---|---|---|
| M-01 | OAuth metadata published; /mcp without a token is 401 with resource_metadata | Pass | issuer https://mcp-staging-9e9a.up.railway.app/; 401=401 |
| M-02 | Registration with a redirect outside Claude / loopback is refused | Pass | 400 {"error":"invalid_request","error_description":"This redirect address is not allowed for the QIRLPL LIMS c |
| M-03 | Testing Engineer is refused at sign-in | Pass | status 403 |
| M-03 | Sample Incharge is refused at sign-in | Pass | status 403 |
| M-03 | Auditor is refused at sign-in | Pass | status 403 |
| M-03 | Calibration Engineer is refused at sign-in | Pass | status 403 |
| M-04 | Wrong password is refused | Pass | status 401 |
| M-05 | Laboratory Director signs in through OAuth (code + PKCE) | Pass | status 302 expires_in 3600 |
| M-05 | Laboratory Director: 15 tools, write tools present | Pass | whoami,list_tables,describe_table,query_table,search_samples,sample_status,due_and_overdue,equipment_status,op |
| M-05 | Quality Manager signs in through OAuth (code + PKCE) | Pass | status 302 expires_in 3600 |
| M-05 | Quality Manager: 13 tools, write tools absent | Pass | whoami,list_tables,describe_table,query_table,search_samples,sample_status,due_and_overdue,equipment_status,op |
| M-05 | Technical Manager signs in through OAuth (code + PKCE) | Pass | status 302 expires_in 3600 |
| M-05 | Technical Manager: 13 tools, write tools absent | Pass | whoami,list_tables,describe_table,query_table,search_samples,sample_status,due_and_overdue,equipment_status,op |
| M-06 | whoami for Laboratory Director | Pass | OQ Director can_edit=true |
| M-06 | whoami for Quality Manager | Pass | OQ Quality Manager can_edit=false |
| M-06 | whoami for Technical Manager | Pass | OQ Technical Manager Mech can_edit=false |
| M-07 | Director sees client names; QM sees placeholders for the same samples | Pass | dir (real name) / qm dir Bureau of Indian Standard (J P B O) / qm CLIENT_be1f0d |
| M-07 | TM sees placeholders | Pass | CLIENT_be1f0d |
| M-07 | No real client name anywhere in the QM answer | Pass |  |
| M-09 | QM can search with a placeholder (mapped back on the server) | Pass | 5 rows |
| M-07 | sample_status for QM: client placeholder, sections listed | Pass | SR261021/214-001 sections 2 |
| M-08 | QM reading Client Master gets placeholders for name, address, mobile, e-mail, GSTIN | Pass | {"company_name":"CLIENT_e66a8b","address":"ADDRESS_dd7788","mobile":"PRIVATE_98122b","email":"PRIVATE_d9a631", |
| M-08 | Director reading Client Master gets real values | Pass | (real name returned) |
| M-10 | TM cannot read the Audit Trail | Pass | The Audit Trail is for the Quality Manager and the Laboratory Director (same as the app). |
| M-10 | QM reads the Audit Trail (changed fields, no values) | Pass | {"at":"2026-10-25T04:33:42.725651+00:00","who":"OQ Quality Manager","table":"software_changes","row_id":"9f851 |
| M-11 | TM sees 128 of 137 tables; reading one outside the TM's Module Access is refused | Pass | backup_restore_tests: Your Module Access does not include backup_restore_tests, so the connector cannot show i |
| M-12 | Director cannot submit a result (test_allocation_parameters) | Pass | test_allocation_parameters cannot be changed through the connector: results are entered, submitted and approve |
| M-12 | Director cannot approve results | Pass | test_allocation_parameters cannot be changed through the connector: results are entered, submitted and approve |
| M-13 | Director cannot set samples.stage (issue / stage / numbers) | Pass | Column samples.stage cannot be written: stage moves (including issue) are done in the app. |
| M-13 | Director cannot set samples.test_report_issued_at (issue / stage / numbers) | Pass | Column test_report_issued_at cannot be written: issuing and signing are done only in the app. |
| M-13 | Director cannot set samples.issued_by_name (issue / stage / numbers) | Pass | Column issued_by_name cannot be written: issuing and signing are done only in the app. |
| M-13 | Director cannot set samples.test_report_nabl_ulr_number (issue / stage / numbers) | Pass | Column samples.test_report_nabl_ulr_number cannot be written: ULR numbers are given by the app. |
| M-13 | Director cannot delete (deleted_at) | Pass | Column deleted_at cannot be written: delete is not possible through the connector. |
| M-14 | Director cannot create an SRF | Pass | New samples rows cannot be created through the connector: new SRFs are registered in the app (Sample Receiving |
| M-14 | Director cannot change an issued report | Pass | issued_report_archive cannot be changed through the connector: issued reports are frozen. |
| M-14 | There is no delete tool | Pass | MCP error -32602: Tool delete_record not found |
| M-15 | Director edits equipment QI/CL/MF-02 (location) and changes it back | Pass | before {"current_location":null} after {"current_location":"(OQ-08 MCP test)"} |
| M-15 | Audit Trail shows both changes with reason "via MCP" and the Director as actor | Pass | {"at":"2026-10-25T04:34:36.801705+00:00","who":"OQ Director","table":"equipment_master","row_id":"c1f0177f-430 |
| M-16 | QM cannot call update_record | Pass | MCP error -32602: Tool update_record not found |
| M-19 | mcp_calls has this run: sign-ins, refusals, reads and writes | Pass | 50 rows, latest {"at":"2026-10-25T04:34:37.117146+00:00","user_name":"OQ Director","tool":"audit_trail_search" |
| M-19 | TM cannot read the call log | Pass | 0 rows |
| M-17 | Refresh gives new tokens; the old refresh token no longer works | Pass | first 200 (new access and refresh token), reuse of the old refresh token 400 |
| M-18 | Revoked token is refused | Pass | status 401 |
| M-20 | Switch off: sign-in refused with the switch message | Pass | patch 200, sign-in 403 |
| M-20 | QM cannot switch it on (Director only) | Pass | status 200 rows 0 |

The M-07 and M-08 details for the Director are written here as "(real name)"
so that no client name is copied into this record.

## Finding: GoTrue cannot refresh sessions (production; fixed on staging)

Found by M-17. `POST /auth/v1/token?grant_type=refresh_token` answers HTTP 500
`missing destination name oauth_client_id in *models.Session` on staging. The
auth service on both environments runs `supabase/gotrue:v2.174.0`, while the
`auth` schema of both databases is at migration `20260625000000` (the schema
of GoTrue v2.192–v2.196; `auth.sessions` has the newer `oauth_client_id`
column that v2.174.0 does not know). Production's `auth.audit_log_entries`
for the last three days hold logins and no `token_refreshed` events, so
refresh is failing there too. This was already the case before go-live.

Effect:

- App users: the access token lives 8 hours (`GOTRUE_JWT_EXP=28800`), so a
  session ends after 8 hours instead of being refreshed, and the user signs in
  again. Small effect in a working day, which is why it was not noticed.
- MCP connector: Claude refreshes its connector token every hour, and the
  connector checks the user's LIMS sign-in with GoTrue at that moment. With the
  refresh failing, the connector ends the session after one hour (M-17).

Proposed fix (separate change, needs approval): run the auth service on
`supabase/gotrue:v2.196.0` (released 18 Aug 2026; its last migration is
`20260625000000`, the same as the databases, so no schema change). Staging
first (sign-in, refresh, MFA, password reset, role tests), then production
in a quiet hour with a backup.

## Fix on staging (25 Oct 2026, 09:50–10:00 IST)

1. Staging database backup "Staging before GoTrue v2.196.0 2026-10-25" (1066 MB).
2. Staging `auth` image `supabase/gotrue:v2.174.0` → `v2.196.0`. No migration
   ran (the schema was already at `20260625000000`). Only warnings in the log:
   `GOTRUE_JWT_ADMIN_GROUP_NAME` and `GOTRUE_JWT_DEFAULT_GROUP_NAME` are
   deprecated (harmless).
3. MFA then failed with `mfa_ip_address_mismatch`: GoTrue saw Railway's
   internal proxy address (100.64.0.x, a different one per request) as the
   client IP, so a TOTP challenge and its verify never matched. This was also
   true before the upgrade, so two-step verification could never be completed
   (nobody uses it: the lab decided MFA is not required). Fix in the gateway
   (`backend/gateway/Caddyfile`, commit 4bc24af): the auth route passes Railway's
   `X-Real-IP` to GoTrue as `X-Forwarded-For`. A client-sent `X-Real-IP` /
   `X-Forwarded-For` is ignored (Railway sets `X-Real-IP` itself): GoTrue
   recorded the real address for a request carrying fake ones.
4. Results after the fix:
   - auth checks (`scratchpad/mcptest/auth_check.mjs`): 15 of 15 pass (table below);
   - role tests regression: 79 checks, 78 pass. F1 (the engineer's impartiality
     declaration for this year already exists, 409) failed the same way in the
     B-2 run, so it is test data, not auth;
   - MCP OQ-08: 45 of 45 pass (table above).

| Id | Check | Result | Detail |
|---|---|---|---|
| A-00 | GoTrue version | Pass | v2.196.0 |
| A-01 | Laboratory Director signs in | Pass | status 200 |
| A-01 | Quality Manager signs in | Pass | status 200 |
| A-01 | Technical Manager signs in | Pass | status 200 |
| A-01 | Testing Engineer signs in | Pass | status 200 |
| A-01 | Sample Incharge signs in | Pass | status 200 |
| A-01 | Wrong password refused | Pass | status 400 invalid_credentials |
| A-02 | Refresh works and can be chained | Pass | first 200 , second 200 |
| A-02 | Refreshed token reads the user | Pass | status 200 |
| A-02 | After sign-out the refresh token is refused | Pass | logout 204, refresh 400 |
| A-03 | Sign-up is closed | Pass | status 403 |
| A-04 | Password recovery link verifies and gives a session | Pass | generate 200, verify 200 (session returned) |
| A-05 | Director resets a password (functions service, GoTrue admin); user signs in and clears the forced change | Pass | reset 200 {"ok":true,"must_change_password":true,"sessions_revoked":0,"mfa_factors_removed":0,"warnings":[]};  |
| A-06 | TOTP enrol, verify to aal2, unenrol | Pass | enrol 200 ; challenge 200; verify 200   aal aal2; unenrol 200; secretlen 32 |
| A-06 | Receptionist has no MFA factor left | Pass | 0 factors |

For production (needs approval): the same two changes (auth image
`v2.196.0` and the gateway line) after a production backup, in a quiet hour,
then sign-in, refresh and the smoke test.

## Still to do before production

1. GoTrue and gateway fix in production (above).
2. The Director tries the connector from Claude on staging (Settings →
   Connectors → Add custom connector → `https://mcp-staging-9e9a.up.railway.app/mcp`,
   sign in with the staging Director login).
3. QM review of this record, then the production release: migration 52, the
   `mcp` service source and variables in production, the address
   `mcp.qirlpl.com` (DNS record at the domain host), the Director switches it
   on in AI Settings.
