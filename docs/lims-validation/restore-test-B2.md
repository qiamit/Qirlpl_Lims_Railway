# QIRLPL LIMS: restore test B-2 (step by step and checklist)

| | |
|---|---|
| Document | QIRLPL-LIMS-BKP-B2 |
| Version | 1.0 (23 Oct 2026, draft for QM review) |
| Procedure | `backup-restore-procedure.md` (QIRLPL-LIMS-BKP), sections 4–7 |
| Clause | ISO/IEC 17025:2017 7.11.3 c, 7.5, 8.4 |
| Plan item | B-2 (`docs/audit-gap-closure-plan.md`): record one restore test before go-live |
| Done by | Amit (with Claude), witnessed by the QM; approved by the Laboratory Director |
| Record | Quality → Backup Restore Tests |

## 1. What Railway allows (checked 23 Oct 2026)

From Railway's backup documentation (docs.railway.com/reference/backups):

- A volume backup can be restored **only into the same project and the same
  environment**, onto the service the volume belongs to.
- Restore makes a **new volume** from the backup and mounts it where the old
  one was. The change is **staged**; nothing happens until someone clicks
  **Deploy**.
- The previous volume is **kept, unmounted**, in the project. Data written
  after the backup stays on that old volume.

So a production backup cannot be restored into a separate service: restoring
it replaces the production database. **B-2 therefore never restores a
production backup.** It proves recovery in three parts, none of which
changes production:

| Part | Proves | Where | Changes |
|---|---|---|---|
| A | Railway's own backup → restore works, and how long it takes (recovery time) | **Staging** Postgres, which holds a fresh copy of production (go-live dry run, 23 Oct) | Staging only |
| B | Production's data can be read out completely and loaded into another database | Read-only dump of production into a separate database on staging | Staging only; production only read |
| C | Production backups exist, are recent and are kept long enough | Railway backup list of production (read only) | Nothing |

Uploaded files are not in any volume backup (section 6).

## 2. Production backups today (read 23 Oct 2026, read only)

| Volume | Schedule | Backups present |
|---|---|---|
| Production Postgres (`postgres-volume`, 150 MB) | Daily 05:30 UTC (11:00 IST), kept 6 days; weekly Saturday 16:51 UTC (22:21 IST), kept 27 days | Manual "2026-10-22 after grants, before finance migrations" (22 Oct 14:59 UTC); manual "Before staging copy 2026-10-23" (23 Oct 02:42 UTC); Daily (23 Oct 05:30 UTC, expires 29 Oct) |
| Production `lims-storage` (MinIO volume, 248 MB) | none | none (storage-api does not use it; see section 6) |
| Production file bucket `qirlpl-lims-storage-bf0ydy` (Railway bucket) | not covered by volume backups | none |
| Staging Postgres (`postgres-volume`, 985 MB) | none | none |

## 3. Approval gates

Nothing in this test touches production data. Even so, each step that
**restores** or **replaces** a database waits for an explicit go-ahead from
Amit in chat:

| Gate | Before | Changes |
|---|---|---|
| G1 | A2 (create a backup of staging Postgres) | Adds a backup to staging |
| G2 | A4 (restore that backup into staging Postgres and deploy) | Replaces the staging database with the backup; the current staging volume is kept unmounted |
| G3 | B2 (load a read-only dump of production into a new staging database `restore_check`) | Adds one database on staging |

## 4. Part A: Railway backup → restore on staging (about 30 minutes)

| # | Step | Who / how | Expected | Tick |
|---|---|---|---|---|
| A1 | Note reference figures on staging (query in section 7) and the time | Claude, read-only query | Figures written into the record | ☐ |
| A2 | **(G1)** Railway → staging → Postgres → Backups → **Create backup**, name `B-2 restore test <date>` | Amit in the dashboard, or Claude with the Railway API after G1 | Backup listed with its time | ☐ |
| A3 | Make a marker change **after** the backup: create schema `restore_test` with one row holding the time | Claude, one SQL statement on staging | Marker present | ☐ |
| A4 | **(G2)** Backups → the A2 backup → **Restore**. Read the staged change: it must say **staging** environment and the **Postgres** service. If it says production, **cancel**. Click **Deploy**. Start the clock | Amit in the dashboard | Postgres redeploys with the restored volume | ☐ |
| A5 | Wait until Postgres is running; stop the clock | Railway → staging → Postgres → Deployments | Minutes = recovery time | ☐ |
| A6 | Checks 1–8 of section 5 on staging | Claude | All pass | ☐ |
| A7 | The old staging volume shows as unmounted; delete it once A6 passes | Amit | Old volume gone | ☐ |

If A4 or A6 fails: the old staging volume is still there (unmounted); swap
it back in the dashboard, or reload staging from production as in the go-live
dry run (3 seconds). Record the test as **fail** and follow
`backup-restore-procedure.md` section 7.

## 5. Checks after the restore (Part A)

