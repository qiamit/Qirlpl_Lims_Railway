# QIRLPL LIMS: go-live runbook

One ordered list for taking branch `claude/priceless-ramanujan-5f501a` to
production: backup, merge, 49 migrations, 5 data fixes, Railway settings,
smoke test, and the way back at every step. Production is changed only on the
go-live day, by the person named in each step, after the Laboratory
Director's go-ahead. Every step was rehearsed on a fresh copy of production
in the staging environment; see **Dry run** at the end for timings and results.

Change control: record the go-live as one software change (Quality → Software
Changes) before step 1, attach this runbook's checklist and the dry-run
result, and close it with the smoke test as its validation run (step 9).

## Roles

| Role | Who | Does |
|---|---|---|
| Approver | Laboratory Director | Says go / no-go before step 1 and after step 9 |
| Operator | Amit (with Claude) | Runs steps 1–8 from a terminal with the Railway CLI |
| Checker | Quality Manager | Runs the screen part of the smoke test (step 9) |

## Window

About **60–75 minutes** including checks (dry run: see the end), after lab
hours (after 19:00) or on a Sunday. No one works in the LIMS during steps
3–8: tell staff the day before, and again 15 minutes before step 1, to save
their work and sign out.

## Before the day (go / no-go list)

| # | Check | How |
|---|---|---|
| P1 | Lab decisions recorded: duplicates, asset codes, report numbers …AA, dummy calibration data, Generate Report, signatories, ULR series | `docs/staging-plan.md` |
| P2 | Data fixes still match production. They hold record ids and values of 23 Oct; a record changed since then makes the fix stop without changing anything | Run the dry run again on a fresh copy within 2 days of go-live; regenerate a fix if it stops |
| P3 | No finance sale documents only in a browser (migration 28) | Finance users open Sale → each document list once, signed in, so browser records sync; dry run shows the count the backfill copies |
| P4 | Branch builds and validation passes | `cd frontend && npm run build && npm run validate:calculations` |
| P5 | Staging role tests pass on the dry-run copy | `role_tests.mjs`, `extra_checks.mjs` (results in `docs/staging-plan.md`) |
| P6 | Railway CLI signed in, linked to project `Qirlpl_Lims_Railway`; `psql` 18 available | `railway status` |
| P7 | Production `DATABASE_URL` available to the operator's shell only (never pasted in chat or files) | `railway variable list --service Postgres --environment production` piped, not printed |

Go / no-go: the Approver signs off P1–P7.

## Go-live date: Sunday 25 Oct 2026, morning (lab closed all day)

Changed 24 Oct: the lab is closed on Sunday, so the go-live starts in the
morning, after Claude's weekly usage limit resets (06:30 IST).

| When (IST) | What | Who |
|---|---|---|
| Saturday | Staff told: no work in the LIMS on Sunday | Amit |
| Sunday 07:00–08:00 | Amit messages Claude when at the computer; Claude starts the dry run on a fresh read-only copy of production | Amit, Claude |
| After the dry run (about 30 min) | Claude fills in the go/no-go sheet below and posts it in the chat | Claude |
| Then | Amit replies **Go** (or No-go) | Amit (for the Director) |
| About 75 min after Go | Steps 1–9, Claude reports after each; stops at any abort point | Claude |
| End | Amit opens Dashboard, a report and the Audit Trail with his own login | Amit |
| Monday 02:00 | Nightly backup from `main`; Claude checks it when next asked | Claude |

### Go/no-go sheet (what "Go" means)

Saying **Go** at 18:45 means the person responsible for the lab agrees that
all of these are true. Any "No" means No-go and the change waits.

| # | Check | Filled by |
|---|---|---|
| 1 | Validation pack reviewed: result PASS with restrictions (no calibration certificate without a real MU template; results without MU flagged; AI for client data off) | Claude, from the pack |
| 2 | Today's dry run passed: all 49 migrations and 6 data fixes ran on today's copy of production | Claude |
| 3 | Last night's backups exist (database daily, files nightly) and a fresh on-demand backup is taken | Claude |
| 4 | Staff informed and signed out | Amit |
| 5 | Nobody is in the middle of issuing reports | Amit |
| 6 | Rollback is ready: previous `main` commit noted, backup named | Claude |

## Steps

