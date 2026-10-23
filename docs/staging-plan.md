# Staging copy on Railway: plan

Goal: test everything on the branch `claude/priceless-ramanujan-5f501a`
(40 new migrations plus the frontend, gateway, functions and PDF changes)
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
3. Apply the 49 migrations to production in the same order, while the lab is idle.
4. Apply the Railway settings tested on staging (GoTrue, `GOTRUE_DISABLE_SIGNUP`, `PDF_ALLOWED_ORIGINS`, frontend start command, rest `PGRST_DB_SCHEMAS=public`).
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

Equipment codes applied on staging (lab accepted the suggestions): `backend/supabase/data-fixes/20261023_equipment_asset_codes.sql` gives 95 equipment master and 8 equipment-for-calibration records their new codes (each checked by id and old code, new code must be free; second run changes nothing; every change in `audit_log` with its reason). Other records refer to equipment by id, not by code (one calibration job and one SRF mention a changed record, by id only), so nothing else changes. Migration 38 then added both asset code keys: **44 of 44 unique keys present**. All 7 upsert saves now work, and `app_deleted_keys` returns 200 on every equipment page.

At go-live the order is: merge (new asset code generator), migrations, `20261023_duplicate_cleanup.sql`, `20261023_equipment_asset_codes.sql`, `20261023_calibration_template_formulas.sql`, `20261023_certificate_notes.sql`, `20261023_calibration_dummy_data.sql`, then migrations 35 and 38 again. If equipment is added on production before then, a suggested code may already be taken; the script then stops without changing anything and the list is regenerated.

**API role tests (23 Oct).** Ten test accounts on staging (`oq.<role>@qirlpl.test`: Director, QM, TM mechanical, testing engineers mechanical and electrical, calibration engineer thermal, calibration TM electrical, sample incharge, receptionist, auditor), created the way the app's create-user function does it, each given the module access rules of a real colleague in the same role. A script signs in as each one through the staging API and works through the rules the database enforces. Result: **70 of 72 checks pass**; test records are named `OQ TEST` / `OQTEST` and stay on staging (they also used invoice numbers INV-2026-0001…0004 and one validation run there).

| Area | Checked | Result |
|---|---|---|
| Sign-in | all 10 accounts; wrong password; self sign-up; TOTP enrolment; signed-out access | Pass |
| What each role sees | samples, clients, allocations, calibration SRFs and jobs, equipment, quotations, complaints, NC, documents, audit trail | Pass (engineers cannot read the audit trail) |
| Sample to report | client, SRF (duplicate refused), allocation, test, results, issue with password (issuer stamped), issued sample locked, issuer cannot be changed, archive cannot be changed or deleted, issued sample cannot be deleted | Pass |
| Recycle Bin | Director deletes, SRF number not reused, restore | Pass |
| Audit trail | entries present, hidden from engineers, cannot be edited | Pass |
| Declarations | sign, one per year, no edits, others cannot see, Director sees | Pass |
| Calibration | SRF with due-date flag, job, engineer sees it, unknown stage refused | Pass |
| Finance | invoice numbering, duplicate refused, delete = cancel keeping the number, next number new, engineer cannot invoice, GST intra (Chhattisgarh) / inter (Maharashtra) | Pass |
| Change control | approve, deploy refused before validation, validation result cannot be changed, deploy after a passed run | Pass |

The 2 failures: F1 failed only on the second run (the account had already signed its 2026 declaration in the first run, which is the rule working). **D1: a testing engineer can delete a sample that is not issued.** It goes to the Recycle Bin (the Director can restore it) instead of being lost as in production today, and Enforce mode would still allow it, because in Module Access every testing engineer has Edit on Sample Receiving. OQ-04 step 2 expects engineers not to be able to delete: either set Sample Receiving to View for engineers in Module Access, or restrict sample deletion in the database to the Director, Quality Manager and Sample Cell.

Real staff, simulated on the database (all 27 profiles, in transactions that were rolled back): 26 are recognised as staff and see the lab's records. The Workshop Incharge has no module access rules and sees nothing (the same rule already applies on production). Every module access rule is per user, so a new employee sees nothing until the Director sets their Module Access.

**D1 resolved (lab decision 23 Oct): migration 40, `20261102100200_sample_delete_roles.sql`.** A trigger lets only the Laboratory Director, the Quality Manager and Sample Cell staff (Receptionist, Sample Incharge) delete a sample; anyone else gets "Only the Laboratory Director, the Quality Manager or Sample Cell staff can delete a sample (SRF)". Deletes stay soft (Recycle Bin), issued samples stay Director-only, scripts without a signed-in user and cascades are not affected. PGlite: 7 of 7 cases; staging (applied twice): API role tests 78 of 79, with engineers (mechanical, electrical), technical manager, calibration engineer and auditor refused and sample incharge, receptionist, QM and Director allowed (the one failure is the declaration test repeating on the same account, the one-per-year rule working). PGlite regression unchanged.

