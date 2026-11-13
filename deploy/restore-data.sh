#!/usr/bin/env bash
# Replaces ALL of Almanac's data on this machine with the rows in a dump file
# made by dump-data.sh (or the PC export in docs/deploy.md).
#
#   ./deploy/restore-data.sh /path/to/almanac-data.sql
#
# The database must already have every migration applied (npx supabase start
# or npx supabase migration up). It all happens in one transaction: if any
# row fails, nothing changes.
set -euo pipefail

file="${1:?Give the dump file, like ./deploy/restore-data.sh almanac-data.sql}"
db="supabase_db_almanac"
[ -s "$file" ] || { echo "Can't find $file, or it's empty." >&2; exit 1; }

read -r -p "This replaces all Almanac data on $(hostname) with $file. Type yes to go on: " ok
[ "$ok" = "yes" ] || { echo "Stopped, nothing changed."; exit 1; }

{
  echo "\\set ON_ERROR_STOP on"
  echo "SET client_min_messages = warning;"
  echo "BEGIN;"
  # Replica mode switches off triggers and foreign-key checks while loading,
  # so starter rows aren't added again and table order doesn't matter.
  echo "SET session_replication_role = replica;"
  echo "DO \$\$ DECLARE t record; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('TRUNCATE public.%I CASCADE', t.tablename);
    END LOOP;
  END \$\$;"
  echo "TRUNCATE auth.users CASCADE;"
  grep -v '^\\restrict\|^\\unrestrict' "$file"
  echo "COMMIT;"
} | docker exec -i "$db" psql -q -U supabase_admin -d postgres > /dev/null

echo "Done. Restart Almanac (sudo systemctl restart almanac) and sign in again."
