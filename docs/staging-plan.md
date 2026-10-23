# Staging copy on Railway: plan

Goal: test everything on the branch `claude/priceless-ramanujan-5f501a`
(39 new migrations plus the frontend, gateway, functions and PDF changes)
against a copy of real production data, with real logins for every role,
before anything touches production. Nothing in this plan has been done yet;
each step marked **(approval)** changes Railway and needs Amit's go-ahead.

## What production looks like today

Project `Qirlpl_Lims_Railway`, one environment (`production`), 10 services:
`frontend`, `api` (Caddy gateway), `auth` (GoTrue), `rest` (PostgREST),
`storage-api`, `functions`, `pdf-service`, `Postgres` (volume, 148 MB),
`lims-storage` (MinIO, volume ~240 MB), `Resend Starter`.
Cost last billing period: **$12.37** (mostly memory). Daily and weekly
Postgres volume backups are on since 22 Oct 2026.

## Cost

A staging environment runs a second copy of the same 10 services. With light
testing traffic it costs about the same per day as production:
roughly **$0.40 per day, $6–8 for two weeks**. Deleting the environment after
sign-off stops the cost. No plan change is needed.

## Risks this plan guards against

| Risk | Guard |
|---|---|
| Staging frontend talks to the production API | `VITE_SUPABASE_URL` and `VITE_PDF_SERVICE_URL` are build-time values copied by the duplicate; override them on the staging frontend before its first build. Check the built bundle does not contain `api.qirlpl.com`. |
| A staging login token works in production (same JWT secret) | Generate a new JWT secret for staging and new anon/service keys signed with it; set them on `auth`, `rest`, `storage-api`, `functions`, `api`, `pdf-service` and the frontend. |
| Staging sends emails to real customers | Remove `RESEND_API_KEY` on staging `functions` (email then reports "not configured"), or point it at a test sender only Amit receives. |
| Staging calls AI providers with client data | After the data copy, set AI mode to Off in staging Lab Settings (or clear `ai_models.api_key`). |
| Staging writes to production files | Staging `storage-api` must use the staging MinIO (`lims-storage` in the staging environment), which the duplicate wires through `${{...}}` references. Verify its endpoint variable. |
| CORS blocks the staging frontend | Set `EXTRA_FRONTEND_ORIGIN=<staging frontend URL>` on the staging `api` service (new gateway setting on the branch; unset in production). Set `PDF_ALLOWED_ORIGINS` on staging `pdf-service`. |
| Production data copied to staging leaks | Staging gets Railway-generated domains only, no custom domain; share its URL only with testers; delete the environment after sign-off. |

## Steps

### A. Prepare (no Railway changes)

1. Push the branch to GitHub (`git push origin claude/priceless-ramanujan-5f501a`) **(approval: publishes code to the repository, not to production)**.
2. Agree the tester list: one login per role (Laboratory Director, Quality Manager, Technical Manager mechanical/chemical, Testing Engineer, Sample Incharge, Receptionist, finance user).

### B. Create the environment (approval)

```bash
railway environment new staging --duplicate production
```

This copies all 10 services and their variables (not data, not custom domains).

Then, before anything deploys from the branch:

1. Point the repo services (`frontend`, `api`, `functions`, `pdf-service`) at branch `claude/priceless-ramanujan-5f501a` in the staging environment (service settings → source → branch).
2. Rotate staging secrets (JWT secret, anon and service-role keys) as in the risk table.
3. Override `VITE_SUPABASE_URL`, `VITE_PDF_SERVICE_URL` on staging `frontend` to the staging `api` and `pdf-service` domains.
4. Remove `RESEND_API_KEY` on staging `functions`.
5. Set `EXTRA_FRONTEND_ORIGIN` on staging `api` and `PDF_ALLOWED_ORIGINS` on staging `pdf-service` to the staging frontend URL.
6. Serve the staging frontend through `node server.mjs` so the security headers and CSP are tested too (production DEP-2): set `RAILPACK_NO_SPA=1`, remove `RAILPACK_SPA_OUTPUT_DIR`, start command `node server.mjs`. (Railpack otherwise serves Vite apps with its own Caddy and ignores the start command.)
7. Configure GoTrue on staging as planned for production: `GOTRUE_DISABLE_SIGNUP=true`, password minimum 10, MFA TOTP enabled, refresh-token rotation, rate limits, `GOTRUE_SITE_URL` and the `/auth/reset` URL in the allow list, and SMTP pointing at a test mailbox.

