#!/bin/bash
# ArkPunks Database Backup Script
# Backs up SQLite database to Google Drive

set -e

# Configuration
DB_PATH="/home/ubuntulap/ArkPunks/server/database/arkade-punks-v2.db"
BACKUP_DIR="/tmp/arkpunks-backups"
REMOTE="gdrive:ArkPunks-Backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="arkpunks-db-${DATE}.db"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create safe backup using SQLite .backup command (safe even while DB is in use)
echo "[$(date)] Starting backup..."
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/${BACKUP_FILE}'"

# Compress the backup
gzip "${BACKUP_DIR}/${BACKUP_FILE}"
BACKUP_FILE="${BACKUP_FILE}.gz"

echo "[$(date)] Uploading to Google Drive..."
rclone copy "${BACKUP_DIR}/${BACKUP_FILE}" "$REMOTE" --progress

# Clean up local backup
rm -f "${BACKUP_DIR}/${BACKUP_FILE}"

# Keep only last 30 backups on Google Drive
echo "[$(date)] Cleaning old backups..."
rclone delete "$REMOTE" --min-age 30d 2>/dev/null || true

echo "[$(date)] Backup complete: $BACKUP_FILE"