Times are from the dry run. Keep the terminal output of every step (save it
as `go-live-<date>.log`); it is the record of what ran.

### 1. Backup (5 min)

1. Railway → Postgres (production) → Backups → **Create backup**, label
   `Before go-live <date>`. Wait until it shows as completed.
2. File bucket: copy the production bucket to a dated folder with `rclone copy`
   (read-only on the source), as in `docs/lims-validation/backup-restore-procedure.md`.
3. Note the current `main` commit (`git rev-parse origin/main`) for rollback.

Abort if the backup does not complete.

### 2. Freeze (2 min)

Staff signed out. Optional: Module Access stays as it is (log mode).

### 3. Merge and deploy (10 min)

1. Open a pull request from the branch to `main`, review the file list, merge.
2. Railway deploys `frontend`, `api`, `functions`, `pdf-service` from `main`.
   Wait until all four show **Success**.
3. Quick check on the old schema: the sign-in page opens and the Director
   can sign in and open the dashboard. (The new code works before the
   migrations: every new call falls back when a table or function is missing.)

Rollback: revert the merge commit on `main` (Railway redeploys the previous
code). No data has changed yet.

### 4. Migrations 1–49 (15 min)

In the order of `docs/audit-gap-closure-plan.md` ("Migrations waiting to be
applied"), one transaction each, stopping at the first error:

```bash
for f in $(cat migration-order.txt); do
  echo "== $f"; psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f "backend/supabase/migrations/$f" || break
done
```

Read the NOTICE lines as they come. Expected (dry run):

| Migration | Expected notice |
|---|---|
| 22 control charts | Equipment with an open breakdown goes Out of Service (dry run: no notice, none open) |
| 26 module access | Mode `log`, nothing blocked |
| 30 finance backfill | Sale documents copied (dry run: 0 of each kind) |
| 35 report number unique | Lists 8 duplicate report numbers and skips the index (fixed by data fix 1, then 35 runs again in step 6) |
| 38 unique keys | "37 added, 0 already present, 7 skipped" with the duplicate lists (fixed by data fixes 1 and 2, then 38 runs again in step 6) |
| 39 constraints | "74 added, 0 already present, 0 skipped" |
| 42 ULR cross check | Lists existing clashes (dry run: none) |

If a migration fails it is rolled back on its own (single transaction);
nothing after it runs. Decide: fix and continue from that migration, or
roll back (see Rollback).

### 5. Data fixes (5 min)

One transaction each, without a signed-in user, in this order:

```bash
for f in 20261023_duplicate_cleanup.sql 20261023_equipment_asset_codes.sql 20261023_calibration_template_formulas.sql 20261023_certificate_notes.sql 20261023_calibration_dummy_data.sql 20261025_module_access_new_pages.sql; do
  echo "== $f"; psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f "backend/supabase/data-fixes/$f" || break
done
```

Always with `--single-transaction`: `20261023_duplicate_cleanup.sql` switches
the issued-sample guard off and on around its changes; outside one
transaction a failure would leave the guard off.

Each fix checks every record by id and value first and stops without
changing anything on a mismatch (P2). The sixth gives staff module access to
the 32 new pages (QM all, others by designation; only adds rules); without it
only the Director could open the new registers. Access plan approved by the lab on 24 Oct.

### 6. Migrations 35 and 38 again (1 min)

```bash
for f in 20261101100100_report_number_unique.sql 20261102100000_unique_key_reconciliation.sql; do
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f "backend/supabase/migrations/$f"
done
```

Expected: `samples_test_report_number_uidx` added; 38 says "7 added, 37
already present, 0 skipped" (44 of 44 unique keys).

### 7. Database checks (2 min, read-only)

```sql
-- every public table has RLS
select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;            -- expect none
-- no anon write grants
select table_name from information_schema.role_table_grants
 where grantee='anon' and table_schema in ('public','storage')
   and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');                 -- expect none
-- SECURITY DEFINER functions all pin search_path
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'); -- expect none
-- counts unchanged apart from the data fixes
select (select count(*) from public.samples) samples, (select count(*) from public.clients) clients,
       (select count(*) from auth.users) users, (select count(*) from storage.objects) files;
```

### 8. Railway settings (10 min)

| ID | Service | Setting |
|---|---|---|
| S-20 | `rest` | `PGRST_DB_SCHEMAS=public` |
| H-1 | `auth` | `GOTRUE_DISABLE_SIGNUP=true` (already set on production, checked 24 Oct) |
| GT-1 | `auth` | As on staging: `GOTRUE_PASSWORD_MIN_LENGTH=10`, `GOTRUE_MFA_TOTP_ENROLL_ENABLED=true`, `GOTRUE_MFA_TOTP_VERIFY_ENABLED=true`, `GOTRUE_MFA_MAX_ENROLLED_FACTORS=10`, `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`, `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10`; `GOTRUE_SITE_URL` and the `/auth/reset` URL in `GOTRUE_URI_ALLOW_LIST` (production domains); SMTP for password reset emails: already set on production (Resend, sender info@qirlpl.com, checked 24 Oct), leave as is. Rate limits stay at GoTrue's defaults (not changed on staging either) |
| L-8 | `pdf-service` | `PDF_ALLOWED_ORIGINS=https://<production frontend domain>` |
| DEP-2 | `frontend` | `RAILPACK_NO_SPA=1`, remove `RAILPACK_SPA_OUTPUT_DIR`, start command `node server.mjs` |
| — | `api` | `EXTRA_FRONTEND_ORIGIN` stays unset |

Each setting redeploys its service; wait for **Success**. Copy the exact
values from the staging environment (Railway → staging → service →
Variables), apart from URLs and secrets.

Rollback: set the variable back (each change is one variable).

### 9. Smoke test (15 min)

Operator (terminal, no sign-in):

| Check | Expected |
|---|---|
| `curl -s -o /dev/null -w '%{http_code}' https://<api>/rest/v1/clients?select=id -H "apikey: <anon>"` | 401 |
| Same with `-H "Accept-Profile: storage"` on `/rest/v1/buckets` | 406 |
| `POST /rest/v1/rpc/gen_salt` with the anon key | 404 or 401 |
| `POST /auth/v1/signup` | 403 |
| Frontend response headers | `content-security-policy`, `strict-transport-security`, `x-frame-options` present |

Checker (screen, each with their own login; nothing saved unless stated):

| Check | Expected |
|---|---|
| Director signs in, opens Dashboard, Samples, Test Report Preparation, Issued Test Report, Recycle Bin, Audit Trail | Pages open, no Access Denied |
| QM opens an issued report and prints it | Same as before go-live ("Confirm" remarks on old reports) |
| QM opens a report in preparation | Remarks show "Conforms"; Part D "The Sample Conforms to" |
| QM opens IS Code Master → View Files → View | File opens |
| A testing engineer signs in, opens Samples Under Testing | Opens; Audit Trail not visible |
| Lab Settings → Module Access enforcement | Mode `log` |

Record the result as the validation run of the software change. Approver
signs off.

### 10. After go-live

Lab decisions of 23 Oct 2026 are marked *(lab)*.

| # | When | What | Who |
|---|---|---|---|
| 1 | Go-live day, after step 9 | Switch `files-backup`'s production source from the branch to `main` (Railway → production → files-backup → Settings → Source: branch `main`, root `backend/backup-job`); keep the schedule `30 20 * * *`. The next morning, check the night's run (`railway cron list`) | Operator |
| 2 | First week | Issue the amendments for the 6 issued reports renumbered …AA (SR260716/107-001…006, SR260801/118-001, SR260818/134-001; ISO/IEC 17025 7.8.8) and send them to the customers *(lab: they will be sent)* | QM |
| 3 | Go-live + 14 days | Module access stays in `log` mode for two weeks *(lab)*. Then: review what Enforce would have blocked (Lab Settings → Module Access Enforcement → dry run), fix the rules, switch to `enforce_writes`; one more week, then `enforce`. Each switch with the Director's go-ahead | Director, QM |
| 4 | — | MFA: **not required** *(lab)*. TOTP stays available in GoTrue (GT-1) for anyone who wants it; nothing enforces it | — |
| 5 | Every 90 days | Restore test as `docs/lims-validation/restore-test-B2.md` plus 3 files from the file backup *(lab: OK)*; first one recorded in the LIMS register after go-live (B-2 of 23 Oct), next due by 21 Jan 2027 | Director, QM |
| 6 | Weekly | QM checks the last 7 nightly backup runs and the weekly database backup | QM |
| 7 | After sign-off | Delete the staging environment (`railway environment delete staging`); it also removes the old staging volume and the `railway_pre_dryrun` database. Remove the SSH key `qirlpl-dryrun-mac` (`railway ssh keys remove`) | Operator |

## Rollback

| Failed at | Do |
|---|---|
| 1–2 | Nothing changed. Stop. |
| 3 (merge) | Revert the merge on `main`; Railway redeploys the previous code. |
| 4–7 (database) | Each migration or fix that failed rolled itself back. To undo the ones that ran: Railway → Postgres → Backups → restore `Before go-live <date>` (replaces the database; nothing was entered meanwhile because of the freeze), then revert the merge (old code against old schema). |
| 8 (settings) | Set the changed variable back; the service redeploys. |
| 9 (smoke test) | If the fault is in the code, fix forward on a branch and deploy; if data is wrong, restore the backup as for 4–7. |

The Railway volume restore itself has not been rehearsed yet: record it as
restore test B-2 (`docs/lims-validation/backup-restore-procedure.md`) before
go-live.

## Dry run (23 Oct 2026, 19:20–20:15 IST)

Rehearsed on a fresh copy of production in the staging environment, with
the staging services already on the branch (the state right after step 3).
Production was only read: one read-only `pg_dump` (every session
`default_transaction_read_only=on`), run inside the staging Postgres container
over `railway ssh`; the dump never left Railway and was deleted afterwards.
The copy went into a new staging database that then replaced the old one
(kept as `railway_pre_dryrun`); go-live does not do this swap.

| Step | Result | Time |
|---|---|---|
| Copy | Production 39 MB, dump 3.1 MB, restore 0 errors. Counts equal to production: samples 335, clients 146, staff logins 27, profiles 27, files 385, equipment 489, calibration SRFs 4, audit 11,153, public tables 78. AI switched off and keys cleared in the copy | 3 s |
| Before migrations | Same as production today: `schema_migrations` without RLS; the anon key can write to 71 tables (closed by migration 1) | — |
| 3. New code on the old schema | OQ Director signs in; Dashboard, Sample Receiving, Test Report Preparation, Issued Test Report, IS Code Master, Clients and Calibration SRFs open. Calls to tables that do not exist yet answer 404 and the pages fall back (issued report archive, suppliers, `app_deleted_keys`) | — |
| 4. Migrations 1–49 | All 49 OK, one transaction each, 1.4–2.3 s each. Notices as in the table in step 4 | 87 s |
| 5. Data fixes | All 5 OK on today's production data: duplicate clean-up (clients, units, options, SRF-2026-0001 of Quality Engineering, 8 report numbers to …AA); 103 asset codes; 29 template formulas on 2 equipment; 285 certificate formats on 272 equipment; dummy calibration data (3 SRFs, 5 jobs, 5 raw data sheets). None stopped on a mismatch | 52 s |
| 6. Migrations 35 and 38 again | Report number index added; unique keys 7 added, 37 present, 0 skipped (44 of 44) | 3 s |
| 7. Database checks | RLS on all 142 public tables; no anon write grants; every SECURITY DEFINER function pins `search_path`; no invalid indexes; samples 335, clients 141 (5 duplicates removed), files 385, calibration SRFs and jobs 0; module access mode `log` | — |
| 8. Settings | Already set on staging (same values as the table in step 8) | — |
| 9. Smoke test, signed out | Clients 401, storage tables 406, `rpc/gen_salt` 404, sign-up 403; CSP, HSTS and X-Frame-Options present | — |
| 9. Smoke test, API role tests | 77 of 79. The 2 failures are expected on this copy: B4/B5 count calibration jobs and SRFs, which data fix 5 removed (0); later in the same run G3/G4 created a job and the calibration engineer saw it | — |
| 9. Security checks | 7 of 7 (testing engineer and View-only TM cannot issue a report through the API; sample stays in preparation; storage, pgcrypto closed; engineer cannot delete someone else's file) | — |
| 9. Screen | As the OQ Director: Dashboard, Test Report Preparation, Issued Test Report, IS Code Master, Recycle Bin, Audit Trail open with no failed API call | — |

Database work from the first migration to the end of step 6: about **2.5
minutes**. Seen during the rehearsal and not part of go-live: right after the
database swap the first sign-in failed once ("Database error querying
schema", GoTrue still holding a connection to the replaced database) and
worked on the next try; two network timeouts from the test machine, retried.

The 14 report numbers ending …AA after step 5: the 8 from data fix 1
(QI/REP/20260179AA–20260185AA, 20260296AA; 6 of them issued, so amendments
are needed, step 10) and 6 amendment reports that already existed.

## Dry run 2 (Sunday 25 Oct 2026, 06:40–07:00 IST, go-live day)

Fresh read-only copy of production (40 MB, dump 3.2 MB, restore 0 errors;
samples 336, clients 146, logins 27, files 385, audit 11,773, calibration
SRFs 4: equal to production). Migrations 1–49 all OK in 83 s; notices as in
step 4 (8 duplicate report numbers; unique keys 37 added / 7 skipped;
constraints 74 added / 0 skipped; finance backfill 0). Data fixes 1–6 all OK
on that morning's data (103 asset codes, 29 formulas, 285 certificate
formats, 3 dummy SRFs / 5 jobs / 5 sheets removed, 349 module access rules
for real staff). Migrations 35 and 38 again: report-number index added, 7
keys added, 0 skipped (44 of 44). Checks: RLS on all 142 tables, no anon
write grants, no unsafe functions, no invalid indexes. Smoke test: role tests
77 of 79 (B4/B5 expected, no calibration data after fix 5), security checks
7 of 7, sign-up 403.

Production at 07:00 IST (read only): `main` = 0ba7925 (rollback point); Postgres
backups Daily 24 Oct 05:30 UTC and Weekly 24 Oct 16:51 UTC present; file
backup ran 25 Oct 02:01 IST (44 s); last change in the LIMS 24 Oct 18:32 IST;
no report issued today; 19 samples in report preparation.

## Go-live (Sunday 25 Oct 2026, 07:07–07:25 IST): done

"Go" given by Amit at about 07:05 IST after the go/no-go sheet (all six checks
met).

| Step | Result | Time (IST) |
|---|---|---|
| 1 Backup | Postgres "Before go-live 2026-10-25" (id d04a46b6…, 151 MB); file backup of 02:01 IST, no LIMS changes since | 07:07 |
| 3 Merge | PR qiamit/Qirlpl_Lims_Railway#5 merged; `main` 0ba7925 → 1354cf6; frontend, api, functions, pdf-service deployed (SUCCESS); site 200, bundle uses api.qirlpl.com | 07:08–07:10 |
| 4 Migrations 1–49 | All OK in 84 s; notices as in the dry run (8 duplicate report numbers; keys 37 added / 7 skipped; 74 constraints) | 07:12 |
| 5 Data fixes 1–6 | All OK (35 duplicate clean-up notices; 103 asset codes; 29 formulas; 285 certificate formats; 3 dummy SRFs, 5 jobs, 5 sheets removed; 349 module access rules) | 07:13 |
| 6 Migrations 35, 38 again | Report-number index added; keys 7 added, 37 present, 0 skipped | 07:13 |
| 7 Checks | RLS on all 142 tables; no anon write grants; no unsafe functions; no invalid indexes; samples 336, issued 270, clients 141; calibration SRFs 0; module access `log`; Audit Trail granted to QM and Auditor | 07:14 |
| 8 Settings | rest `PGRST_DB_SCHEMAS=public`; auth password minimum 10, TOTP available, refresh-token rotation (sign-up and SMTP were already set); pdf-service `PDF_ALLOWED_ORIGINS` = the two production frontend Railway URLs (qirlpl.com is built in); frontend `RAILPACK_NO_SPA=1`, `RAILPACK_SPA_OUTPUT_DIR` removed, start `node server.mjs` | 07:15–07:18 |
| 9 Smoke test | Signed out: clients 401, storage tables 406, rpc/gen_salt 404, sign-up 403, brand RPC 200; CSP, HSTS, X-Frame-Options present; sign-in page loads | 07:19 |
| 9 Fix forward | The sign-in page could not load the company logo (signed URL 400): migration 46 had removed anon's storage read that the existing logo policy needs. Migration 50 `20261102101200_storage_public_logo.sql` gives anon read on `laboratory-files/company/%` only; tested on staging first (logo 200, other buckets list nothing), then production (logo 200, no anon write grants) | 07:21–07:23 |
| 10 Backup job | `files-backup` production source = `main`, schedule `30 20 * * *` kept | 07:24 |

Still to do by the lab: sign in with own logins and open Dashboard, a report
and the Audit Trail; the after-go-live list in step 10 above.


## Release 1 after go-live (Sunday 25 Oct 2026, 08:25–08:45 IST): done

Lab requests after go-live, tested on staging first. "Release" approved by
Amit in chat at about 08:24 IST.

| Step | Result | Time (IST) |
|---|---|---|
| Backup | Postgres "Before release DR-NR 2026-10-25" (id 03c78926…, 190 MB referenced) | 08:25 |
| Migration 51 | `20261102101300_decision_rule_not_applied.sql` OK in 1.5 s; DR-NR present (rule type `not_applied`, guard band 0, active); checks: RLS on all 142 tables, no anon write grants, no unsafe functions, no invalid indexes; samples 336, clients 141 | 08:34 |
| Checks before merge | `npm run validate:calculations` 69/69 pass; `vite build` OK; PR checks 5/5 pass | 08:36 |
| Merge | PR qiamit/Qirlpl_Lims_Railway#7 merged; `main` 085341c → cdb17cf; frontend and pdf-service deployed (SUCCESS); files-backup took the new source without running (schedule `30 20 * * *` kept) | 08:37–08:41 |
| Smoke test | www.qirlpl.com 200 (qirlpl.com redirects to it); bundle has the new texts (All tests as per IS, Decision Rule Applied (agreed with customer), not_applied); signed-out clients 401; CSP, HSTS, X-Frame-Options present | 08:42 |

What changed for users: decision rule DR-NR "Not required" (no decision rule
note, banner or U warning on reports; Remarks and the Part D line stay);
Opinions and interpretations hidden in Test Report Preparation for DR-NR;
report signatures follow Print Setting (Tested By = who entered the results,
Approved By = the TM who reviewed them, never the issuer); new SRFs start with
DR-NR and the two decision rule fields are one; consent letter button "All
tests as per IS" builds editable text from the IS code and its clauses.

Still to do by the lab: open one DR-NR report and one consent letter with own
logins and confirm they look right.

## Release 2 after go-live (Sunday 25 Oct 2026, 10:07–10:11 IST): done

Auth fix found while testing the MCP connector on staging (record:
`docs/lims-validation/OQ-08-mcp-connector.md`). Approved by Amit in chat just
before 10:07 IST. The MCP connector itself is **not** in production.

| Step | Result | Time (IST) |
|---|---|---|
| Backup | Postgres "Before GoTrue v2.196.0 2026-10-25" (id e5340602…, 190 MB referenced) | 10:07 |
| Before | Smoke test without sign-in: all pass, GoTrue `v2.174.0` | 10:08 |
| Auth image | `supabase/gotrue:v2.174.0` → `v2.196.0` (production only; staging done 09:50). No migration ran: `auth.schema_migrations` still at `20260625000000` (77 rows). Log: only the deprecation notices for `GOTRUE_JWT_ADMIN_GROUP_NAME` / `GOTRUE_JWT_DEFAULT_GROUP_NAME` | 10:08–10:09 |
| Gateway | PR qiamit/Qirlpl_Lims_Railway#8 (only `backend/gateway/Caddyfile`: auth route passes Railway's `X-Real-IP` to GoTrue as `X-Forwarded-For`) merged; `main` cdb17cf → 77ee65c; api, frontend, pdf-service, files-backup deployed (SUCCESS) | 10:09 |
| Smoke test | GoTrue `v2.196.0`; unknown user sign-in 400 `invalid_credentials`; unknown refresh token 400 (no 500); sign-up 403; anon clients 401; storage schema 406; gen_salt 404; www.qirlpl.com 200 with CSP, HSTS, X-Frame-Options | 10:11 |

Why: GoTrue `v2.174.0` could not refresh any session against the `v2.19x`
auth schema (HTTP 500 `missing destination name oauth_client_id`); no
`token_refreshed` event in production for three days, so users had to sign
in again when the 8-hour token ended. MFA verify always failed
(`mfa_ip_address_mismatch`) because GoTrue saw Railway's internal proxy
address, a different one per request.

Session refresh in production, 10:14 IST: in the built-in browser, with the
existing session of `info@qirlpl.com` (signed in 07:35 IST), at Amit's
request: refresh HTTP 200, same user and session, token valid to 18:14 IST
instead of 15:35 IST; `auth.audit_log_entries` shows `token_refreshed` (the
first in production for days) and `token_revoked` for the rotated token. On
reload the app signed that idle browser session out under its 30-minute
inactivity rule (`logout` 10:14:20), as it would on any load after 30 idle
minutes. MFA in production is not checked (nobody uses it); it was checked on
staging with the same gateway file.

Back-out: auth image back to `supabase/gotrue:v2.174.0` (schema unchanged)
and revert PR #8.

## Release 3 after go-live (Sunday 25 Oct 2026, 10:45–10:53 IST): done

MCP connector and the 60-minute idle sign-out, on the Director's instruction
in chat ("Isko bhi Production par kar do", about 10:44 IST). The connector was
released before the QM review of OQ-08 that the plan foresaw; the QM review
follows (record `docs/lims-validation/OQ-08-mcp-connector.md`).

| Step | Result | Time (IST) |
|---|---|---|
| Backup | Postgres "Before MCP connector release 2026-10-25" (id 5cdebe4c…, 190 MB referenced) | 10:45 |
| Migration 52 | `20261102101400_mcp_connector.sql` OK (1.5 s); `lab_settings.mcp_enabled` = false; `mcp_*` tables present; `write_audit_log` writes reason "via MCP" for connector requests; checks: RLS on all 145 tables, no anon write grants, no unsafe functions, no invalid indexes | 10:45 |
| Service `mcp` | Variables (internal REST and GoTrue addresses, `SERVICE_ROLE_KEY` as a reference to the functions service, new `MCP_ENC_KEY`, `PUBLIC_URL` = Railway address); domain `mcp-production-ff60.up.railway.app`; custom domain `mcp.qirlpl.com` added (waits for DNS); frontend `VITE_MCP_URL` | 10:46–10:47 |
| Merge | PR qiamit/Qirlpl_Lims_Railway#9 merged; `main` 77ee65c → 75aa12b; then `mcp` source = `main`, `backend/mcp-server` | 10:47–10:48 |
| Deploy | `mcp` and frontend SUCCESS (75aa12b) | 10:48–10:52 |
| Checks | MCP without login: health, OAuth metadata, 401 without token, foreign redirect refused, Claude client registers, sign-in page, unknown login refused (logged in `mcp_calls`). Frontend bundle: idle sign-out 60 min, warning 58 min, AI Settings "MCP Connector On" and the address. Smoke test without sign-in: all pass | 10:48–10:53 |

Still to do:

1. Done 25 Oct 11:00–11:15 IST (Amit signed in to Zoho Domains in the
   built-in browser and asked for the records): Zoho DNS for qirlpl.com gained
   CNAME `mcp` → `gstml02g.up.railway.app` and TXT `_railway-verify.mcp`
   (no other record changed); Railway verified the domain and issued the
   certificate; `mcp` `PUBLIC_URL` = `https://mcp.qirlpl.com`, frontend
   `VITE_MCP_URL` = `https://mcp.qirlpl.com/mcp`, both redeployed; the no-login
   MCP checks and the smoke test pass on `https://mcp.qirlpl.com`.
2. The Director switches the connector on (Lab Settings → AI Settings →
   General Setting → 04), connects from Claude with their own login and tries
   a read and a change; then checks the change shows "via MCP" in the Audit
   Trail.
3. QM review of OQ-08.

## Release 4 after go-live (Sunday 25 Oct 2026, 18:18–18:25 IST): done

Results review guard (migration 53), approved by Amit in chat. Staging record:
`docs/lims-validation/results-review-guard-test.md`.

| Step | Result | Time (IST) |
|---|---|---|
| Backup | Postgres "Before migration 53 results review guard 2026-10-25" (id ba888c69…, 191 MB referenced) | 18:18 |
| Before | 26 rows under review (all on samples already issued, older data); none with the reviewer equal to the tester | 18:19 |
| Migration 53 | `20261102101500_results_review_guard.sql` OK (1.4 s); trigger `tap_verify_review_rules` after `tap_stamp_result_entry`; function not callable by users; checks: RLS on all 145 tables, no anon write grants, no unsafe functions, no invalid indexes | 18:19 |
| Checks (rolled back) | On a result of a sample not yet issued, put under review inside the transaction: QM (not the assigned reviewer) approving refused; tester changing the result refused (locked); tester approving refused; assigned TM approving allowed. 4 of 4; nothing changed | 18:22 |

No frontend change: the screens already lock a section sent for review and
show the database message when an approval is refused.

## Release 5 after go-live (Monday 26 Oct 2026): done

Enter Results: equipment / CRMs used and raw data files optional (lab
decision 26 Oct, until the equipment records are complete); approved by Amit
in chat.

| Step | Result |
|---|---|
| Change | `SectionResultsEntryDialog.tsx`: no equipment needed to save; chosen equipment must still be usable on the test date (Director override as before); heading "optional". `TestResultsEntryCell.tsx`: result box fits its column (the calculator no longer sits under "Select equipment"). Raw data files were already optional. No database change |
| Staging | Built and deployed 2d1f8f4 (one rebuild after a Railway build-machine error) |
| Merge | PR qiamit/Qirlpl_Lims_Railway#18; `main` ec3df75 → 82865bf; mcp, frontend, api, pdf-service, files-backup SUCCESS |
| Checks | Production bundle: the old "Select the equipment / CRMs used…" block is gone, the "Not usable on the test date" check is present, the result box class is the new one; smoke test and MCP checks pass |

Not checked on screen by Claude: saving a real result without equipment
(production data; the staging test login could not be used). The lab checks
it with the next result entry.

Validation note (ISO/IEC 17025 6.4, 7.5.1): while equipment is optional the
equipment used for a result may not be recorded in the LIMS; the lab records
it on the worksheet until the equipment records are complete, then the
requirement can be switched back on (one condition in `handleSaveClick`).

## Release 6 after go-live (Monday 26 Oct 2026): done

Report signatures follow each person's Print Setting row (lab report: changes
in Print Setting → Signatories had no effect on the preview); approved by Amit
in chat.

| Step | Result |
|---|---|
| Cause | All "Tested By" rows were merged into one slot (union of parts) and filled with the people who entered the results, so a person's own row (Rajat: no part) was ignored |
| Change | `reportSignatories.ts`: a person with their own row prints with that row's role and parts, not at all when it is off or has no part; others with the role's parts; Print Setting order; issuer never printed (unchanged). Print Setting note updated. Validation suite 70/70 (new SG-02) |
| Staging | Deployed 1ccdeb0 |
| Merge | PR qiamit/Qirlpl_Lims_Railway#19; `main` 82865bf → 8d37643; mcp, frontend, api, pdf-service, files-backup SUCCESS |
| Checks | Production bundle has the new note (old one gone); smoke test and MCP checks pass. With today's production Print Setting a report prints Tested By Vishal (after Part D) and Approved By Kunal (after A, B, D); Rajat is not printed |

Not checked on screen by Claude (production data); the lab checks the next
report preview.

## Release 7 after go-live (Thursday 29 Oct 2026): in progress

NABL scope per result (migration 54) and the Enter Results layout; approved
by Amit in chat ("Haan, dono bhejo"; then "update karke batao").

| Step | Result |
|---|---|
| Change | Enter Results: NABL Scope dropdown for a NABL parameter ("NABL" / "Non NABL", same words as the Test Parameter master; a Non NABL parameter cannot be made NABL); report rows and retest use the result's scope. Equipment: icon button opens a table picker (search, checkboxes), then a View button (click = view, double-click = edit); column heading "Equipment", 7rem. Result cell: "Calculator \| Attach" as words under the box; "Entered by" line moved to the Attach hover text (still recorded) |
| Backup | A new manual backup was refused (Railway plan limit of 10 backups per volume). Went ahead on the daily backup of 29 Oct 11:00 IST (`76e9f433`): the migration only adds an empty column and changes the lock rule; undo is dropping the column, not a restore. No backup deleted |
| Migration | 54 `20261102101600_result_nabl_scope_override.sql` applied 13:42 IST (1.4 s); checks: RLS on all tables, no SECURITY DEFINER without search_path, no anon write grants, no invalid indexes |
| Guard check | Rollback only on a real non-completed row: value "NABL" refused; tester may mark own result Non NABL; tester cannot change it under review; Director can. 4/4, row unchanged, 0 of 6,246 rows with an override |