Next: lab runs the OQ scripts with these accounts (the Director resets each password in Lab Settings → User Management and hands it over).

**OQ-01 and OQ-02 run on the staging screens (23 Oct, frontend code as b1b64af, test accounts per role).** Test records: sample SR261023/217-001 (report QI/REP/20260357A, issued), calibration SRF-2026-0004 and SRF-2026-0005, client `Oq Test Client 1`; all stay on staging.

| OQ-01 step | Result |
|---|---|
| 1–2 SRF, client required | P: number given automatically; save disabled without a client |
| 3 Allocation | P: allocation and test allocation; the authorization matrix asked for a reason (engineer not on the matrix) |
| 4 Results | P: average 570.20, s = 0.10 as worked by hand; equipment In Repair blocked (no overdue equipment exists on the copy to try) |
| 5 Submit | P: after submission the engineer sees the results read-only |
| 6 Review | P: remark "Confirm" matches the hand result; decision rule DR-GB shown |
| 7 Report | P: report number with A, ULR TC1544226000000400F (19 characters), pages "01 of 03", NABL 133 scope warning |
| 8–9 Issue | P: wrong password refused; correct password issues, issuer OQ Quality Manager stamped, archive with SHA-256 that verifies |
| 10 Re-print | P: printed from the archived copy; old client address kept after the master change |
| 11 Amendment | **F**: "Referback failed" (409). `cloneIssuedSampleForAmendment` copies the NABL ULR to the new row and the unique index `samples_nabl_ulr_uidx` refuses it. Same code on production: no amendment has worked there since the index was added (9 Oct); the earlier `-R2` ULRs were typed by hand. The amendment reason is also optional. Needs a lab decision: amended report gets ULR + `-R1`, or keeps the same ULR (index then allows one per amendment chain). **Fixed and re-run 23 Oct: P** (see below). |
| 12 Engineer and issued report | P (API test C11) |

Also seen in OQ-01: signatories printed on the report come from Print Setting defaults, not from who tested and reviewed (ISO 7.8.2.1, already so on production); the sample status stays "registered" after issue; Part D prints "Confirms" for "Conforms"; the Proof Stress parameter has no MU set.

