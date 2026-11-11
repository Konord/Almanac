# Almanac launcher (kitchen PC)

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

The up checks and the "isn't answering" heads-up are done by Almanac itself
(Settings › Apps), not by this helper.

## What it needs

- Ubuntu with the **Xorg** desktop. On the sign-in screen, click your name,
  then the gear in the bottom-right corner, and pick **Ubuntu on Xorg**. (The
  newer Wayland desktop doesn't let a window float above full-screen games,
  so the pill wouldn't show.) You only do this once.
- **Node.js 22.18 or newer** (it runs this TypeScript file directly):
  `sudo apt install nodejs` gives an older one on some Ubuntu versions; if
  `node -v` says less than 22.18, install Node 24 from https://nodejs.org.
- `wmctrl`, to bring Almanac's window back to the front:
  `sudo apt install wmctrl`
- Chromium (or Google Chrome) for Almanac itself and for the web apps.
- GTK for Python, which draws the pill. It comes with Ubuntu's desktop; if the
  log says the pill won't start, run `sudo apt install python3-gi gir1.2-gtk-3.0`.

## Setting it up

1. **Copy the code to the kitchen PC.** The easiest way is to clone the whole
   Almanac repository into your home folder, so this folder ends up at
   `~/almanac/launcher-helper`:
   `git clone https://github.com/Konord/Almanac.git ~/almanac`
2. **Let it see the touchscreen.** `sudo usermod -aG input $USER`, then sign
   out and back in. (Without this, the pill can't tell when you touch the
   screen.)
3. **Fill in the settings.** In `~/almanac/launcher-helper`, copy
   `launcher.config.example.json` to `launcher.config.json` and change:
   - `almanacOrigins`: the address you open Almanac at on this PC, exactly as
     in the address bar but without anything after the port, e.g.
     `"http://192.168.2.23:3001"`. Only pages from these addresses can ask the
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
   The `--class=almanac` part is how the helper finds Almanac's window again.
7. **Allow the connection once.** The first time Almanac talks to the helper,
   Chrome may ask whether Almanac can "access other apps and services on this
   device" (or "devices on your local network"). Say **Allow**. If you're
   already in full-screen kiosk mode and can't see the question, open Almanac
   once in a normal window first, allow it there, then go back to kiosk mode.
8. **Add the apps in Almanac.** On the kitchen screen: Settings › Apps ›
   Add an app. Web apps need their address (like `http://192.168.2.10:8096`);
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
- `pill.py`: draws the pill.
- `launcher.config.example.json`: settings to copy.
- `almanac-launcher.service`, `almanac-kiosk.desktop`: start-at-sign-in files.
