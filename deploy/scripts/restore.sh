#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

read -p "WARNING: This will overwrite the existing database. Continue? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Restore cancelled."
  exit 0
fi

echo "[Restore] Restoring database from: ${BACKUP_FILE}..."

gunzip -c "${BACKUP_FILE}" | docker exec -i walkie_postgres psql -U walkie -d postgres

echo "[Restore] Database restore completed successfully."
