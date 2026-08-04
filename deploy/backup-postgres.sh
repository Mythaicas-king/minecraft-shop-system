#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

OUTPUT_FILE="$BACKUP_DIR/minecraft-shop-$TIMESTAMP.dump"

pg_dump "$DATABASE_URL" -Fc -f "$OUTPUT_FILE"
find "$BACKUP_DIR" -type f -name 'minecraft-shop-*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $OUTPUT_FILE"
