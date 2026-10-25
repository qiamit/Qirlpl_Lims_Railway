# OQ-08: MCP connector (staging)

| | |
|---|---|
| Change | MCP connector, plan `docs/mcp-connector-plan.md` v0.3 (lab decisions of 25 Oct 2026) |
| Software | branch `claude/priceless-ramanujan-5f501a`: `backend/mcp-server/` (commits b5d0c51, d44470b), migration 52 `20261102101400_mcp_connector.sql`, AI Settings switch (c66ea20) |
| Environment | staging only: service `mcp` at `https://mcp-staging-9e9a.up.railway.app/mcp`; migration 52 applied to the staging database 25 Oct 2026 09:16 IST. **Production: nothing applied or deployed** (the `mcp` service exists there without a source, so nothing runs) |
| Run | 25 Oct 2026 09:39 IST, script `scratchpad/mcptest/e2e.mjs`, OQ test accounts (Director, QM, TM, Testing Engineer, Sample Incharge, Auditor, Calibration Engineer) |
| Result | **44 of 45 checks pass.** M-17 (token refresh) fails because GoTrue cannot refresh any session (see below); this is a defect of the auth service, not of the connector |

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
| M-07 | Director sees client names; QM sees placeholders for the same samples | Pass | dir (real name) / qm CLIENT_be1f0d |
| M-07 | TM sees placeholders | Pass | CLIENT_be1f0d |
| M-07 | No real client name anywhere in the QM answer | Pass |  |
| M-09 | QM can search with a placeholder (mapped back on the server) | Pass | 5 rows |
| M-07 | sample_status for QM: client placeholder, sections listed | Pass | SR261021/214-001 sections 2 |
| M-08 | QM reading Client Master gets placeholders for name, address, mobile, e-mail, GSTIN | Pass | {"company_name":"CLIENT_e66a8b","address":"ADDRESS_dd7788","mobile":"PRIVATE_98122b","email":"PRIVATE_d9a631", |
| M-08 | Director reading Client Master gets real values | Pass | (real name returned) |
| M-10 | TM cannot read the Audit Trail | Pass | The Audit Trail is for the Quality Manager and the Laboratory Director (same as the app). |
| M-10 | QM reads the Audit Trail (changed fields, no values) | Pass | {"at":"2026-10-25T04:08:16.219338+00:00","who":"OQ Director","table":"equipment_master","row_id":"c1f0177f-430 |
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
| M-15 | Director edits equipment QI-EQ-0196 (location) and changes it back | Pass | before {"current_location":null} after {"current_location":"(OQ-08 MCP test)"} |
| M-15 | Audit Trail shows both changes with reason "via MCP" and the Director as actor | Pass | {"at":"2026-10-25T04:09:00.802233+00:00","who":"OQ Director","table":"equipment_master","row_id":"23efd150-4ba |
| M-16 | QM cannot call update_record | Pass | MCP error -32602: Tool update_record not found |
| M-19 | mcp_calls has this run: sign-ins, refusals, reads and writes | Pass | 50 rows, latest {"at":"2026-10-25T04:09:01.147249+00:00","user_name":"OQ Director","tool":"audit_trail_search" |
| M-19 | TM cannot read the call log | Pass | 0 rows |
| M-17 | Refresh gives new tokens; the old refresh token no longer works | **Fail** | first 400 {"error":"invalid_grant","error_description":"Sign-in has ended. Connect again."}, reuse 400 |
| M-18 | Revoked token is refused | Pass | status 401 |
| M-20 | Switch off: sign-in refused with the switch message | Pass | patch 200, sign-in 403 |
| M-20 | QM cannot switch it on (Director only) | Pass | status 200 rows 0 |

The M-07 and M-08 details for the Director are written here as "(real name)"
so that no client name is copied into this record.

## Finding: GoTrue cannot refresh sessions (staging and production)

Found by M-17. `POST /auth/v1/token?grant_type=refresh_token` answers HTTP 500
`missing destination name oauth_client_id in *models.Session` on staging. The
auth service on both environments runs `supabase/gotrue:v2.174.0`, while the
`auth` schema of both databases is at migration `20260625000000` (the schema
of GoTrue v2.192–v2.196; `auth.sessions` has the newer `oauth_client_id`
column that v2.174.0 does not know). Production's `auth.audit_log_entries`
for the last three days hold logins and no `token_refreshed` events, so
refresh is failing there too. This was already the case before go-live.

Effect:

- App users are signed out when their access token expires (one hour), instead
  of the session being refreshed. They have to sign in again.
- MCP connector sessions also end after one hour: the connector cannot refresh
  the user's LIMS token, so it ends the connector session (as designed) and
  Claude asks the user to connect again.

Proposed fix (separate change, needs approval): run the auth service on
`supabase/gotrue:v2.196.0` (released 18 Aug 2026; its last migration is
`20260625000000`, the same as the databases, so no schema change). Staging
first (sign-in, refresh, MFA, password reset, role tests), then production
in a quiet hour with a backup.

## Still to do before production

1. Fix the GoTrue refresh (above), then re-run M-17.
2. The Director tries the connector from Claude on staging (Settings →
   Connectors → Add custom connector → `https://mcp-staging-9e9a.up.railway.app/mcp`,
   sign in with the staging Director login).
3. QM review of this record, then the production release: migration 52, the
   `mcp` service source and variables in production, the address
   `mcp.qirlpl.com` (DNS record at the domain host), the Director switches it
   on in AI Settings.
