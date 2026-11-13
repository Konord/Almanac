# Running Almanac on the Home Hub

Almanac runs on the **Home Hub server** (Lenovo ThinkCentre M920q, Ubuntu
Server, `homehub`, 192.168.2.42). The **kitchen screen** is a second M920q
running Ubuntu Desktop, which just shows Almanac full screen in a browser and
runs the app launcher (`launcher-helper/`).

Each command block says where it runs. "On the server" means in an SSH
session (`ssh hub` from the PC; your prompt shows `doherty@homehub`).

## How it fits together

- **Supabase** (the database) runs in Docker, set up by the Supabase command
  line tool exactly like on the PC. Its containers restart by themselves after
  a reboot. Almanac only talks to it from the server itself, so the address in
  `.env.local` stays `http://127.0.0.1:54321`.
- **Almanac** is a production build (`npm run build`, then `npm start`) on
  port 3001, run by systemd (`deploy/almanac.service`), which starts it at
  boot and restarts it if it stops. Port 3000 belongs to Homepage.
- The code lives in `/opt/almanac`, not `/opt/stacks`: the nightly config
  backup stops and copies `/opt/stacks`, and Almanac has its own backup.
- Everyone opens **http://192.168.2.42:3001** (phones away from home:
  `http://100.67.90.117:3001` over Tailscale).

## Stage 1: install

On the server:

```
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo mkdir /opt/almanac
sudo chown doherty:doherty /opt/almanac
git clone git@github.com:Konord/Almanac.git /opt/almanac
cd /opt/almanac
npm ci
npx supabase start
cp .env.example .env.local
nano .env.local      # paste the Publishable key from `npx supabase status`
```

## Stage 2: move the data from the PC

This copies every row (and the sign-in accounts) from the PC's database to the
server's. The PC copy isn't changed. Both must be on the same code version
(check with `git log -1 --oneline` on each).

In PowerShell on the PC, with Docker Desktop and the PC's Supabase running:

```
docker exec supabase_db_almanac sh -c "pg_dump -U supabase_admin -d postgres --data-only --table=auth.users --table=auth.identities > /tmp/a.sql && pg_dump -U supabase_admin -d postgres --data-only --schema=public > /tmp/b.sql 2>/dev/null && cat /tmp/a.sql /tmp/b.sql > /tmp/almanac-data.sql"
docker cp supabase_db_almanac:/tmp/almanac-data.sql $HOME\almanac-data.sql
scp $HOME\almanac-data.sql hub:/opt/almanac/
```

On the server:

```
cd /opt/almanac
./deploy/restore-data.sh almanac-data.sql
```

It asks you to type `yes`, wipes the server's (empty) database and loads the
PC's rows in one go. If anything fails, nothing changes. Devices will need to
sign in again once, with the same email and password as on the PC.

**Art for the screen saver** lives on the server's big drive. In PowerShell on
the PC (M: is the server's media share):

```
robocopy "$HOME\OneDrive\Desktop\Art Screensaver" "M:\almanac-art" /E
```

Then on the server, add `ART_FOLDER=/mnt/storage/media/almanac-art` to
`/opt/almanac/.env.local`.

## Stage 3: run it and start on boot

On the server:

```
cd /opt/almanac
npm run build
sudo cp deploy/almanac.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now almanac
```

- Is it running? `systemctl status almanac`
- What's it saying? `journalctl -u almanac -f` (Ctrl+C to stop watching)
- Restart after changing `.env.local`: `sudo systemctl restart almanac`.
  `NEXT_PUBLIC_` settings are baked in when building, so after changing those
  run `npm run build` first.

Test a reboot once: `sudo reboot`, wait two minutes, open the address.

## Stage 4: nightly backups

`deploy/backup.sh` saves one file of all the data each night to
`/mnt/storage/backups/almanac/almanac-YYYY-MM-DD.sql.gz` and keeps 30 days.
On the server, `crontab -e` and add:

```
45 3 * * * /opt/almanac/deploy/backup.sh >> /mnt/storage/backups/almanac/backup.log 2>&1
```

The PC's "HomeHub config backup" task copies the server's backups share to
the PC, so check it includes the `almanac` folder.

**Bringing a backup back** (on the server):

```
cd /opt/almanac
gunzip -k /mnt/storage/backups/almanac/almanac-2026-11-20.sql.gz
./deploy/restore-data.sh /mnt/storage/backups/almanac/almanac-2026-11-20.sql
sudo systemctl restart almanac
```

The first line of each backup names the code version it came from. Restore
into a database with that version's migrations or newer.

## Updating to a new version

When a pull request is merged, on the server:

```
cd /opt/almanac
./deploy/update.sh
```

It backs up first, pulls, runs `npm ci`, applies new migrations with
`npx supabase migration up` (never `db:reset`), rebuilds and restarts.

## Stage 5: the kitchen screen

1. Install **Ubuntu Desktop** (24.04 LTS or newer) on the second M920q. Make
   a user that signs in automatically (Settings › Users › Automatic Login),
   so it comes back to Almanac after a power cut.
2. On the sign-in screen choose **Ubuntu on Xorg** (the gear, bottom right)
   once; the launcher's pill needs Xorg.
3. Turn off the screen blanking Ubuntu does by itself (Settings › Power ›
   Screen Blank: Never); Almanac's art screen saver handles that.
4. In BIOS (F1 at power on) set **After Power Loss: Power On**. Do the same on
   the server.
5. Install Chromium and set up the launcher: follow `launcher-helper/README.md`.
   Almanac's address there is `http://192.168.2.42:3001`.

## Good to know

- Pages are plain `http://` on the home network. Some browser features need
  `https://` (for example `crypto.randomUUID`), so the code uses `newId()`
  from `src/lib/ids.ts` instead.
- Supabase Studio (the database's admin pages) is on
  `http://192.168.2.42:54323` for anyone on the home network. Look, but don't
  edit tables there: every change is a migration.
- Never run `npm run db:reset` on the server. It wipes all the data.
