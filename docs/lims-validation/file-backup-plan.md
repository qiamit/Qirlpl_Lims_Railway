# QIRLPL LIMS: backup of uploaded files (plan, not built)

| | |
|---|---|
| Document | QIRLPL-LIMS-BKP-FILES |
| Version | 0.1 (23 Oct 2026, plan for approval; nothing created yet) |
| Clause | ISO/IEC 17025:2017 7.11.3 c (data protected against loss), 7.5, 8.4 |
| Closes | B-2 open item "uploaded files have no backup" (`restore-test-B2.md` section 6) |
| Approver | Laboratory Director |

## 1. Today (checked 23 Oct 2026, read only)

| Item | State |
|---|---|
| Uploaded files | Railway bucket `qirlpl-lims-storage-bf0ydy` (production), read and written by `storage-api`. About 453 objects, 519 MiB (copy check of 23 Oct): client reference documents, equipment and IS code files, calibration files, management documents, signatures |
| Backup of the bucket | **None.** Railway does not back up or snapshot buckets, and buckets have no versioning. A file deleted or overwritten is gone; a deleted *bucket* can be restored for 52 hours only |
| Protection since 23 Oct (branch, migration 49) | In ten buckets only the uploader, QM or Director can delete or change a file; every upload, change and delete is in the audit trail. This narrows who can lose a file, but does not bring a lost file back |
| `lims-storage` (MinIO service, volume 248 MB) | Running since 18 Aug, **not used**: no service is configured to read or write it (`storage-api` uses the bucket; the other services only carry Railway's automatic `RAILWAY_SERVICE_LIMS_STORAGE_URL`, which the code never reads). Probably holds the files from before the move to the bucket. No backup |
| Database | Railway volume backups (daily kept 6 days, weekly kept 27 days); restore proven in B-2 |

Railway facts used below (docs.railway.com, 23 Oct 2026): bucket storage
$0.015 per GB-month, bucket egress and API calls free, traffic from a service
into a bucket billed as service egress ($0.05 per GB); each environment has its
own bucket instance; cron services run on a UTC schedule, must exit when
done, and a run is skipped while the previous one is still running.

## 2. What the plan gives

| Need | How |
|---|---|
| A second copy of every file, outside the live bucket | New bucket `qirlpl-lims-backup`, `current/` mirrors the live bucket every night |
| A file deleted or replaced by mistake can be brought back | Files that disappear from the live bucket are **moved** (not deleted) to `history/<date>/` in the backup bucket and kept |
| Database copies kept longer than Railway's 6 / 27 days | The same nightly job adds a compressed `pg_dump` (read-only) to `db/<date>.dump`; kept 90 days, plus the first of every month kept 7 years |
| Proof it works | The job checks the copy every night and fails visibly if it differs; a file restore is part of the 90-day restore test |
| A copy outside Railway (later, phase 2) | Monthly copy of `qirlpl-lims-backup` to storage the lab owns (Google Drive or Backblaze B2), so a Railway account problem cannot take both copies |

## 3. Design

### 3.1 Backup bucket

- Name `qirlpl-lims-backup`, created in the **production** environment of
  project `Qirlpl_Lims_Railway` (Railway → New → Bucket). Same region as the
  live bucket.
- Only the backup job gets its credentials. `storage-api`, the app and
  staff never see them, so nothing in the LIMS can delete a backup.
- Layout:

```
qirlpl-lims-backup/
  current/<live bucket path>        mirror of the live bucket, updated nightly
  history/2026-11-02/<path>         files that left the live bucket that night
  db/2026-11-02.dump                pg_dump -Fc of the LIMS database
  legacy-minio/<bucket>/<path>      one-time archive of the old MinIO volume (section 5)
  logs/2026-11-02.txt               the job's summary for that night
```

### 3.2 Nightly job `files-backup` (Railway cron service)

- Image: `postgres:18` (for `pg_dump`, same major version as the database)
  with `rclone` added (a small Dockerfile in `backend/backup-job/`).
- Schedule `30 20 * * *` (UTC) = **02:00 IST**, when the lab is closed and
  before Railway's database backup at 11:00 IST.
- Variables (Railway references, no values copied by hand): live bucket
  read-only use (`LIVE_ENDPOINT`, `LIVE_BUCKET`, keys from the live bucket's
  Credentials tab), backup bucket keys, and `DATABASE_URL` from the Postgres
  service. The job only reads the live bucket and the database.
- Steps (each one logged; any failure ends the run with a non-zero exit,
  which Railway shows as a failed cron run):

```sh
D=$(date -u +%F)
# 1. Files: mirror; anything removed or replaced in the live bucket goes to history/ instead of being deleted
rclone sync live:$LIVE_BUCKET backup:qirlpl-lims-backup/current \
  --backup-dir backup:qirlpl-lims-backup/history/$D --transfers 8 --checkers 16
# 2. Check the mirror
rclone check live:$LIVE_BUCKET backup:qirlpl-lims-backup/current --one-way --size-only
# 3. Database, read only
PGOPTIONS="-c default_transaction_read_only=on" pg_dump -d "$DATABASE_URL" -Fc -f /tmp/db.dump
pg_restore --list /tmp/db.dump > /dev/null            # the dump is readable
rclone copyto /tmp/db.dump backup:qirlpl-lims-backup/db/$D.dump
# 4. Retention for database dumps: delete db/*.dump older than 90 days except the 1st of each month (kept 7 years)
# 5. Summary line (objects, size, differences, dump size, minutes) to logs/$D.txt and the job log
```

- The `sync` never touches the live bucket (it is the source). Deleting a
  file in the live bucket does not delete it from the backup; it moves to
  `history/<date>/`.
- History of files is kept for **as long as the lab's record retention**
  (Lab Settings → retention rules; the longest today is the deciding one).
  At about 0.5 GB the whole backup costs a few rupees a month, so nothing
  needs to be pruned for cost.

### 3.3 Staging

Staging is not a fork of production, and Railway's API says a new service is
then created in every environment of the project (checked 23 Oct 2026; for
buckets the docs say each environment has its own instance). So the staging
environment gets its own (empty) `qirlpl-lims-backup` and `files-backup` too. In staging the job points at the staging bucket and
staging database, which makes it the test bed: build and run it there first.
After go-live, the cron schedule stays off in staging (or the staging
environment is deleted).

### 3.4 Restoring files

| Case | Command (run from the job's shell or a one-off service; Director decides) |
|---|---|
| One file deleted by mistake | Find it in the audit trail (`storage.objects` DELETE, bucket/path), then `rclone copyto backup:qirlpl-lims-backup/history/<date>/<path> live:<bucket>/<path>` |
| Whole bucket lost | `rclone copy backup:qirlpl-lims-backup/current live:<new bucket>`, point `storage-api` at it, then compare with `storage.objects` |
| Database older than Railway keeps | `pg_restore` the chosen `db/<date>.dump` into a **new** database first, check, then decide |

## 4. Checks and records

| When | What | Record |
|---|---|---|
| Every night | Job exit status and summary (`railway cron list` shows failed runs) | Job log, `logs/<date>.txt` |
| Weekly (QM, 2 minutes) | Last 7 runs succeeded; summary counts grow as expected | Initial on the weekly check sheet |
| Every 90 days | Restore test (B-2 procedure) **plus** a file restore: pick 3 files from the audit trail, restore them from `current/` and one from `history/` into a scratch folder, open them | Backup Restore Tests register, with "files" in the checks |
| After any file incident | Restore as in 3.4, IT incident record | IT Incidents |

## 5. The MinIO volume (decision)

| Option | What | For | Against |
|---|---|---|---|
| A. Keep as it is | Leave it running; add a weekly Railway volume backup | Nothing to decide now | Pays for a service no one uses (memory plus 248 MB volume); its contents stay unknown |
| **B. Archive, then remove (recommended)** | 1) List its objects and compare with the live bucket (read only). 2) Copy everything into `qirlpl-lims-backup/legacy-minio/` and check the copy. 3) Lab confirms. 4) Stop the service and keep its volume 30 days. 5) Delete the service and its volume | Keeps every old file, ends the cost and the confusion | Needs the MinIO keys for the copy (in its own variables) |
| C. Delete now | Remove service and volume | Simplest | Files that exist only there would be lost |