### C. Copy production data into staging (approval)

1. Take an on-demand production backup first.
2. Database: run `pg_dump` against production (read-only dump through the TCP proxy) and restore into the staging Postgres with `pg_restore`, from a one-off shell inside the staging Postgres service (`railway ssh --service Postgres --environment staging`), so the dump never leaves Railway. The dump includes the `auth` schema, so the same staff logins and passwords work in staging.
3. Files: mirror the production MinIO bucket into the staging MinIO with the MinIO client (`mc mirror prod/<bucket> staging/<bucket>`), run from a one-off shell in the staging `lims-storage` service.
4. Check row counts per table and a few file downloads against production.

### D. Apply the migrations on staging (approval)

Apply the 37 migrations in the order listed in `docs/audit-gap-closure-plan.md`, one transaction each, recording the output. After each group, run the read-only checks from the security report on staging. Expected notices are documented in each migration header (for example: equipment with an open breakdown goes Out of Service; module access starts in log mode).

### E. Test (about 1–2 weeks of part-time testing)

1. Run `docs/lims-validation/OQ-test-scripts.md` (OQ-01…OQ-07) with each role's login and record results in the Validation Runs register on staging.
2. Run `npm run validate:calculations` and import its evidence JSON into Validation Runs.
3. Specific checks that could not be done offline:
   - report issue with password, archive, re-print (archived and regenerated), amendment;
   - calibration SRF due-date flag, certificate issue, amendment;
   - soft delete and Recycle Bin restore;
   - module access in log mode, then `enforce_writes`, then `enforce`, each role still able to do its daily work;
   - finance: browser-record sync, backfill, new invoice numbering, cancel keeps number, GST split, TDS on receipts;
   - login: forgot password email to the test mailbox, Director reset, idle logout, MFA enrolment;
   - CSP: no violations in Chrome DevTools on every main screen, prints still open the print dialog;
   - PWA install on Android and iPhone, layouts on phone and tablet.
4. Log every defect as an IT incident or a software change on staging; fix on the branch; staging redeploys from the branch automatically.

### F. Go-live (approval)

1. Fresh production backup.
2. Merge the branch to `main` (deploys the frontend, gateway, functions and PDF changes; all of them work before the migrations).
3. Apply the 39 migrations to production in the same order, while the lab is idle.
4. Apply the Railway settings tested on staging (GoTrue, `GOTRUE_DISABLE_SIGNUP`, `PDF_ALLOWED_ORIGINS`, frontend start command).
5. Smoke-test with the Director login; leave module access in log mode for two weeks before enforcing.
6. Delete the staging environment once production is signed off.

### Rollback

- Staging: `railway environment delete staging` removes everything it created.
- Production: each migration header lists what it changes. If a migration has to be undone wholesale, restore the volume backup taken in F.1 (Railway → Postgres → Backups → Restore; this replaces the current data, so anything entered after the backup is lost).

## Status (23 Oct 2026)

**A. Done.** Branch `claude/priceless-ramanujan-5f501a` pushed to GitHub (no secrets in the diff; `main` untouched, so production did not deploy).

**B. Done.** Environment `staging` (`47a210ca-525b-4796-95b5-50ee4198bf19`) created by duplicating production, with the safeguards set at creation time:

| Safeguard | State |
|---|---|
| JWT secret, anon and service-role keys | New for staging on auth, rest, storage-api, functions, pdf-service and frontend (not the production values) |
| Email | GoTrue SMTP host/password set to `disabled-in-staging`; `RESEND_API_KEY` empty on functions and disabled on Resend Starter |
| API and site URLs | Frontend → `https://api-staging-64cf.up.railway.app` and `https://pdf-service-staging-28ae.up.railway.app/pdf`; GoTrue external URL, site URL and allow list → staging domains; checked that the built bundle contains no `api.qirlpl.com` |
| CORS | Gateway `EXTRA_FRONTEND_ORIGIN=https://frontend-staging-1898.up.railway.app` (preflight from it allowed, from other origins not); `PDF_ALLOWED_ORIGINS` set on staging pdf-service |
| File storage | storage-api points at placeholders (`disabled-in-staging`), so staging can never reach the production bucket. Wire a staging bucket in step C. |
| Sign-up | Blocked (gateway 403, `GOTRUE_DISABLE_SIGNUP=true`) |
| GoTrue hardening | Password minimum 10, TOTP MFA enabled, refresh-token rotation on |
| Security headers | Staging frontend served by `node server.mjs`: CSP without `'unsafe-inline'`, HSTS, X-Frame-Options; no CSP violations on /home |
| Production | Variables, start command and deployments unchanged (checked after each step) |

