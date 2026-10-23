# Nightly backup of uploaded files and the LIMS database
# (docs/lims-validation/file-backup-plan.md). pg_dump must match the
# database's major version (Postgres 18).
FROM postgres:18

RUN apt-get update \
 && apt-get install -y --no-install-recommends rclone ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backup.sh /app/backup.sh

CMD ["bash", "/app/backup.sh"]