| # | Check | How | Pass when | Tick |
|---|---|---|---|---|
| 1 | Database starts and accepts connections | Read-only query | Answers | ☐ |
| 2 | Marker gone | `select to_regnamespace('restore_test')` | NULL (the restore went back to before the marker) | ☐ |
| 3 | Row counts equal the A1 figures | Query in section 7 | Equal | ☐ |
| 4 | Latest SRF and latest issued report present | Query in section 7 | Same numbers as A1 | ☐ |
| 5 | Audit trail ends before the backup time | `select max(at) from audit_log` | Not after the backup time | ☐ |
| 6 | Both staging databases present (`railway`, `railway_pre_dryrun`) | `select datname from pg_database` | Both listed | ☐ |
| 7 | App works on the restored database | Staging app: sign in as OQ Director (if the first sign-in fails right after the restore, sign in again), open Dashboard, Issued Test Report, re-print one issued report | Works; re-print matches the archive | ☐ |
| 8 | API role tests | `role_tests.mjs` on staging | Same result as before the restore | ☐ |

## 6. Files

Uploaded files are in the Railway bucket `qirlpl-lims-storage-bf0ydy`, read
by storage-api. Volume backups do not include buckets, so today there is **no
backup of the files**. The `lims-storage` MinIO volume (248 MB) has no backup
either, and storage-api does not use it (probably the files before the move to
the bucket); keep it until the lab confirms.

For B-2, check what can be checked and record the gap:

| # | Step | Pass when | Tick |
|---|---|---|---|
| F1 | Compare the production bucket with the staging copy made on 23 Oct (`rclone check --one-way --size-only`, production read only) | Only files uploaded after 23 Oct differ | ☐ |
| F2 | Record the open item: no scheduled copy of the file bucket | Remark written | ☐ |

Proposal (separate change, after approval): a second bucket and a nightly
`rclone copy` of production files into a dated folder there, plus a backup
schedule on the MinIO volume while it is kept.

## 7. Queries (read only)

Reference figures (A1, check 3, B3):

```sql
select (select count(*) from public.samples) samples,
       (select count(*) from public.samples where stage = 'completed') issued,
       (select count(*) from public.issued_report_archive) archived,
       (select count(*) from public.clients) clients,
       (select count(*) from public.test_allocation_parameters) results,
       (select count(*) from public.calibration_jobs) cal_jobs,
       (select count(*) from public.equipment_master) equipment,
       (select count(*) from auth.users) logins,
       (select count(*) from storage.objects) file_records,
       (select count(*) from public.audit_log) audit_rows,
       (select max(at) from public.audit_log) audit_last;
```

Latest SRF and latest issued report (A1, check 4):

```sql
select (select srf_number from public.samples order by created_at desc limit 1) latest_srf,
       (select test_report_number from public.samples where stage = 'completed'
         order by test_report_issued_at desc nulls last limit 1) latest_report;
```

## 8. Part B: production data read out completely (about 15 minutes)

| # | Step | Expected | Tick |
|---|---|---|---|
| B1 | Reference figures on production with the section 7 query, in a read-only session (`default_transaction_read_only=on`) | Figures written down | ☐ |
| B2 | **(G3)** Inside the staging Postgres container (`railway ssh`), `pg_dump` production read-only and `pg_restore` into a new staging database `restore_check`; the dump stays in Railway and is deleted afterwards | Restore with 0 errors | ☐ |
| B3 | Section 7 query on `restore_check` | Equal to B1 (production may have moved on by a few records between B1 and B2; then equal or fewer, never more) | ☐ |
| B4 | Drop `restore_check` | Gone | ☐ |

Done once already in the go-live dry run on 23 Oct (production 39 MB, dump
3.1 MB, restore 0 errors, all counts equal); repeat on the test day for the
record.

## 9. Part C: production backups (5 minutes, read only)

| # | Check | Pass when | Tick |
|---|---|---|---|
| C1 | Latest daily backup of production Postgres | Taken in the last 24 hours | ☐ |
| C2 | Latest weekly backup | Taken in the last 7 days (first one due Saturday 25 Oct) | ☐ |
| C3 | Retention | Daily kept ≥ 6 days, weekly ≥ 27 days (today's settings); the lab decides whether that is long enough (ISO/IEC 17025 8.4 keeps records longer; the backups are for recovery, the records stay in the database) | ☐ |
| C4 | An on-demand backup exists before every planned change | "Before …" backups listed for 22 and 23 Oct | ☐ |

## 10. Record the test

Quality → Backup Restore Tests → Record restore test:

| Field | Value |
|---|---|
| Tested on | Test date |
| Backup kind | `manual` (the A2 backup) |
| Backup name / id | `B-2 restore test <date>` and its Railway id |
| Backup taken at | A2 time |
| Restored to | "Railway staging environment, Postgres service (volume restore); plus logical copy of production into staging database restore_check" |
| Checks done | A1–A7, checks 1–8, B1–B4, C1–C4, F1–F2 with their figures |
| Restore minutes | A5 |
| Result | **pass** if Parts A, B and C pass; **partial** while files have no backup (section 6), with that in the remarks |
| Performed by / witnessed by | Amit / QM |
| Remarks | Why staging (section 1), the file backup gap, the recovery time |

Then mark B-2 as done in `docs/audit-gap-closure-plan.md` and P-checklist of
`docs/go-live-runbook.md`.