Staging URLs: frontend `https://frontend-staging-1898.up.railway.app`, API `https://api-staging-64cf.up.railway.app`.

**C. Done.** Production data copied into staging; production only read.

| Item | State |
|---|---|
| Backup | On-demand production backup "Before staging copy 2026-10-23" taken first |
| Database | Read-only `pg_dump` of production (transaction read-only, through the TCP proxy) restored into staging Postgres by a temporary staging-only service. Counts match production: samples 335, clients 146, quotations 3, staff logins 27, user profiles 27, audit log 10,256, equipment 489, 78 public tables, 9 storage buckets, 385 file records |
| Files | Staging has its own bucket instance (`qirlpl-lims-storage-92rz-k`; production is `…-bf0ydy`), wired to staging storage-api. All 453 production objects (518.8 MiB) copied with `rclone copy`; `rclone check`: 0 differences. A file download through the staging API works |
| Passwords | Staging services no longer use production database passwords: auth and storage-api use staging Postgres references, and the `authenticator` role has a staging-only password. Staff logins are the copied ones, so the same staff passwords work on staging |
| AI | Off in staging (`ai_enabled=false`, provider API keys cleared), so staging never sends client data to an AI provider |
| Clean-up | The temporary copy service (which held production credentials) is deleted |
| Production | No deployment after 22 Oct, bucket still 453 objects, services unchanged |

Staging auth, rest, storage and frontend all respond.

**D. Done (with findings).** All 37 migrations applied to staging in the planned order, one transaction each, in six groups (1–3, 4–10, 11–19, 20–27, 28–33, 34–37), each group followed by checks. None failed.

| Check | Result |
|---|---|
| Data | Unchanged after every group: samples 335, clients 146, staff logins 27, files 385, equipment 489 |
| RLS | On for every public table (`schema_migrations` was the only table with RLS off; migration 1 turned it on) |
| `anon` | Had INSERT/UPDATE/DELETE/TRUNCATE grants on 71 tables before; none after migration 1 |
| SECURITY DEFINER functions without `search_path` | None |
| Invalid indexes | None |
| Equipment (migration 22) | No open breakdowns, so no equipment changed status |
| Module access (migration 26) | Mode `log`; nothing is blocked |
| Finance backfill (migration 30) | 0 documents copied (production has no sale documents yet) |
| Report numbers (migration 35) | 8 report numbers are on two samples each (for example QI/REP/20260179A on SR260611/76-005S and SR260716/107-001), so the unique index was skipped and no number was changed. These need a decision before go-live |
| Re-run | Running all 37 a second and third time succeeded. The second run added a restrictive known-staff policy to 8 internal tables (soft_delete_tables, auth_events, finance_backfill_log and module-access tables); the third run changed nothing |
| App | 104 menu pages opened as the Laboratory Director (nothing saved): 401 API calls, no page crashed. Only error: `rpc/app_deleted_keys` returns 400 on 18 pages (see below) |
| Production | Not changed; one read-only catalog query (below) |

**Finding: production schema has drifted from the repository.** A read-only query on production shows 1 unique constraint and 7 unique indexes in `public`, while the migrations in the repository create unique keys on business numbers (for example `equipment_master.asset_code`, `customer_complaints.complaint_id`, `nc_work_records.nc_id`, `mrm_plans.plan_code`, `gr_objectives.objective_id`). Production has none of these. The staging copy matches production, so the restore was faithful. Effects, all present in production today:

1. Seven saves use an upsert on a column without a unique key and fail with error 42P10 ("no unique or exclusion constraint matching the ON CONFLICT specification"): new client (`clients.company_name`), equipment and IQC bulk save (`asset_code`), calibration SRF (`srf_number`), management documents (`level, doc_number`), products and services (`item_code`), audit NC action (`checklist_item_id`).
2. Nothing stops two records getting the same asset code, complaint ID, NC ID, SRF number or plan code.
3. Soft delete's "numbers of deleted records are not reused" guard (`app_deleted_keys`) refuses columns without a unique key, so on 18 pages it returns 400 and the app falls back to visible rows only.

