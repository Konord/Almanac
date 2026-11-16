# Weather and pollen

The calendar screens (Today, Week, Month) show the weather in the header: a
picture and the temperature. Under it, today's pollen level shows when
pollen is in season. Tap the weather to see now, the next 5 days, and the
tree, grass and weed pollen for each day.

Two services provide the data, and Almanac's server asks both of them:

| What | Service | Account or key | Cost |
| --- | --- | --- | --- |
| Weather | [Open-Meteo](https://open-meteo.com) | None | Free for home use |
| Pollen | [Google Pollen API](https://developers.google.com/maps/documentation/pollen) | An API key, with billing on | Free up to 5,000 checks a month |

Open-Meteo has pollen too, but only for Europe. Google's covers Canada.

The server remembers each answer. Weather is checked at most every 15
minutes, and pollen at most every 3 hours, which comes to about 250 Google
checks a month. If a service doesn't answer, the last answer stays up for
up to 12 hours.

## 1. Pick the place (weather)

Go to **Settings › Weather**, type your town, tap **Find**, tap the right
match, then tap **Save**. That's all the weather needs.

## 2. Make a Google key (pollen)

1. Go to https://console.cloud.google.com and create a project (for
   example "Almanac").
2. Open **Billing** and link a billing account. Google requires one even
   for the free amount. Under **Budgets & alerts**, add a small budget (for
   example $1) so Google emails you if anything ever costs money.
3. Open **APIs & Services › Library**, search for **Pollen API**, and
   click **Enable**.
4. Open **APIs & Services › Credentials › Create credentials › API key**.
   Edit the key, and under **API restrictions** pick **Restrict key** and
   choose **Pollen API** only.
5. Optional safety cap: open **APIs & Services › Pollen API › Quotas** and
   set the requests per day to 100. Almanac uses about 8 a day.

## 3. Give the key to Almanac

On the server (SSH), add one line to `/opt/almanac/.env.local`:

```
GOOGLE_POLLEN_API_KEY=paste-the-key
```

Then restart Almanac: `sudo systemctl restart almanac`. Settings › Weather
will now say "Pollen is on".

On the PC, put the same line in the PC's `.env.local` and restart
`npm run dev`.

## Reading the pollen

Google uses the Universal Pollen Index, from 0 to 5: None, Very low, Low,
Moderate, High and Very high. "Off season" means that type of pollen isn't
in the air at this time of year. The header only shows pollen when today
is at least Very low, so in winter it shows today's high and low instead.
