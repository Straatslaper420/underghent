# UNDERGHENT v5 — Rework Plan (APPROVED 2026-06-12, with amendments)

Amendments from review: **keep every current header column** (`details` = short descriptions; `aggregator_id`/`city`/`country`/`collective`/`social_links` needed for aggregator + future collective fb/insta Apify scraping). No columns renamed — existing names stay scraper-owned, override columns are *added*. Molotov: no scraper, clean up the stale artifact; it flows through the FB Apify path later. Kompass: closed, no scraper until further notice.

Audit basis: full read of pipeline source, raw scrape outputs (fill-rate analysis), both frontends, live checks of trefpunt.be, clubsauvage.be and kinkystar.com (June 12, 2026). No code has been modified.

---

## 1. CORE ARCHITECTURE — Sheets per-column ownership

### Bugs found (these explain your vanishing edits)

1. **`exportSheets` blindly APPENDS.** Every pipeline run appends all future events to the Events tab again — no upsert keyed on `event_id`. Rows duplicate, and your edits sit on orphaned old rows. (`readExistingEventIds()` exists in sheets.ts but is never called by the export.)
2. **`pull-geo` only fills blanks.** It copies your lat/lng back *only when the local value is null* — correcting a WRONG coordinate never sticks. Address same. Genre/venue edits are never pulled at all.
3. Rows are written **positionally** against a hard-coded header array — any column a human inserts breaks alignment.

### New Events tab schema (exact)

Single key: `event_id` (col A). Writes become **header-name-addressed upserts**: the pipeline looks up each column by header text, writes only the columns it owns, and never touches override columns or unknown human-added columns. Structurally impossible to clobber.

| Owner | Columns |
|---|---|
| pipeline (auto, overwritten every run) | ALL existing columns keep their names and stay scraper-owned: `event_id`, `facebook_id`, `venue_id`, `aggregator_id`, `title`, `date_start`, `hour_start`, `venue`, `room`, `address`, `area`, `latitude`, `longitude`, `genre`, `subgenre`, `artists`, `source_url`, `ticket_url`, `price`, `details`, `description`, `interested`, `going`, `city`, `country`, `organizers`, `social_links`, `collective`, `status`. NEW auto columns appended: `source`, `hour_end`, `support_acts`, `image_url`, `last_seen`. |
| human (never written by pipeline) | NEW: `venue_override`, `latitude_override`, `longitude_override`, `genre_override`, `hide` (TRUE = never shown), `approved` (optional gate), `notes` |

`status` becomes pipeline-owned (`new`/`duplicate`/`gone`); the human approve/reject gating that pull-geo used to read from `status` moves to the explicit `hide`/`approved` columns. New columns are appended to the right of existing ones; nothing is reordered, so the published CSV keeps parsing.

### Merge rules

- **Export** = upsert by `event_id`: update auto columns of existing rows in place, append genuinely new rows (override cells left blank). Events that disappear from the scrape get `status_auto = gone` (+ `last_seen`), never deleted — your overrides survive.
- **Pull-overrides** (replaces pull-geo, same proven pattern generalized): each run reads all `*_override` + `hide`/`approved` and carries them into canonical so enrich/dedupe respect them. lat/lng override now *always* wins, not only when local is blank.
- **Frontend + pipeline rule everywhere:** use `_override` if non-empty, else `_auto`. No cross-ownership fallback writing.
- **GeoFail** keeps the same schema; filling `latitude_override`/`longitude_override` there promotes the row to Events on the next run.
- **fb_events** gets the same named-column upsert (already keyed on `facebook_id`) + the new `image_url`, `hide` columns.
- **Venues tab** stays a strict two-way mirror; gains `initials` and `hide` columns so the frontend needs nothing hand-maintained.

---

## 2. SCRAPERS

### Dead scrapers — root causes (verified)