| OQ-02 step | Result |
|---|---|
| 1 SRF | P: SRF-2026-0004, "customer requests due date" unticked by default and stored as `false` |
| 2 Job allocation | P: Cal TM assigns the engineer (authorization matrix asks for a reason); the engineer sees only that job |
| 3 Raw data | **F**, three faults: (a) only 3 of 489 equipment have raw data columns (Vernier Caliper QI-EQ-0002, Vernier Caliper 300, UTM); the dial gauge in the script has none, so SRF-2026-0005 used the Vernier Caliper; (b) every typed reading is rounded to whole numbers when the field is left (`DEFAULT_RAW_DATA_TABLE_SETTINGS.decimalPlaces = 0`, no setting on screen; 50.01 → 50, 49.99 → 50; every sheet on production has 0); (c) the Vernier Caliper formulas still name columns that were renamed (`[DUC Reading 1 mm]`, `[Master Reading Observed mm]`), so Average and Error stay empty and the sheet cannot be saved ("Fill required column Average Reading External Jaws mm"). Also: the sheet lists all 17 points of the caliper checker (to 600 mm) for a 0–150 mm job, and the first two reading columns are pre-filled (nominal value, and the gauge's actual size from the master). |
| 4 MU | Blocked: the Vernier Caliper MU template holds placeholder entries ("asasdf", a component labelled "0.0002") and an empty budget |
| 5 Formula error | Partly: the formula editor refuses unknown columns when a formula is typed, but renaming a column later leaves formulas that use it broken without warning (fault 3c) |
| 6–9 Review, certificate, amendment, engineer edit | Run on 23 Oct after the fixes: see the OQ-02 continuation below |

**Fault 3b fixed (35dd718, tested on staging 23 Oct).** A typed reading now keeps every digit typed and is padded to the decimals of the least count of the range being calibrated (job range, then job, then equipment master); formula columns are unchanged. On SRF-2026-0005 (LC 0.01) as the calibration engineer: 50.01, 50.02, 49.99 stay as typed (were 50, 50, 50), 100 becomes 100.00, 100.0035 stays 100.0035. Validation cases RD-01 and RD-02 added; 56 of 56 pass. The sheet was closed without saving because fault 3c still blocks saving.

**Fault 3c fixed (582a8e0, 87e856b, 67c3476; data fix applied on staging 23 Oct).**

- Renaming a column in the raw data template editor now updates every formula that named it, when the label field is left. Only formulas that meant that column change: a same label in another table, a new name already taken, or an empty name leave formulas alone.
- Formulas with a comma outside a function's arguments, or with brackets that do not match, are refused in the editor and give no value in the sheet. Before, `=AVERAGE [I1],[I2],[I3]` returned the last reading (9.99 instead of 10.007) and the editor accepted it; this was also OQ-02 step 5. Of the 85 distinct formulas saved on the staging copy, the 13 now refused were all malformed; none of the 72 correct ones changes.
- Saving a sheet now uses the same formulas the grid shows (the job's copy merged with the current equipment formulas) and stores that template with the values. Before, the grid showed Average while the save still found it empty.
- The last row of a sheet can now be deleted (it only had Add row). A seeded point without a master value could not be removed, so the sheet could never be saved.
- `backend/supabase/data-fixes/20261023_calibration_template_formulas.sql` repairs 29 formulas:
  - Vernier Caliper QI-EQ-0002: the equipment template and 7 of 8 ranges (renamed columns, damaged range 0–300 text).
  - Vernier Caliper 300 QI-EQ-0196: Internal and Depth errors took the External Jaws average because all three tables had a column "Average"; those columns become "Average I" / "Average D". The Max/Min parallelism formula is also fixed.
  - Observed error = Average − Master reading, as in the lab's own newer formulas.
  - The fix checks every row first and stops if anything changed; a second run changed nothing. The audit trail carries the reason.
  - A checker over all 77 template formulas now finds 0 problems.
- Validation cases RD-03, RD-04, RD-05 added; 59 of 59 pass.

Tested on staging as the calibration engineer on SRF-2026-0005 (0–150 mm, LC 0.01). Rows outside the range and the 4 rows without a master point were deleted; readings 50.01, 50.02, 49.99 at 50 mm gave Average 50.01 and Error 0.01 (hand: 150.02/3 = 50.007; 50.01 − 50.00). The sheet saved as `under_review`, entry by the engineer, with the new formulas stored.

Still for the lab:
- Vernier Caliper range 0–200 LC 0.02 still uses Master − Average (opposite sign).
- The Internal and Depth tables of QI-EQ-0002 have Average and Error as typed columns, not formulas.
- The MU templates of both calipers hold placeholder entries.
- The draft sheet of SRF-2026-0003 keeps its old formula copy until it is saved again.
- The sheet lists all caliper checker points, not only those in the job's range.
- A rename does not yet update MU formulas that name raw data columns.

**OQ-01 step 11 fixed (b66c076, migration 41 applied on staging, 23 Oct; lab decision: ULR + `-R1`).**

- An amended, revised or supplementary report keeps the original ULR with the next revision: `TC…F-R1`, then `-R2`. The number counts revisions already used on that ULR, including deleted samples' ULRs and the hand-typed `-R2` ones. So amending a report that already has `-R2` gives `-R3`.
- Report Preparation, the ULR inputs (report and calibration certificate, now up to 23 characters) and the next-serial count accept the suffix. A revised ULR is not swapped for a new serial, and existing `-R2` ULRs now pass the format check too.
- The reason for amendment is required:
  - the dialog shows "Reason for amendment *" and Refer back stays disabled without one;
  - the referback refuses a blank reason, and no generated text stands in for it any more (all 11 earlier amendments have only that text);
  - migration 41 `20261102100300_amendment_reason_required.sql` makes the database refuse a blank reason.
- Validation cases ULR-04 and ULR-05 added; 61 of 61 pass.

Staging test, as the Director on SR261023/217-001 (issued, ULR TC1544226000000400F):

- Refer back stays disabled until a reason is typed.
- An API insert with a blank reason is refused (23514, `issued_report_amendments_remark_required`).
- With a reason, it creates **SR261023/217-001A**: Amendment Report, refers to SR261023/217-001, report number QI/REP/20260357AA, ULR **TC1544226000000400F-R1**, reason saved on the amendment record.
- The original stays issued and unchanged.
- As the QM, Test Report Preparation for 217-001A keeps TC1544226000000400F-R1.
- The amended report was not issued in this test.

The lab typed `-R2` for first amendments before; from now on the first amendment is `-R1`.

**OQ-02 continued (23 Oct, after the raw data fixes; SRF-2026-0005, Vernier Caliper 0–150 mm, test accounts per role).**

| OQ-02 step | Result |
|---|---|
| 3 Raw data (re-run) | P: 50.01 / 50.02 / 49.99 kept; Average 50.01, Error 0.01; sheet saved by the engineer, then forwarded to Review Data |
| 4 MU | **F** (blocked): the MU template has placeholder entries, so no MU is calculated. The certificate's "Uncertainty Reported" is filled with the largest of an "Actual Expanded Uncertainty" column (none here) and the masters' own certificate uncertainties, so it printed ±0.01 mm, the caliper checker's uncertainty, not the DUC's U with k |
| 5 Formula error | P (after 582a8e0): malformed formulas refused in the editor |
| 6 Review | P: Cal TM sees the sheet read-only; Forward asks for an authorization-matrix reason (the reviewer becomes the signatory); sheet `approved`, reviewer OQ Technical Manager Cal Elec and time stamped; job to Certificate Preparation |
| 7 Certificate | **F**: issued as QI/CC/2026/0003 with "Due date not shown: the customer did not request one" (pass), masters with certificate numbers, due dates and calibrating lab (pass), results 50.00 → 50.01, error 0.01 (pass). Failures: ULR **TC**1544226000000401F (testing prefix from Lab Settings, not CC with the calibration accreditation number); U as in step 4; environmental conditions blank (the sheet saved without them); Notes are the UTM ones (IS 1828 machine) and Remarks say "done at the Site of Customer" for an In Lab job; no password asked at issue (test reports ask for one) and the issuer is not stored on the certificate |
| 8 Amendment | P: Director amends with a required reason; new number QI/CC/2026/0003/A1, original ULR kept, the certificate prints "Amendment No. 1 — replaces certificate QI/CC/2026/0003 dated 23-Oct-26. Reason: …"; the original is kept as a snapshot; requested and approved by and at stored |
| 9 Engineer edit | P: the issued job is not in the engineer's list; changing its raw data or moving the job back through the API is refused (403, "The calibration certificate … has been issued. Use Amend certificate") |

**Calibration ULRs collide with test report ULRs (production data).** Certificate QI/CC/2026/0001 (SRF-2026-0001) has ULR TC1544226000000248F, which test report SR260714/104-001 also has; QI/CC/2026/0002 (SRF-2026-0002) has TC1544226000000252F, also on test report SR260806/121-001. Cause:

1. The calibration ULR takes the Lab Settings "ULR Number" prefix (TC1544226, the testing accreditation). It falls back to CC + the calibration accreditation number only when that setting is the bare "TC".
2. The calibration generator counts test report ULRs, but the test report generator (`fetchNextNablUlrNumber`) does not count calibration certificate ULRs. So a test report issued after a certificate took the same serial.
3. The unique ULR index covers samples only.

**Lab decision (23 Oct): testing and calibration ULRs stay separate.** Test reports: TC + 15442 (TC-15442) with their own serial; calibration certificates: CC + 03039 (CC-3039) with their own serial. Implemented in a41052a and migration 42. **Lab information (23 Oct): QI/CC/2026/0001 and 0002 are dummy certificates, never sent to anyone; the calibration module has not started on production (only testing is live).** No amendment or customer note is needed. Production holds only dummy calibration records: SRF-2026-0001…0003, 5 jobs, these 2 certificates. Data fix `20261023_calibration_dummy_data.sql` removes them at go-live (3 SRFs, 5 jobs with the 2 certificates, 5 raw data sheets; purged, not sent to the Recycle Bin, so the first real SRF, certificate number and calibration ULR start at 0001 and the test report ULRs …248F / …252F are free). Each SRF is checked by id, number, client, job count and certificate number; amendments or an invoice stop it. Equipment master, calibration equipment, templates, clients and testing are not touched. On staging (23 Oct): rolled-back dry run, then applied; 13 audit entries carry the reason; a second run removed nothing; 489 equipment unchanged; no calibration job holds a test report ULR any more.

Other observations:

- Right after sign-in a page opened at once can show "Access Denied" until the module rules load; a reload shows it.
- Review Data shows 4 empty rows after the 4 saved ones; the certificate printed only the 4.
- The test calibration engineer (rules copied from the real Thermal calibration engineer) also has Edit on Review Data and Certificate Preparation; whether an engineer can review their own job was not tried.

**Calibration certificate ULR fixed (a41052a, migration 42 applied on staging, 23 Oct).**

- Certificates get CC + the calibration accreditation number + year + location + their own serial. The number comes from a CC accreditation in Lab Settings, else the lab's published CC-3039; on staging the first is `CC0303926000000001F`.
- Both generators read every ULR in use (test reports with deleted ones, calibration certificates, superseded certificates) through `app_used_ulr_numbers()`. This function sees all rows for staff only.
- An unissued draft still holding a TC ULR gets a CC one; issued certificates and amendments keep theirs.
- Migration 42 `20261102100400_ulr_cross_check.sql` refuses a ULR whose base is already used by a test report, or by another calibration job (23505, with an advisory lock). Rows that already clash are left alone.

Staging tests:

- 8 of 8 database cases pass in a rolled-back transaction: sample ↔ certificate, certificate ↔ test report (also lowercase), certificate ↔ certificate are refused; a free CC ULR, a report revision on its own base and other edits of already-clashing rows are allowed.
- SRF-2026-0006 (Vernier Caliper) went through SRF, allocation, conduct, review and certificate. The draft and the issued certificate have ULR **CC0303926000000001F**.
- Report Preparation for SR261017/211-001 now suggests **TC1544226000000402F**: 401 is taken by a certificate. Before the fix it would have suggested 401.
- Through the API as Director: `app_used_ulr_numbers` returns 277 ULRs; putting CC0303926000000001F on a test report is refused (409, "already used by the calibration certificate of SRF-2026-0006").
- Validation case ULR-06; 62 of 62 pass.

**Production certificates whose ULR clashes with a test report (listed for the lab; not changed):**

| Certificate | SRF | Customer | Equipment | Issued | ULR | Same ULR on test report |
|---|---|---|---|---|---|---|
| QI/CC/2026/0001 | SRF-2026-0001 | BR Stainless India Limited | Universal Testing Machine | 12-Aug-26 (signatory Yogeshwar Krishna) | TC1544226000000248F | SR260714/104-001, QI/REP/20260206A, Refmart Industries, issued 12-Aug-26 |
| QI/CC/2026/0002 | SRF-2026-0002 | Ajay Ingot Rolling Mill Private Limited | Universal Testing Machine | 13-Aug-26 (signatory Yogeshwar Krishna) | TC1544226000000252F | SR260806/121-001, QI/REP/20260210A, Aishwaryam Steels Private Limited, issued 14-Aug-26; and its amendment SR260806/121-001A, QI/REP/20260210AA (ULR …252F-R2), issued 21-Sep-26 |

(Superseded by the lab information above: both certificates are dummy, so this amendment is not needed.) Earlier suggestion: amend both certificates (Calibration Certificates → Amend, with the reason "ULR corrected to the calibration series"), click the ULR auto button in the amendment draft so it takes the next CC number, and issue. Inform both customers. Until then, a new amendment of test report SR260806/121-001 is refused by the guard, because its ULR base is still held by QI/CC/2026/0002.

Also seen in this test:

- **Certificate numbers repeat after an amendment.** SRF-2026-0006 got QI/CC/2026/0003, the original number of SRF-2026-0005's certificate (now QI/CC/2026/0003/A1). The number generator does not count numbers replaced by an amendment. Production has no certificate amendment yet. **Fixed (415b19f, migration 43), see below.**
- **An engineer can approve their own raw data.** The test calibration engineer, who has Edit on Review Data like the real Thermal engineer, could forward their own job; only the authorization-matrix reason was asked. The test was cancelled at that dialog. **Fixed (fa27c4d, migration 44), see below.**
- "Access Denied" right after sign-in also happened for the Director; a reload shows the page.

**Certificate numbers never reused (415b19f, migration 43 applied on staging, 23 Oct).**

- The generator now strips the amendment suffix (/A1, /R1, /S1) before reading the serial. It counts every number in use through `app_used_certificate_numbers()`: current drafts, plus the original and new number of every amendment, all jobs, staff only. Before, it read only 500 drafts the user could see, and skipped `…/0003/A1`.
- Migration 43 `20261102100500_certificate_number_unique.sql` refuses a number whose base another job already holds (23505, with an advisory lock). Amendments on the same job keep their base.

Staging tests:

- 6 of 6 database cases pass (rolled back): another job's number, its amended form and QI/CC/2026/0001 are refused; a free number, the next amendment on the same job and other edits of an already-clashing job are allowed.
- New job SRF-2026-0007 (Vernier Caliper, full flow) was offered and issued **QI/CC/2026/0004** with ULR CC0303926000000002F. Before the fix it would have been 0003 again.
- Through the API, giving QI/CC/2026/0004 to SRF-2026-0004 is refused (409, "already used by the calibration certificate of SRF-2026-0007").
- Validation case CN-01; 63 of 63 pass.

The staging test certificates SRF-2026-0005 (QI/CC/2026/0003/A1) and SRF-2026-0006 (QI/CC/2026/0003) still share a base. They are test data made before the fix and exist on staging only.

**Calibration review by someone other than the performer (fa27c4d, migration 44 applied on staging, 23 Oct; lab decision).**

- Review Data stops with "You carried out this calibration (SRF …). Another authorised person must review and approve its raw data." when the job is allocated to the user. The authorization-matrix dialog does not open.
- Migration 44 `20261102100600_calibration_review_not_by_performer.sql` refuses (42501), for a signed-in user who is the allocated engineer or who saved the raw data (payload `entryBy`), both approving the raw data sheet and moving the job from Review Data to Certificate Preparation / Certificates. Referring back stays allowed; scripts without a signed-in user are not affected; no role is exempt, the Director included, when they did the calibration.

Staging tests:

- 7 of 7 database cases pass (rolled back, users simulated through `request.jwt.claims`): the engineer approving the sheet or moving their job forward is refused; the engineer referring back, and the Director approving and moving, are allowed.
- SRF-2026-0008 (Vernier Caliper, full flow, OQ Calibration Engineer Thermal):
  - On screen the engineer's Forward in Review Data showed the message and nothing moved.
  - Through the API the engineer's sheet approval and job move were both refused (403, 42501).
  - The Director then approved it on screen: sheet `approved`, reviewed by OQ Director, entry by the engineer, job in Certificate Preparation.

**Calibration certificate content fixed (fe94365, a20bff6, migration 45 and data fix applied on staging, 23 Oct; lab decision).**

| Item | Before | Now |
|---|---|---|
| U | Largest of an expanded-U column and the masters' own certificate uncertainties (printed ±0.01 mm, the caliper checker's U) | Uncertainty Step by Step → "Use U on the certificate" saves each point's expanded U with k in the raw data sheet. The certificate prints the largest of those or of an expanded-U column, as given, with k (e.g. ±0.018 mm (k = 2)). A master's U is never used; an old master U on an unissued draft is cleared. |
| Issue | No password; issuer not recorded | Needs a certificate number, a U and the average temperature and humidity, then the issuer's password (as for test reports). Migration 45 `20261102100700_calibration_certificate_issue.sql` refuses the issue without a password check of the last 15 minutes or without U, and stamps `issuedBy` (signed-in user, name and designation from the profile, times). |
| Environment | Sheet saved without conditions | Completing a raw data sheet needs the average temperature and humidity |
| Notes | UTM (IS 1828 machine) notes on every instrument | Default notes hold only the conformity line; force testing machines keep IS 1828. Data fix `20261023_certificate_notes.sql` changed the 285 unedited formats of 272 non-machine instruments (6 machines kept; second run changes nothing). |
| Remarks | "done at the Site of Customer" on every job | Line 1 follows the job: "carried out in the laboratory" / "at the customer's site" |

Staging tests:

- 4 of 4 database cases pass (rolled back): issue without a password check, with a 20-minute-old one, or without U is refused; with both it is allowed and the issuer is stamped "OQ Director" although the browser sent another name.
- On screen on SRF-2026-0008, as Director:
  - U was blank and the master U was not used; environment "—"; general notes; laboratory remark.
  - Issue & Forward was refused with the U message.
  - Test values were then written into the sheet on staging: U 0.018 mm per point and environment readings. The Vernier Caliper MU template on the copy has placeholder entries, so its MU sheet cannot give a real U.
  - After that the draft showed U ±0.018 mm (k = 2), 20.20 °C and 51 %RH.
  - Issue asked for the password; a wrong password gave "Invalid login credentials" and nothing was issued; the right one issued QI/CC/2026/0005, ULR CC0303926000000003F, with `issuedBy` OQ Director (Laboratory Director).
- As the engineer, completing SRF-2026-0004's sheet without conditions was refused: "Enter the environmental conditions (temperature and humidity) under Environment Condition."
- Validation cases CN-02, RD-06; 65 of 65 pass.

Still for the lab: build the MU templates (the Vernier Caliper ones hold placeholders), so the MU sheet gives the U that the certificate now requires; until then such a certificate cannot be issued.

**Test report signatories from the people who did the work (b476232, 23 Oct; lab decision).**

- Reports printed the names saved in Print Setting (Vishal Rahangdale, Rajat Maurya "Tested By", Kunal Patle "Approved By") whoever tested, reviewed or issued them (ISO/IEC 17025 7.8.2.1 o).
- Preview, print / PDF, the issue confirmation and the archived copy made at issue now use the sample's people:
  - Tested By: whoever entered each result (`entered_by`), else the engineer the test was assigned to.
  - Reviewed By: the results reviewer.
  - Approved / Authorized By: the issuer, or the signed-in user until the report is issued.
- Print Setting keeps the layout: role labels and the parts each role signs after. The editor says the names there are not printed.
- Reports already issued keep their archived copy.
- Validation case SG-01; 66 of 66 pass.

Staging test as QM on amendment SR261023/217-001A (the OQ-01 amendment):

- The preview printed "Approved By OQ Quality Manager" after Parts A and B, and after Part D "Tested By OQ Testing Engineer Mech · Reviewed By OQ Technical Manager Mech · Approved By OQ Quality Manager", with none of the Print Setting names.
- The issue confirmation listed the same three.
- The report was then issued with the password (ULR TC1544226000000400F-R1). Its archive holds these three people; the original SR261023/217-001, issued before the fix, keeps Kunal Patle / Rajat Maurya / Vishal Rahangdale in its archive.
- This also completes OQ-01 step 11 (amendment created and issued).

**Raw data generator (to decide before go-live).** Raw data sheet → Generate Report can fill the DUC reading columns with values worked out from a reference column plus a random deviation ("randomness factor"), rounded to the least count. Both approved UTM sheets on production (SRF-2026-0001, SRF-2026-0002) have saved generator settings with the three observed reading columns, reference = standard reading, randomness 0.5. ISO/IEC 17025 7.5.1 and 7.11.3 need the original observations; the lab should confirm how those readings were taken, and the generator should be removed or limited to clearly marked training/demo use. **Lab decision (23 Oct): the feature stays as it is.** It is meant for filling dummy readings to estimate the MU, and the lab shows or hides its button with the existing Lab Settings switch. The two UTM certificates where it was used (SRF-2026-0001, 0002) are dummy test data (lab, 23 Oct).

Notes for go-live: when the roles are restored, `ALTER ROLE postgres` must be skipped (it would overwrite the target's own password); a storage-api that starts on an empty database creates its own `storage` schema, which then blocks the restored one.

**Security fixes from the go-live re-check (23 Oct; ISO/IEC 17025, security and operations review).**

- **Storage tables were open to the anon key.** The rest service served the `storage` schema (`PGRST_DB_SCHEMAS=public,storage`); `storage.buckets` and the other storage tables had RLS off with ALL privileges for anon and authenticated. Without signing in, `GET /rest/v1/buckets` with `Accept-Profile: storage` listed every bucket, and the grants allowed making one public.
  - Staging rest service: `PGRST_DB_SCHEMAS=public` (production: plan item S-20).
  - Migration 46 `20261102100800_storage_schema_lockdown.sql`: RLS on every storage table, no anon privileges, signed-in users read-only on `buckets`, objects keep their policies without TRUNCATE.
  - Staging test: the same anon request now gets 406 "The schema must be one of the following: public". As the QM in the browser: file list, signed URL download (506,002 bytes), authenticated download, upload, read back and delete of a test PDF in laboratory-files all 200; the test file was removed.
- **Test report issue was not checked by the database.** The password time was checked only if the browser sent it, and nothing checked who issued, so any signed-in staff member could set a sample to `completed` through the API.
  - Migration 47 `20261102100900_test_report_issue_guard.sql`: a signed-in issuer needs a password sign-in of the last 15 minutes (the `amr` time in the token; the Confirm password step signs in again) and the right to sign: the Director; once the Authorization Matrix is in use for "Sign test reports", only its holders; until then the QM or Edit access to Test Report Preparation in Module Access. `issued_reauthenticated_at` is set to the token's password time.
  - Only the QM (Yamini Nayak), the Director and OQ QM have issued reports on the copy; all three have Edit access. On the copy OQ Sample Incharge also has Edit access to Test Report Preparation, so the rule lets Sample Cell users with that access issue. **Lab decision (23 Oct): this stays;** Sample Cell users with Edit access to Test Report Preparation may issue test reports.
  - Database test (`report_issue_guard_test.mjs`, rolled back), 11 of 11 pass: Testing Engineer and View-only Technical Manager refused; QM without a password sign-in or with one 20 minutes old refused; QM, Director and Sample Cell with Edit allowed; with a sign_report grant for the QM only, Sample Cell refused, QM and Director allowed; scripts unaffected.
  - Browser test as OQ QM: SR261017/211-001 issued with the password (NABL scope warning acknowledged), ULR TC1544226000000402F; `issued_reauthenticated_at` 11:18:41 UTC, the password time from the token.
- **pgcrypto callable by anyone.** pgcrypto lives in `public`, so `crypt`, `gen_salt`, `pgp_*` and the rest were RPCs open to the anon key. Migration 48 `20261102101000_pgcrypto_revoke.sql` revokes them from PUBLIC, anon and authenticated (service_role keeps them); `gen_random_uuid` stays, as 75 column defaults use it. Staging: anon `rpc/gen_salt` now "permission denied"; the public brand RPC on the sign-in page still 200.
- **DOMPurify 3.4.16 → 3.4.17** (critical advisories on 3.4.16). `npm audit --omit=dev`: 0 critical; the 5 high left are the Tailwind build chain, not shipped. Build passes; validation 66 of 66.

**Remaining code gaps from the re-check (23 Oct; c4782cd, 5a275cc, 370b1d5, e185b51).**

- **Files could be deleted by anyone, without a trace.** Migration 49 `20261102101100_storage_delete_rule_and_audit.sql`: in audit-nc-evidence, calibration-files, calibration-srf-documents, equipment-files, is-code-files, laboratory-files, management-documents, quotation-signatures, sample-client-references and test-method-notes, a file can be deleted or changed only by its uploader, the QM or the Director. Buckets with their own role rules keep them. Every upload, change and delete of a file, in any bucket, goes to `audit_log` as `storage.objects` with the bucket/path, the user (for an upload, the uploader) and the metadata. The app uploads every file under a new name, so no flow overwrites someone else's file. IS Code Master says "Only the person who uploaded this file, the Quality Manager or the Laboratory Director can delete it." and keeps the file and its record.
  - Database test (`storage_rule_test.mjs`, rolled back), 5 of 5: Technical Manager cannot delete or change a file Pritam Sharma uploaded; the uploader, QM and Director can, each delete audited with the actor.
  - Browser as OQ Sample Incharge: deleting that file in IS Code Master gave the message; file and record kept. Uploading and deleting their own test PDF in laboratory-files worked; audit_log shows INSERT and DELETE by OQ Sample Incharge.
  - Found in the test and fixed (e185b51): storage-api v1.24 lists the full path, so the first version of the "is the file still there" check missed it, showed "File deleted." and removed the `is_code_files` record although the file stayed. The record was put back on staging from its audit row; the check now matches the full path and treats a failed listing as "still there".
- **A missing U was silent under a guard band rule.** Results the SRF's guard band / non-binary rule cannot judge for want of U (judged by simple acceptance) are listed in a red note above Part C in Test Report Preparation, and the issue dialog lists them with a box to tick ("I have reviewed these results and accept issuing the report as it is"); Issue Report stays disabled until it is ticked. Staging, with DR-GB put on SR261015/206-001 for the test and removed after: the note listed Phosphorous 0.026, Sulphur 0.016 and Elongation 28.56 (no MU on those parameters); Issue Report was disabled until both the NABL scope and the U boxes were ticked; nothing was issued.
- **Report wording.** Remarks print "Conforms" / "Does Not Conform" and Part D "1. The Sample Conforms to …". Results saved as "Confirm" / "Not Confirm" show and save the new wording while the report is open; issued reports keep the wording they were issued with (their saved remarks, and Part D line 1 "Confirms to" when the remarks are in the old wording). End notes: "Laboratory", "Evidence". Staging: SR261015/206-001 showed Conforms, "The Sample Conforms to IS 3601: 2006" and the corrected end notes. Validation CF-07, CF-08; 68 of 68 pass.
- **Access Denied right after sign-in.** Three causes: for one render after sign-in the profile was reported ready with an empty designation; once the profile arrived the guard judged by the designation rules while the module rules were still loading; a failed profile or rules request was not retried. Now the profile counts as ready only for the signed-in user, the guard waits for that user's first rules load, failed loads are tried three times, and if the rules cannot be loaded the designation rules apply. Staging, as OQ Sample Incharge (Test Report Preparation only through Module Access), going to it the moment sign-in finished: before the fix "Access Denied" appeared briefly, after it the page opened with no denial; a page they have no access to (Samples Under Testing) still shows Access Denied.


**Regression after migrations 46–49 (23 Oct, run MVL0AOLL).** API role tests with the ten OQ accounts: 78 of 79 pass, the same result as before the security fixes. The one failure is F1 again: that account already signed its 2026 declaration, so the one-per-year rule refuses a second one. C9, the QM issuing a report after confirming the password, passes with the new database check. New API checks for the 23 Oct fixes (`extra_checks.mjs`), 7 of 7:

- X1, X2: a testing engineer and a View-only Technical Manager each tried to set SR261015/205-001 to issued. Both were refused ("You are not allowed to issue test reports…").
- X3: the sample stayed in report preparation.
- X4: without signing in, the storage tables return 406.
- X5, X6: pgcrypto is refused, with and without signing in.
- X7: a testing engineer's delete of a file someone else uploaded removed nothing; the file is still there.

Test records from this run are named OQ TEST / OQTEST and stay on staging (invoice numbers INV-2026-0007 and 0008).
