#!/usr/bin/env bash
# Nightly Almanac backup: one dated file of all the data, kept for 30 days.
# Runs from doherty's crontab (see docs/deploy.md, Stage 4). The PC copies
# the folder with its other Home Hub backups.
#
# To bring a backup back: gunzip it, then ./deploy/restore-data.sh the file.
set -euo pipefail

dir="${ALMANAC_BACKUP_DIR:-/mnt/storage/backups/almanac}"
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$dir"

file="$dir/almanac-$(date +%F).sql"
"$here/dump-data.sh" "$file"
gzip -f "$file"

# Keep 30 days.
find "$dir" -name 'almanac-*.sql.gz' -mtime +30 -delete
