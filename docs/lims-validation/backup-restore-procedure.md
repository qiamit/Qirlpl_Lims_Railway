# QIRLPL LIMS: backup and restore test procedure

| | |
|---|---|
| Document | QIRLPL-LIMS-BKP |
| Version | 1.0 (draft for QM review) |
| Clause | ISO/IEC 17025:2017 7.11.3 c (data protected against loss), 7.5, 8.4 |
| Frequency | Restore test every **90 days**, after any change to the database service or backup settings, and after any `backup` or `data_integrity` IT incident |
| Done by | Laboratory Director (or IT person with Railway access), witnessed by the QM |
| Record | Quality → Backup Restore Tests (register `backup_restore_tests`) |

## 1. What is backed up

- The LIMS database is Postgres on Railway, stored on a Railway **volume**.
- Since **22 Oct 2026**: Railway **daily** and **weekly** volume backups are
  switched on for the Postgres service, and an on-demand backup is taken
  before every migration or risky change (see `change-control-procedure.md`).
- Uploaded files (storage bucket objects) and the app code are not in the
  volume backup. The code is in git (GitHub); check separately how uploaded
  files are kept (open item).

A backup that has never been restored is not proof that data can be recovered.
This procedure proves it, without touching production.

## 2. Golden rules

1. **Never restore into the production Postgres service.** Restoring a volume
   backup replaces the data in that volume. A restore test always goes into a
   **separate, new service** (or a separate environment).
2. Take a fresh on-demand backup of production before you start, so the test
   cannot leave you worse off.
3. The restored copy contains real client data: keep it private, do not share
   its connection string, and **delete it** at the end of the test.
4. Do not point the live app at the restored copy.

## 3. Before you start (10 minutes)

1. Pick a quiet time. Note the date and your name.
2. Open the LIMS (production) as Director and write down the **reference
   figures** you will compare with (section 5): counts of SRFs, issued reports,
   calibration certificates, the number of the latest SRF and latest issued
   report, and the time of the latest audit-trail entry. Use the app screens
   (lists show counts) or ask the developer for a read-only count query.
3. In Railway → project → Postgres service → **Backups**: note the backup you
   will test (its id / label and the time it was taken). Prefer the latest
   **daily** backup; every fourth test use a **weekly** one.

## 4. Restore into a new service (30–60 minutes)

Railway's dashboard changes from time to time. The aim is always the same:
the backup's data ends up in a **new** Postgres service, not in production.

**Method A (preferred): restore the volume backup into a separate environment.**

1. In the Railway project create a new environment called `restore-test`
   (Environments → New environment; an empty environment or a copy of
   production is fine, but the app services in it must **not** be deployed
   with production secrets).
2. In `restore-test`, add a Postgres service of the same version as
   production.
3. From the production Postgres service's Backups list, use the backup's
   menu to restore it **into the `restore-test` Postgres volume** if Railway
   offers a target choice. Read the confirmation dialog: it must name the
   `restore-test` service. If it names the production service, **cancel**.
4. Deploy the staged change in `restore-test` only. Wait until the service is
   running.

**Method B (if Railway can only restore a backup into its own volume).**

1. Do the restore test on the **staging** environment instead: staging has
   its own Postgres volume and backups. Take a backup of staging, change
   something small (add a test SRF), restore the backup into the staging
   Postgres, and check the test SRF is gone and everything else is there.
   This proves the Railway backup and restore mechanism.
2. Also prove that production data can be recovered: with a read-only
   database user, take a logical dump of production (`pg_dump`) and restore
   it into the `restore-test` Postgres service (`pg_restore`). Record it
   with backup type "manual".
3. Write in the remarks that Method B was used and why.

Write down how many minutes the restore took (from start to "service
running"). This is your real recovery time.

## 5. Checks on the restored copy (20 minutes)

Connect to the **restored** service only (Railway → restore-test → Postgres →
Data, or a SQL client with the restore-test connection string). Tick each
check on the Backup Restore Tests form and write the figures in the note.

| # | Check | How | Pass when |
|---|---|---|---|
| 1 | Service starts and accepts connections | Open the Data tab or connect | Tables are listed |
| 2 | Row counts match the reference list | `select count(*)` on `samples`, `calibration_jobs`, `issued_report_archive`, `audit_log` and the test-results table in use | Equal to the reference figures, less only the records created after the backup time (never more) |
| 3 | Latest SRF before the backup time is present | Look up the SRF number noted in step 3.2 | Found, with its tests |
| 4 | Latest issued report re-prints from the archive | Point a **staging** copy of the app at the restored database (never production), open Issued Test Report, re-print | Same content; hash check passes |
| 5 | Latest calibration certificate present with its ULR | Look up the certificate | Found, ULR matches |
| 6 | Audit trail is complete up to the backup time | `select max(at) from audit_log` | Close to the backup time |
| 7 | Sign-in works (restored copy only) | Sign in on the staging app connected to the restored copy with a test account | Works |
| 8 | Restored copy removed | Delete the `restore-test` service / environment and its volume | Gone from the Railway project |

If you cannot do check 4 or 7 (no staging app to point at the copy), untick
them, record the result as **partial**, and say why in the remarks.

## 6. Record the test

Quality → **Backup Restore Tests** → **Record restore test**:

- tested on, backup type, backup id / label, time the backup was taken
- restored to (e.g. "Railway env restore-test, service postgres-restore")
- the checks with notes (figures), minutes taken
- result: **pass** (all checks OK), **partial** (some checks not possible or
  not OK but data is recoverable), **fail** (data could not be restored or is
  incomplete)
- performed by, witnessed by (QM)
- remarks (required for partial / fail)

The page shows the date of the last successful test and turns red when the
last one is more than 90 days old.

## 7. If the test fails

1. Record the test as **fail** with remarks.
2. Record an IT incident (Quality → IT Incidents), category **backup**,
   describe what failed and the effect on data ("no data lost; recovery not
   proven"). Link the restore test to the incident.
3. Fix the cause (backup settings, Railway support ticket, a second backup
   method such as a scheduled `pg_dump` to separate storage).
4. Repeat the restore test. Close the incident only after a **pass**.

## 8. Restoring production for real (disaster)

Only the Laboratory Director decides this.

1. Stop data entry (tell staff; use paper forms).
2. Record an IT incident (category data_integrity or outage).
3. Take an on-demand backup of the current (damaged) state first, for
   investigation.
4. Restore the chosen backup into production following Railway's dialog;
   deploy.
5. Run checks 1–7 of section 5 on production.
6. Re-enter on the LIMS the work done on paper and the records created
   between the backup time and the failure (from paper records, emails,
   printed reports). List them in the incident's "records affected".
7. Record what happened in the incident, raise an NC if results or reports
   were affected, and close the incident with the corrective action.