Do not delete the MinIO volume as a "volume" from the project: like
Postgres, staging was duplicated from production, so the staging and
production instances share a volume id. Delete it from the production
environment's service only, after option B step 4.

## 6. Order of work and approvals

Nothing below has been done. Each step waits for the Director's go-ahead.

| # | Step | Changes | Approval |
|---|---|---|---|
| 1 | Add `backend/backup-job/` (Dockerfile + `backup.sh`) to the branch; dry run of the script against staging only | Code on the branch | Plan approval |
| 2 | Create `qirlpl-lims-backup` bucket and the `files-backup` service; **run in staging first** (staging bucket + staging database), check the copy and one restore | Railway: new bucket + service (instances in both environments; production instance not scheduled yet) | Yes |
| 3 | Production: set the job's production variables, run once by hand (`railway cron run`), check the copy (453 objects, 519 MiB) and the dump | Production: new service run, reads only | Yes |
| 4 | Production: turn on the schedule `30 20 * * *` | Production | Yes |
| 5 | MinIO option B steps 1–2 (compare, archive) | Reads MinIO, writes the backup bucket | Yes |
| 6 | MinIO option B steps 3–5 after the lab confirms | Stops and later deletes the MinIO service | Yes |
| 7 | Update `backup-restore-procedure.md` (files now backed up, file restore in the 90-day test); record a restore test with the files part | Docs, LIMS register | — |
| 8 | Phase 2: monthly copy of the backup bucket to lab-owned storage | New external account | Later |

## 7. Cost (estimate)

| Item | Monthly |
|---|---|
| Backup bucket (files ≈ 0.5 GB + database dumps ≈ 0.3 GB/quarter) | about $0.02 |
| Cron job (a few minutes a night, small memory) | under $0.50 |
| Service egress into the backup bucket (only new files each night; first copy ≈ 0.5 GB ≈ $0.03 once) | a few cents |
| Saved by removing MinIO (option B) | its memory plus 248 MB volume (≈ $0.04 for the volume) |