**Fix: migration 38, `20261102100000_unique_key_reconciliation.sql`** (applied on staging 23 Oct). It compares against the 44 unique keys the repository defines but production lacks (samples.test_report_number stays with migration 35). For each one it adds the key under the repository's name, unless the key is already there, the table or column is missing, or the rows hold duplicates, in which case it lists the duplicate values and skips that key. Nothing is renamed or deleted. Tested on a drifted PGlite copy (keys dropped, duplicates seeded: added, skipped with a list, second run a no-op, an equal index under another name recognised) and on staging:

| Result on staging | |
|---|---|
| Added | 37 keys, for example complaint ID, NC ID, plan code, GR register IDs, audit ID, consent letter no., IQC asset code, management documents (level, doc number), product item code, audit NC action |
| Skipped: duplicates in the data | `equipment_master.asset_code` 92 codes on 187 records (for example QI-EQ-0001 on four instruments, QI/CVL/TS-18…30 twice each); `equipment_for_calibration.asset_code` 8 codes (QI/INS/14, 23, 25, 27, 33, 39, QI/DBC-03, QI/DTM-02); `clients.company_name` 4 names (Beamex ×3, Fortune Metaliks Limited, Mitlhard, Quality International Research & Laboratories Private Limited); `calibration_service_requests.srf_number` SRF-2026-0001 ×2; `test_parameter_units.name` (µm ×6, mm, °C, Joule); `client_master_options` 6 labels (pin codes 401404, 110012, 422010; South Korea; Murbad; Odisha); `nabl_scope_lookups` Paver Blocks ×2 |
| Second run | 0 added, 37 present, 7 skipped |
| Saves (ON CONFLICT check, rolled back) | IQC master, management documents, products and services, audit NC action now work. New client, equipment master bulk save and calibration SRF still fail with 42P10 until their duplicates are cleaned |
| Pages | `app_deleted_keys` errors gone on 14 of 18 pages; still on equipment for calibration, IQC (it also reads equipment master codes), calibration SRF and calibration equipments |
| Checks | Data unchanged, RLS on everywhere, no `anon` write grants, no invalid indexes |

To finish: the lab cleans the listed duplicates (give each instrument its own asset code, merge or rename the duplicate clients, units, options and SRF), then migration 38 is run again and adds the remaining 7 keys. PGlite regression: 37 of 38 suites pass; the safe-expression parity suite differs from the old evaluator only on ROUND/MROUND (51 cases), which is the intended IS 2 rounding change.

**Duplicate cleanup (lab decisions 23 Oct, applied on staging).** Script `backend/supabase/data-fixes/20261023_duplicate_cleanup.sql`, one transaction, every record checked by id and value before it is touched (a mismatch rolls everything back), safe to re-run, every change in `audit_log` with its reason:

