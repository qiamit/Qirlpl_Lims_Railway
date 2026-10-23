#!/usr/bin/env bash
# Backup of uploaded files and the LIMS database into the backup bucket
# (docs/lims-validation/file-backup-plan.md). Runs once and exits; Railway's
# cron schedule starts it (02:00 IST = 20:30 UTC in production, after approval).
#
#   current/<path>        mirror of the live file bucket
#   history/<date>/<path> files that left the live bucket (deleted or replaced)
#   db/<date>.dump        pg_dump -Fc of the database (read-only session)
#   logs/<date>.txt       this run's summary
#
# The live bucket and the database are only read. Prints no secrets.
# Variables: LIVE_ENDPOINT LIVE_BUCKET LIVE_ACCESS_KEY_ID LIVE_SECRET_ACCESS_KEY
#            BACKUP_ENDPOINT BACKUP_BUCKET BACKUP_ACCESS_KEY_ID BACKUP_SECRET_ACCESS_KEY
#            DATABASE_URL
# Optional:  DB_KEEP_DAYS (90), MONTHLY_KEEP_DAYS (2557 = 7 years), SKIP_DB=1
set -uo pipefail

D=$(date -u +%F)
T0=$(date +%s)
ENV_NAME=${RAILWAY_ENVIRONMENT_NAME:-unknown}
SUMMARY=()
log() { echo "[backup] $*"; SUMMARY+=("$*"); }
fail() { log "FAILED: $*"; write_summary; exit 1; }
write_summary() {
  printf '%s\n' "${SUMMARY[@]}" | rclone rcat "backup:$BACKUP_BUCKET/logs/$D.txt" --s3-no-check-bucket 2>/dev/null || true
}

for v in LIVE_ENDPOINT LIVE_BUCKET LIVE_ACCESS_KEY_ID LIVE_SECRET_ACCESS_KEY BACKUP_ENDPOINT BACKUP_BUCKET BACKUP_ACCESS_KEY_ID BACKUP_SECRET_ACCESS_KEY; do
  [ -n "${!v:-}" ] || { echo "[backup] STOP: $v is not set (environment $ENV_NAME)"; exit 1; }
done
[ "$LIVE_BUCKET" != "$BACKUP_BUCKET" ] || { echo "[backup] STOP: live and backup bucket are the same"; exit 1; }
case "$BACKUP_BUCKET" in *backup*) ;; *) echo "[backup] STOP: backup bucket name does not contain 'backup'"; exit 1;; esac

s3remote() { # name endpoint key secret
  local n=$1
  export "RCLONE_CONFIG_${n}_TYPE=s3" "RCLONE_CONFIG_${n}_PROVIDER=Other" "RCLONE_CONFIG_${n}_ENDPOINT=$2" \
         "RCLONE_CONFIG_${n}_ACCESS_KEY_ID=$3" "RCLONE_CONFIG_${n}_SECRET_ACCESS_KEY=$4" \
         "RCLONE_CONFIG_${n}_REGION=auto" "RCLONE_CONFIG_${n}_FORCE_PATH_STYLE=false"
}
s3remote LIVE "$LIVE_ENDPOINT" "$LIVE_ACCESS_KEY_ID" "$LIVE_SECRET_ACCESS_KEY"
s3remote BACKUP "$BACKUP_ENDPOINT" "$BACKUP_ACCESS_KEY_ID" "$BACKUP_SECRET_ACCESS_KEY"
R="--s3-no-check-bucket"

log "run $D environment=$ENV_NAME live=$LIVE_BUCKET backup=$BACKUP_BUCKET start=$(date -u +%FT%TZ)"
log "live: $(rclone size "live:$LIVE_BUCKET" $R 2>&1 | tr '\n' ' ')"

# 1. Files. The live bucket is the source and is never written. Anything that
#    left it since the last run is moved to history/<date>/, not deleted.
rclone sync "live:$LIVE_BUCKET" "backup:$BACKUP_BUCKET/current" \
  --backup-dir "backup:$BACKUP_BUCKET/history/$D" $R \
  --transfers 8 --checkers 16 --stats-one-line --stats 60s 2>&1 | tail -3 | sed 's/^/[backup] sync: /'
[ "${PIPESTATUS[0]}" = 0 ] || fail "file sync"

# 2. Check the mirror against the live bucket.
if CHK=$(rclone check "live:$LIVE_BUCKET" "backup:$BACKUP_BUCKET/current" --one-way --size-only $R 2>&1); then
  log "check: no differences"
else
  log "check: $(echo "$CHK" | tail -2 | tr '\n' ' ')"; fail "copy differs from the live bucket"
fi
log "current: $(rclone size "backup:$BACKUP_BUCKET/current" $R 2>&1 | tr '\n' ' ')"
log "history $D: $(rclone size "backup:$BACKUP_BUCKET/history/$D" $R 2>&1 | tr '\n' ' ')"

# 3. Database, read only.
if [ "${SKIP_DB:-}" != 1 ]; then
  [ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set"
  PGOPTIONS="-c default_transaction_read_only=on" pg_dump -d "$DATABASE_URL" -Fc -f /tmp/db.dump 2>/tmp/dump.err || fail "pg_dump: $(tail -1 /tmp/dump.err)"
  pg_restore --list /tmp/db.dump > /dev/null 2>&1 || fail "the dump cannot be read"
  rclone copyto /tmp/db.dump "backup:$BACKUP_BUCKET/db/$D.dump" $R || fail "upload of the database dump"
  log "db: $D.dump $(du -h /tmp/db.dump | cut -f1)"
  rm -f /tmp/db.dump /tmp/dump.err
  # 4. Retention of database dumps: daily ones for DB_KEEP_DAYS, the 1st of each month for MONTHLY_KEEP_DAYS.
  rclone delete "backup:$BACKUP_BUCKET/db" --min-age "${DB_KEEP_DAYS:-90}d" --exclude "*-01.dump" $R || fail "db retention"
  rclone delete "backup:$BACKUP_BUCKET/db" --min-age "${MONTHLY_KEEP_DAYS:-2557}d" --include "*-01.dump" $R || fail "db retention (monthly)"
fi

log "done in $(( $(date +%s) - T0 ))s"
write_summary
exit 0
