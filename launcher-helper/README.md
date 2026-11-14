# Almanac launcher (kitchen screen PC)

This little program lets the kitchen screen open apps from Almanac's menu
tray, like a phone's home screen. Tap **Jellyfin** and it opens full screen;
tap the **Almanac** pill in the corner (or close the app) and you're back.

It only runs on the kitchen PC. The iPad and phones can't find it, so they
never show the apps.

## What it does

- **Opens apps.** Web apps on the server (Jellyfin, Actual) open in their own
  full-screen browser window. Programs on this PC (Steam, FreeTube, emulators)
  start from the list in `launcher.config.json`, and nothing else can be
  started: Almanac only ever names a program from that list.
- **The Almanac pill.** While an app is open, a small "Almanac" button waits,
  hidden, in a corner. Only a finger on the touchscreen shows it (a game
  controller, mouse or keyboard don't). It hides again after 4 seconds. Tap it
  to close the app and go back to Almanac.
- **Coming back by itself.** When you quit an app the normal way, Almanac is
  brought back to the front.
- **Screen off overnight.** When the art screen saver is set to "Screen off"
  overnight (Settings › Screen saver), Almanac asks the helper to put the
  monitor to sleep. A touch wakes it. It never does this while an app is
  open.

The up checks and the "isn't answering" heads-up are done by Almanac itself
(Settings › Apps), not by this helper.

## What it needs

It works on either of Ubuntu's desktops, and picks the right way by itself:

- **Wayland** (the only desktop on Ubuntu 25.10 and newer, including the
  kitchen PC's 26.04). Programs can't float above other windows there, so a
  small add-on for the desktop, the **Almanac GNOME Shell extension** in
  `gnome-extension/`, draws the pill, brings Almanac's window back and turns
  the screen off when the helper asks. Setting-up step 2b installs it.
- **Xorg** (Ubuntu 24.04 and older, "Ubuntu on Xorg" at sign-in). The helper
  uses `pill.py` (GTK), `wmctrl` and `xset` instead:
  `sudo apt install wmctrl python3-gi gir1.2-gtk-3.0`.

Either way it needs:

- **Node.js 22.18 or newer** (it runs this TypeScript file directly). On
  Ubuntu, install Node 24 from NodeSource:
  `curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -` then
  `sudo apt install -y nodejs`.
- Chromium (`sudo snap install chromium`) for Almanac itself and for the web
  apps.

## Setting it up

1. **Copy the code to the kitchen PC**, so this folder ends up at
   `~/almanac/launcher-helper`. The repository is private, so copy it from
   the server (see docs/deploy.md, Stage 5).
2. **Let it see the touchscreen.** `sudo usermod -aG input $USER`, then sign
   out and back in. (Without this, the pill can't tell when you touch the
   screen.)
2b. **Wayland only: add the desktop extension.**
   ```
   mkdir -p ~/.local/share/gnome-shell/extensions
   cp -r ~/almanac/launcher-helper/gnome-extension/almanac-shell@almanac.local ~/.local/share/gnome-shell/extensions/
   ```
   Sign out and back in (or restart), then:
   `gnome-extensions enable almanac-shell@almanac.local`
   Check it: `gnome-extensions info almanac-shell@almanac.local` should say
   `State: ACTIVE`. To see the pill by hand:
   `gdbus call --session --dest org.almanac.Shell --object-path /org/almanac/Shell --method org.almanac.Shell.ShowPill "'bottom-left'"`
   (and `...HidePill` to hide it). After changing the extension's files, sign
   out and in again: Wayland only reloads extensions at sign-in.
3. **Fill in the settings.** In `~/almanac/launcher-helper`, copy
   `launcher.config.example.json` to `launcher.config.json` and change:
   - `almanacOrigins`: the address you open Almanac at on this PC, exactly as
     in the address bar but without anything after the port, e.g.
     `"http://192.168.2.42:3001"` (the Home Hub server). Only pages from these addresses can ask the
     helper to do anything.
   - `browser`: `["chromium"]`, or `["google-chrome"]` if you use Chrome.
   - `programs`: one entry for each program on this PC. The name before the
     colon (like `steam`) is what you pick in Almanac's Settings › Apps. The
     `command` is what you'd type in a terminal, split into words.
     Steam's Big Picture mode hands off to Steam if it's already running, so
     it has `"handsOff": true` and a `close` command.
4. **Try it.** `node ~/almanac/launcher-helper/almanac-launcher.ts`
   It should say it's listening and watching the touchscreen. Leave it running.
5. **Start it at sign-in.**
   ```
   mkdir -p ~/.config/systemd/user
   cp ~/almanac/launcher-helper/almanac-launcher.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now almanac-launcher
   ```
   To see what it's doing: `journalctl --user -u almanac-launcher -f`
6. **Open Almanac full screen at sign-in.** Edit `almanac-kiosk.desktop`:
   put your user name in place of `USER` and Almanac's address at the end, then
   `cp ~/almanac/launcher-helper/almanac-kiosk.desktop ~/.config/autostart/`.
   The `--class=almanac` part is how the helper finds Almanac's window again
   (on Wayland the extension also finds it by its "Almanac" title).
7. **Allow the connection once.** The first time Almanac talks to the helper,
   Chrome may ask whether Almanac can "access other apps and services on this
   device" (or "devices on your local network"). Say **Allow**. If you're
   already in full-screen kiosk mode and can't see the question, open Almanac
   once in a normal window first, allow it there, then go back to kiosk mode.
8. **Add the apps in Almanac.** On the kitchen screen: Settings › Apps ›
   Add an app. Web apps need their address (like `http://192.168.2.42:8096` for Jellyfin);
   programs are picked from the helper's list.

## Changing things later

- Edit `launcher.config.json`, then `systemctl --user restart almanac-launcher`.
- The pill's corner: `"pill": { "corner": "bottom-right" }` (or `top-left`,
  `top-right`). How long it stays: `"hideAfterSeconds": 4`.
- If the pill reacts to the wrong device, set `"touchscreen"` to part of the
  touchscreen's name (see `cat /proc/bus/input/devices`).
- Each web app keeps its own sign-in in `~/almanac-launcher/profiles/`.
  Deleting a folder there signs that app out.

## Files

- `almanac-launcher.ts`: the helper.
- `lib.ts` and `lib.test.ts`: its rules and their tests (`npm test` runs them).
- `pill.py`: draws the pill on Xorg.
- `gnome-extension/`: draws the pill, switches windows and turns the screen
  off on Wayland.
- `launcher.config.example.json`: settings to copy.
- `almanac-launcher.service`, `almanac-kiosk.desktop`: start-at-sign-in files.
