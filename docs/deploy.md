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

**Art for the screen saver** lives on the server's big drive, and you add
paintings whenever you like. On the server:

```
mkdir -p /mnt/storage/media/almanac-art/{General,Spring,Summer,Autumn,Winter}
```

Add `ART_FOLDER=/mnt/storage/media/almanac-art` to `/opt/almanac/.env.local`.
Holiday and birthday folders are named to match them in Almanac (like
`Halloween`). On the PC the folder is `M:\almanac-art` (pin it to Quick
access); drag paintings in and they show up without a restart.

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
The backups folder is owned by root, so on the server first make Almanac's
folder yours:

```
sudo mkdir -p /mnt/storage/backups/almanac
sudo chown doherty:doherty /mnt/storage/backups/almanac
```

Then `crontab -e` and add:

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

1. Install **Ubuntu Desktop** (the kitchen PC runs 26.04 LTS, which is
   Wayland only). Make a user that signs in automatically (Settings › Users ›
   Automatic Login), so it comes back to Almanac after a power cut.
2. On Wayland the launcher needs its GNOME Shell extension (step 2b of
   `launcher-helper/README.md`). On Ubuntu 24.04 or older it can use Xorg
   instead: add `WaylandEnable=false` under `[daemon]` in
   `/etc/gdm3/custom.conf` and restart.
3. Turn off the screen blanking Ubuntu does by itself (Settings › Power ›
   Screen Blank: Never); Almanac's art screen saver handles that.
4. In BIOS (F1 at power on) set **After Power Loss: Power On**. Do the same on
   the server.
5. Install the tools: `sudo apt install -y curl` (plus `wmctrl python3-gi gir1.2-gtk-3.0` on Xorg),
   `sudo snap install chromium`, Node 24 (same two NodeSource lines as the
   server), `sudo usermod -aG input $USER`, and stop Ubuntu blanking the screen:
   `gsettings set org.gnome.desktop.session idle-delay 0` and
   `gsettings set org.gnome.desktop.screensaver lock-enabled false`.
6. Copy the launcher from the server (the repository is private, so no
   `git clone` here). On the server:
   `cd /opt/almanac && tar czf /tmp/launcher-helper.tgz launcher-helper && cd /tmp && python3 -m http.server 8765`
   and on the kitchen PC:
   `mkdir -p ~/almanac && cd ~/almanac && curl -O http://192.168.2.42:8765/launcher-helper.tgz && tar xzf launcher-helper.tgz`.
   Ctrl+C on the server when done. Reboot the kitchen PC.
7. Follow `launcher-helper/README.md` from step 3 (the example config already
   points at `http://192.168.2.42:3001`). Before turning on kiosk mode, open
   Almanac once in a normal window with the kiosk's profile, sign in and
   allow local network access:
   `chromium --class=almanac --user-data-dir=$HOME/almanac-launcher/profiles/almanac http://192.168.2.42:3001`

The kitchen PC must stay on **Wi-Fi**: the router reserves 192.168.2.42 for
its Ethernet port (the boxes swapped drives), and the server answers on .42 as
an extra fixed address in its netplan file.

## Good to know

- Pages are plain `http://` on the home network. Some browser features need
  `https://` (for example `crypto.randomUUID`), so the code uses `newId()`
  from `src/lib/ids.ts` instead.
- Supabase Studio (the database's admin pages) is on
  `http://192.168.2.42:54323` for anyone on the home network. Look, but don't
  edit tables there: every change is a migration.
- Never run `npm run db:reset` on the server. It wipes all the data.
- Secure Boot is off on the server box: its firmware didn't trust Ubuntu
  26.04's newer signature after the drive swap.