| Scraper | Diagnosis | Fix |
|---|---|---|
| **trefpunt** (0) | Verified live in a real browser: the date cards ("VR 12 JUN …") are `<strong>` elements sitting **directly inside `<div class="col-xs-3">`** — the scraper only iterates `$('p')` paragraphs, so it never finds a date card and skips every block. (Bonus bug: the block loop skips the final event, which shares its block with the footer.) The `close_132` split logic itself still matches (16 separators found). | Scan `strong/b` across all block elements, not just `<p>`; include the last block. The page is rich: support acts with set times, VVK/ADK prices, weezevent/ticketmatic links, FB event links, poster images — the existing extraction code will start working. |
| **clubsauvage** (0) | `/calendar` serves **zero server-rendered events** — it's a Wix client-side events widget; the scraper's guessed Wix selectors and "read more" buttons find nothing. Possibly the club also has no events published there at all (page body is just header/footer). | Parse Wix's embedded warmup-data JSON / Wix Events API from the plain HTML instead of guessing DOM selectors; if the widget is genuinely empty, add their Facebook page to `config/facebook.json` (venues mode) and retire the Playwright scraper. |
| **molotov** (0) | **No scraper exists** — there is no `molotov.ts`; `raw/molotov.json` is a stale empty artifact from Jun 7. `venues.json` has `scrape_url: null`, `website: null`. Their events live on Facebook. | Add Molotov's FB page to the Apify facebook config. Venue stays on the map regardless. |

Also found: **kompass** is a registered venue with a `scrape_url` (kompassklub.com/event-list) and is typed in `raw.ts`, but no scraper file was ever written. I'd add one (optional — say no if you want scope tight).

### Field upgrades per working scraper

Raw fill-rate audit (n = events, fraction = non-empty). Every scraper below keeps its existing hard-won logic; changes are additive. New raw/canonical fields: `image_url`, `hour_end`, `support_acts`, plus `organizer` where sources expose it. **Today not a single site scraper extracts images** — only the FB/Apify path has `imageUrl`, and even that is dropped before reaching the sheet.

| Scraper | Today | New fields it can extract |
|---|---|---|
| **kinkystar** (38) | title+date+some artists only (hour/desc/price/tickets all 0/38) | **Site fully rebuilt** (kinkystar.com/nl, verified live): clean cards with date+time, price ("Gratis"), genre tags (Punk/Jazz/Electronic…), event type, poster image, per-event detail URL, support acts in titles, pagination. Rewrite as plain fetch+cheerio — drops Playwright, gains ~6 fields. Biggest single win. |
| **viernulvier** (107) | hour 0/107, desc 0/107, room 0/107 despite a detail-fetch step | hour + room from detail page (listing DD.MM parse misses them), description fix, image (og:image), end time, genre tags it already reads but discards |
| **bijloke** (129) | desc 70/129, artists 0/129 | image, artists/program from detail, hour_end |
| **wintercircus** (39) | hour/desc/price 0/39 via API intercept | mine the intercepted API payload for time, description, image, price fields it already receives but doesn't map |
| **haconcerts** (50) | price 0/50, room 0/50 | price + room + image from detail pages (Creem CMS exposes them) |
| **decentrale** (20) | desc 0/20 | description + image from detail (already fetches detail for time/price) |
| **charlatan** (19) | price 0/19, tickets 9/19 | price, more ticket links, image |
| **chinastraat** (16) | hour 6/16, desc 6/16 | modal data it already maps — extend coverage + image |
| **broei** (91) | strong already | image, hour_end (page shows door/end times) |
| **funke / crossover / clubwintercircus** | strong already | image + small gap-fills |
| **asgaard** (15) | price/tickets 0/15 via anykrowd API | image, price from API payload |
| **goabase** (4) | detail HTML scrape: artists/desc/tickets/price all 0/4 | switch to Goabase's official JSON API → venue_name, organizer, genre, lineup, price reliably |
| **reggaebe** (25) | hour/artists/desc 0/25 | probe its JSON API (already used) for time/lineup/desc fields |
| **beldub** (67) | title/venue/date only | genre/city if cards expose them (link-out site, modest ceiling) |
| **minusOne / vierdeZaal** (iCal) | hour 0–1, source_url 0/17 (vierdeZaal) | DTSTART times + DTEND (`hour_end` is parsed today and thrown away at normalize), event URL from iCal |
| **facebook (Apify)** | rich but `imageUrl` dropped | map `imageUrl`, organizer list through normalize → sheet |

