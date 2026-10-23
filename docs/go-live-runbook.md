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
for f in 20261023_duplicate_cleanup.sql 20261023_equipment_asset_codes.sql 20261023_calibration_template_formulas.sql 20261023_certificate_notes.sql 20261023_calibration_dummy_data.sql; do
  echo "== $f"; psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f "backend/supabase/data-fixes/$f" || break
done
```

Always with `--single-transaction`: `20261023_duplicate_cleanup.sql` switches
the issued-sample guard off and on around its changes; outside one
transaction a failure would leave the guard off.

Each fix checks every record by id and value first and stops without
changing anything on a mismatch (P2).

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
| H-1 | `auth` | `GOTRUE_DISABLE_SIGNUP=true` |
| GT-1 | `auth` | As on staging: `GOTRUE_PASSWORD_MIN_LENGTH=10`, `GOTRUE_MFA_TOTP_ENROLL_ENABLED=true`, `GOTRUE_MFA_TOTP_VERIFY_ENABLED=true`, `GOTRUE_MFA_MAX_ENROLLED_FACTORS=10`, `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`, `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10`; `GOTRUE_SITE_URL` and the `/auth/reset` URL in `GOTRUE_URI_ALLOW_LIST` (production domains); SMTP for password reset emails (production mail settings; staging has it off). Rate limits stay at GoTrue's defaults (not changed on staging either) |
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

1. Issue amendments for the 6 reports renumbered …AA (SR260716/107-001…006,
   SR260801/118-001, SR260818/134-001; ISO/IEC 17025 7.8.8).
2. Module access stays in `log` mode for two weeks; review the denials, then
   `enforce_writes`, then `enforce`.
3. Directors enrol TOTP MFA.
4. Record a restore test (B-2) within a week.
5. Delete the staging environment once production is signed off
   (`railway environment delete staging`).

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
