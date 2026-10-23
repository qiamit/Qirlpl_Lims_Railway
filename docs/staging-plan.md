# Staging copy on Railway: plan

Goal: test everything on the branch `claude/priceless-ramanujan-5f501a`
(37 new migrations plus the frontend, gateway, functions and PDF changes)
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
3. Apply the 37 migrations to production in the same order, while the lab is idle.
4. Apply the Railway settings tested on staging (GoTrue, `GOTRUE_DISABLE_SIGNUP`, `PDF_ALLOWED_ORIGINS`, frontend start command).
5. Smoke-test with the Director login; leave module access in log mode for two weeks before enforcing.
6. Delete the staging environment once production is signed off.

### Rollback

- Staging: `railway environment delete staging` removes everything it created.
- Production: each migration header lists what it changes. If a migration has to be undone wholesale, restore the volume backup taken in F.1 (Railway → Postgres → Backups → Restore; this replaces the current data, so anything entered after the backup is lost).
