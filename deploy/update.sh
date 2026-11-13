#!/usr/bin/env bash
# Brings the server up to the newest Almanac on GitHub.
#
#   cd /opt/almanac && ./deploy/update.sh
#
# Saves a backup first, then gets the code, applies new migrations (never a
# reset), rebuilds and restarts.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1/5 Backing up the data first"
./deploy/backup.sh
echo "2/5 Getting the newest code"
git pull --ff-only
echo "3/5 Installing building blocks"
npm ci
echo "4/5 Applying new database changes"
npx supabase migration up
echo "5/5 Building and restarting"
npm run build
sudo systemctl restart almanac
echo "Done. Almanac is on $(git log -1 --format='%h %s')"
