#!/usr/bin/env bash
# Saves a copy of all of Almanac's data (not its table layout) to one file.
#
#   ./deploy/dump-data.sh /path/to/almanac-data.sql
#
# The file holds the household's rows plus the sign-in accounts, and the Git
# commit it came from, so a restore knows which migrations it needs.
# Restore it with ./deploy/restore-data.sh.
set -euo pipefail

out="${1:?Give a file to write, like ./deploy/dump-data.sh almanac-data.sql}"
db="supabase_db_almanac"
here="$(cd "$(dirname "$0")/.." && pwd)"
commit="$(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo unknown)"
tmp="$(mktemp)"

{
  echo "-- Almanac data dump, $(date -Iseconds), code at commit $commit"
  docker exec "$db" pg_dump -U supabase_admin -d postgres --data-only \
    --table=auth.users --table=auth.identities
  docker exec "$db" pg_dump -U supabase_admin -d postgres --data-only \
    --schema=public 2>/dev/null
} > "$tmp"

# A dump with no households in it means something went wrong.
grep -q "^COPY public.households " "$tmp" || { echo "Dump looks empty, not saved." >&2; rm -f "$tmp"; exit 1; }
mv "$tmp" "$out"
echo "Saved $(wc -c < "$out") bytes to $out"
