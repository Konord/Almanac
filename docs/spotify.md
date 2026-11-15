# Connecting Spotify

The Today panel can show the song playing on Connor's Spotify account, with
pause and skip. The music keeps playing from wherever it is (a phone, a
Bluetooth speaker): Almanac only shows it and sends the button presses.

This needs Spotify Premium (Spotify's rule for apps like this since
February 2026). You do it once.

## 1. Make a Spotify app

1. Go to https://developer.spotify.com/dashboard and sign in with the
   Spotify account Almanac should show.
2. Create app. Any name (e.g. "Almanac"). Tick **Web API**.
3. Redirect URI: `http://127.0.0.1:3001/api/spotify/callback`
   (exactly that: Spotify accepts `127.0.0.1` but not `localhost` or the
   server's network address).
4. Save, then open the app's Settings and copy the **Client ID** and
   **Client secret**.

## 2. Give them to Almanac

On the server (SSH), add two lines to `/opt/almanac/.env.local`:

```
SPOTIFY_CLIENT_ID=paste-the-client-id
SPOTIFY_CLIENT_SECRET=paste-the-client-secret
```

Then restart: `sudo systemctl restart almanac`.

## 3. Connect, through a tunnel

Spotify only sends the sign-in back to `127.0.0.1` ("this computer"). An
SSH tunnel makes the server's Almanac appear at `127.0.0.1` on the PC.

In PowerShell on the PC (stop the PC's own copy of Almanac first if it's
running on port 3001):

```
ssh -L 3001:127.0.0.1:3001 hub
```

Leave that window open. In a browser on the PC, go to
`http://127.0.0.1:3001`, sign in to Almanac, open Settings › Spotify and
tap **Connect Spotify**. Say yes on Spotify's page. You land back in
Settings with "Spotify is connected."

Close the tunnel window. Almanac keeps a long-lasting key, so it stays
connected; the kitchen screen never needs to sign in.