`_peppered.ts` is now orphaned (no scraper imports it) — fold into viernulvier/bijloke or delete.

---

## 3. FRONTEND

### index.html — GHENTEVENT (the priority)

**Visual direction proposal — "festival signal on an underground carrier":**
UNDERGHENT's CRT/terminal discipline becomes the chassis: JetBrains Mono everywhere (kills Courier New), near-black `#0b0d11`-family panels, 1px hairlines, scanlines kept but subtler. GHENTEVENT's identity survives as the *signal*: neon green/pink/gold reserved for data (markers, chips, the Feesten gold), no more glow-on-everything — glow only on interactive/live elements. Cards become image-forward (we'll finally have `image_url` for every source) with a strict mono caption grid. Motion: smooth day-transition (markers fade/slide per day step), header logo "tunes in" on load, gold confetti kept for the Feesten threshold. Mobile-first: thumb-reachable day stepper, swipe left/right anywhere on the map to change day.

**Required mechanic — the day rail:** replace the current cryptic vertical slider with a full-width horizontal **date rail** along the bottom: one day at a time (map already filters per-day — kept), ◀ ▶ steppers + drag + swipe, tick marks per day, today marked, and the **Gentse Feesten 17–26 July range drawn as a gold segment on the track** with a small "GENTSE FEESTEN" label — visible from any date, so users see it coming. Crossing into it triggers the existing festival mode (gold UI, DAY N badge, confetti). The secret 3×-slam gesture to UNDERGHENT is preserved on the new rail.
*Note: current code + STRUCTURE.md use 17–27 Jul as the festival window; you specified 17–26 (matching the fiestenpipeline's day pages). I'll highlight 17–26 unless you say otherwise.*
LIST view follows the same selected day (with a "show all days" escape), so dense days never pile up.

Kept: starring + walking-route builder, group/type chips, search, source dedupe logic.

### underghent.html — RESTRAINED

- **Kill the VENUES drift:** the in-file array is hand-synced and already diverged (it contains `shoonya`, which isn't in venues.json; it's missing `clubwintercircus`). Fix: fetch the published **Venues tab CSV** at runtime (initials live in the new sheet column), with the current array kept as embedded fallback if the fetch fails. One source of truth, editable from anywhere, no build step.
- Polish only: spacing/alignment passes, marker/feed perf (defer offscreen work), clearer empty/loading states, read the new `image_url`/`hide`/override columns. **No redesign** of map, portals, radio, or the core interaction.

### Housekeeping
STRUCTURE.md is stale (7 newer scrapers missing; `frontline/index.html` no longer exists) — I'll update it at the end so it stays the accurate map.

---

## 4. EXECUTION ORDER

1. **Sheets ownership model** — new HEADERS, named-column upsert export, pull-overrides, Venues `initials`/`hide`. (Foundation; everything else writes into it.)
2. **Scrapers** — fix trefpunt/clubsauvage/molotov; field upgrades above; extend raw types + normalize (`image_url`, `hour_end`, `support_acts`).
3. **index.html overhaul** — visual direction + day rail + Feesten range.
4. **underghent.html** — venues-from-sheet + polish.
5. **Verification** — full `npm run pipeline` against a copy/staging tab first, run twice to prove edits survive re-runs (the core fix), per-scraper count + field report, frontend tested against the live published CSVs.

Constraints honored: sandbox only (`underghent_v5`), no backend, env credentials reused, Sheets stays the single source of truth.