| Decision | Done on staging |
|---|---|
| Beamex, Mitlhard: remove the copies | First record of each kept; 2 Beamex and 1 Mitlhard removed (nothing was linked) |
| Fortune Metaliks: keep GST 22AABCF3202D2ZL | 1 sample and 1 consent letter moved from the record with GST 0322AABCF3202D2ZL, which was then removed; the kept record has 3 samples |
| QIRLPL: keep the record with GST | 2 equipment records (external calibration agency) moved from the record without GST, which was then removed |
| Units: keep one | 8 exact copies of °C, Joule, mm, µm removed (units are stored as text elsewhere) |
| SRF-2026-0001 of Quality Engineering: remove | SRF, its 3 calibration jobs (calibration conduct, no certificate) and 3 raw data sheets removed; BR Stainless keeps SRF-2026-0001 |
| Report numbers: amendment number | The report issued first keeps its number; the other sample of each pair gets …AA (the app's Amendment Report format; its ULR already ends -R2): SR260716/107-001…006 → QI/REP/20260179AA…20260184AA, SR260801/118-001 → QI/REP/20260185AA, SR260818/134-001 → QI/REP/20260296AA |
| Client options, Paver Blocks: keep one | 7 exact copies in the client option lists (South Korea, Murbad, Odisha, PIN 110012, 401404 ×2, 422010) and 1 Paver Blocks NABL lookup removed; the first entry of each kept. Option lists are not in the audit trail by design (dropdown lists); the NABL lookup removal is |
| Equipment asset codes | Not changed: different instruments; the lab updates the codes in the app |

Issued samples are frozen by `samples_guard_issued_update` unless a Laboratory Director is signed in. The script switches that one trigger off inside its own transaction and back on at the end, instead of running under a Director's identity (which would put their name on the audit rows).

Afterwards migration 35 added `samples_test_report_number_uidx`, and migration 38 added 5 more keys (client name, unit name, SRF number, client options, NABL lookups): 42 of 44 now present. Still skipped: `equipment_master.asset_code` and `equipment_for_calibration.asset_code`, until the lab updates the codes; then migration 38 runs again. Saves: new client and calibration SRF now work; only the equipment master bulk save still fails (42P10). `app_deleted_keys` errors remain only on the 3 equipment pages.

Before production: the 6 issued reports that now carry …AA were sent to customers with the old number, so each needs an amendment issued through the app (ISO/IEC 17025 7.8.8). On production the script runs after a fresh backup, followed by migrations 35 and 38.

**Foreign keys and CHECK rules: migration 39, `20261102100100_constraint_reconciliation.sql`** (applied on staging 23 Oct). Besides the unique keys, production lacked 74 rules the repository defines (none present under another name): 12 foreign keys from user columns (created_by, user_id, …) to `auth.users`, and 62 CHECKs (allowed status / type values, ranges such as GST rate 0–100 and planned-from ≤ planned-to, non-empty text). Before adding them: no existing staging row breaks any of them, and for every value list the app's own option list for that field is identical (the 4 fields without an option list are not written by the app, or only left empty). The user foreign keys do not change user deletion: the delete-user function removes the profile before the login. Like migration 38, a rule that existing rows break is listed with the rows and skipped.

| Result | |
|---|---|
| PGlite (rules dropped, bad rows seeded) | 71 added; the 3 rules with bad rows skipped with the offending rows listed; second run a no-op |
| Staging | 74 added, 0 skipped; second run 0 added. Staging now has 138 foreign keys and 328 CHECKs (repository: 137 and 328) |
| Checks | Data unchanged, RLS on everywhere, no `anon` write grants; 15 affected pages open without errors (apart from the known equipment code error on IQC); PGlite regression unchanged (37 of 38, safe-expression parity differs only on IS 2 ROUND/MROUND) |

Saves into these tables still need step E testing with real logins; a value outside a list is now refused with error 23514 instead of being stored.

Also seen: after a deploy, a browser tab that was already open shows a blank page when it opens a screen whose code file changed (the old file name returns 404, "Failed to fetch dynamically imported module"), until the page is reloaded. Every build embeds its commit, so every deploy renames all screen files. Fixed on the branch (`frontend/src/lib/reloadOnStaleChunk.ts`): on `vite:preloadError` the page reloads once, with a 30-second guard so a file that is really missing cannot cause a reload loop. Tested on staging, 23 Oct: a tab on the build before the fix stayed blank on Sampling Plans after a deploy (bug reproduced); a tab on the fixed build (387fe93), after the next deploy (ba7ab9a), reloaded once by itself and showed Sampling Plans from the new build, still signed in and on the same address; a second error 15 seconds later did not reload again.

**E. Started (23 Oct).** Automated part done on staging (version b1b64af):

| Check | Result |
|---|---|
| `npm run validate:calculations` | 54 of 54 cases pass (evidence JSON in `frontend/scripts/validation/out/`, to be imported into LIMS Validation Runs) |
| 105 menu pages at 375 px width, plus 5 Lab Settings pages | No horizontal overflow, 0 CSP violations, no script errors; only the known `app_deleted_keys` error on the 3 equipment pages |
| PWA | Manifest (standalone, 192/512 icons incl. maskable), service worker, offline page served |
| Dashboard | Loads in roughly 4–11 s on staging |

Equipment asset codes: the duplicates came from the Calibration Equipments page, which worked out the next code from the list loaded with the page; autosave inserts without reloading it, so the next new form got the same code (pairs created a minute apart). Fixed (b1b64af): the next code is read from the database when the form opens, counting testing equipment too; verified on staging (request made on open, next code QI-EQ-0196, nothing saved). A suggestion sheet gives each duplicate a new code (95 in equipment master, 8 in equipment for calibration; the record linked to jobs / masters / breakdowns, else the oldest, keeps its code); after the lab approves it, the codes are applied on staging, then at go-live (re-checked against codes created meanwhile).

Manual part: the tester guide (test accounts per role created by the Director in staging, OQ-01…07, further checks, recording in LIMS Validation Runs) is shared with the lab.

Next: lab runs the OQ scripts; equipment code approval.

Notes for go-live: when the roles are restored, `ALTER ROLE postgres` must be skipped (it would overwrite the target's own password); a storage-api that starts on an empty database creates its own `storage` schema, which then blocks the restored one.
