#!/bin/bash
set -euo pipefail

# Directory where backups are stored
BACKUP_DIR="${BACKUP_DIR:-/var/backups/walkietalkie}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/walkietalkie_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[Backup] Starting PostgreSQL backup for Walkie Talkie..."

docker exec -t walkie_postgres pg_dumpall -c -U walkie | gzip > "${BACKUP_FILE}"

echo "[Backup] Successfully saved database dump to: ${BACKUP_FILE}"
echo "[Backup] File size: $(ls -lh "${BACKUP_FILE}" | awk '{print $5}')"

# Retain only backups from last 14 days
find "${BACKUP_DIR}" -type f -name "walkietalkie_backup_*.sql.gz" -mtime +14 -delete
echo "[Backup] Cleaned up backups older than 14 days."
