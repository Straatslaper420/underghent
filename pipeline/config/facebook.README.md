# Facebook events scraper — `config/facebook.json`

City-wide Facebook event discovery for Ghent via the Apify actor
[`apify/facebook-events-scraper`](https://apify.com/apify/facebook-events-scraper).
This is **discovery-first**: it sweeps location/search results, not a fixed venue list.

## Capturing the Ghent "explore" URL

1. Open <https://www.facebook.com/events> while logged in.
2. Search for **Gent** in the events search box.
3. Click the Ghent location result. The address bar now shows a URL of the form:

   ```
   https://www.facebook.com/events/explore/<slug>/<numeric-uid>
   ```

   e.g. `https://www.facebook.com/events/explore/gent/102155463159279`

4. Copy that full URL and paste it into `discovery.startUrls`, replacing the
   `PASTE_GHENT_EXPLORE_URL_HERE` placeholder. Any entry still equal to the
   placeholder is dropped automatically at scrape time.

### Surrounding towns

You can add **multiple** explore URLs to `discovery.startUrls` — one per
location — to cover towns around Ghent (Sint-Amandsberg, Gentbrugge, Ledeberg,
Drongen, Merelbeek, …). Repeat the steps above for each town and paste each URL
into the array. The bounding box (`ghentBounds`) still filters out anything that
lands too far away, so over-broad locations are safe.

## ⚠️ Billing

`maxEventsPerSource` is the actor's `maxEvents` cap and is billed **per search
query AND per start URL**. With 5 queries + 1 URL and `maxEventsPerSource: 200`,
the worst case is `6 × 200 = 1200` events scraped (and billed). Lower this value
to keep test runs cheap.

## Field reference

| Field | Meaning |
| --- | --- |
| `actorId` | Apify actor to run. Leave as `apify/facebook-events-scraper`. |
| `discoveryMode` | What to scrape: `"discovery"` (search queries + explore URLs), `"venues"` (fixed venue start URLs only), or `"both"` (concat of the two). |
| `maxEventsPerSource` | Actor `maxEvents` cap. **Billed per query and per URL** — see above. |
| `skipPastEvents` | If `true`, events already in the past (`isPast === true`) are dropped. |
| `lookaheadDays` | Drop events whose start date is more than this many days in the future. |
| `musicOnly` | If `true`, keep only events whose name+description match a keyword/alias from `config/genres.json` (case-insensitive). Default `false` skips the gate. |
| `proxy` | Apify proxy config passed straight to the actor. `RESIDENTIAL` is recommended for Facebook. |
| `discovery.searchQueries` | Free-text event searches (used in `discovery`/`both` modes). |
| `discovery.startUrls` | Facebook events explore/location URLs (used in `discovery`/`both` modes). |
| `venues.startUrls` | Fixed venue/page event URLs (used in `venues`/`both` modes). |
| `ghentBounds` | Lat/lng bounding box. Events **with** coordinates outside the box are dropped; events with **missing** coordinates are kept (geo enrichment resolves them later). |

## Run modes

```bash
# (A) pipeline mode — writes data/raw/facebook.json for normalize→…→export
npm run scrape:facebook

# (B) standalone — normalizes in place and pushes to the "fb_events" sheet tab
npm run scrape:facebook:to-sheet
```

`--to-sheet` requires `APIFY_TOKEN`, `GOOGLE_SHEETS_CREDENTIALS` and
`GOOGLE_SPREADSHEET_ID` in the environment (see `.env.example`). It dedups
against event IDs already present in the `Events` and `fb_events` tabs before
appending.
