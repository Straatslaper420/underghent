# UnderGhent v5 — Project Structure

Updated 2026-06-12 (v5 rework). Excludes `.git/`, `.claude/`, `.claire/`, `node_modules/`, `__pycache__/`, and `.aider*` caches.

---

## What this is

Two separate static sites served from the repo root via GitHub Pages. No backend server — each page fetches publicly-published Google Sheets CSVs on load. **Google Sheets is the single source of truth**, with a strict per-column ownership model (see below).

### GHENTEVENT — `index.html` (~46 KB)

The **landing page** (fully overhauled in v5 — "festival signal on an underground carrier": JetBrains Mono chassis, neon reserved for data, gold for the Feesten). Shows Gentse Feesten + Facebook events.

- **One day at a time**: a horizontal **day rail** along the bottom of the MAP view scrubs through dates (◀ ▶ steppers, drag, keyboard arrows). Ticks per day, today marked green, and the **Gentse Feesten window (17–26 Jul 2026) drawn as a gold segment** with a label — visible from any date.
- Festival mode while the selected day is inside the window: gold logo (`GHENT//SE FEESTEN`), DAY N badge, one-shot confetti on crossing in.
- **LIST view follows the selected day** (with an ALL DAYS escape + prev/next). Cards are image-forward (posters from the new `image_url` column).
- Map markers are per-day layer groups, built lazily and cached; popups carry poster, venue → Google Maps link, time range, tags, ★.
- Category **group chips** (MUSIC/DANCE/WORD/ACTIVE/BOATS, OR-logic, multi-select) + per-type chips + free-text search.
- **Starring** (localStorage) + **walking-route builder** (Google Maps waypoints through starred events).
- Honors the sheet's human columns: `hide` rows never render; `*_override` columns beat scraped values.
- Hidden **secret gesture** (slam the day rail to the far left 3× within 1.5 s) → UNDERGHENT.

### UNDERGHENT — `underghent.html` (~64 KB)

The **main underground music map** — deliberately untouched in character (v5 = restrained polish only). Leaflet map (3 tile styles), venue circles with live event-count badges, right-side venue feed, SCENE/VENUE PORTALS sidebar, GHENT ONLY / time-range / search filters, URGENT.FM player + weekly show marquee, CRT scanlines.

v5 changes:
- The in-file `VENUES` array is now only an **offline fallback** — the live registry is fetched from the Sheets **Venues** tab at load (gviz CSV by sheet name; `initials` and `hide` are sheet columns). No more hand-synced drift.
- Row visibility: `hide` kills a row; `approved` column (or legacy `status=approved`) gates display; `status=gone/duplicate` rows are dropped; `*_override` columns beat scraped values.
- Popups additionally show SUPPORT (`support_acts`), PRICE, and end time (`hour_end`).

```
Main pipeline:
  Scrapers (venues + aggregators + agendas)
    → normalize → dedupe → enrich → pull-overrides → export (UPSERT)
    → Google Sheets → UNDERGHENT (underghent.html)

Feesten pipeline:
  fiestenpipeline (gentsefeesten.stad.gent)
    → export → Google Sheets `feesten` tab → GHENTEVENT (index.html)
```

---

## Per-column ownership (v5 core)

Any field where both a scraper and a human can have an opinion lives in TWO columns:

- **Auto columns** — written by the pipeline on every run, addressed **by header name** (never position): all the long-standing columns (`event_id` … `status`) plus v5 additions `source`, `hour_end`, `support_acts`, `image_url`, `genre_raw`, `last_seen`.
- **Override columns** — written only by humans, **never touched by any pipeline write**: `venue_override`, `address_override`, `latitude_override`, `longitude_override`, `genre_override`, `hide`, `approved`, `notes`.

The export builds each row write from the auto-column list only, with `null` for every other cell (the Sheets API skips nulls), so clobbering a human edit is structurally impossible. Missing headers are appended on the right; human-added columns are ignored. Everyone (pipeline + both frontends) follows one rule: **`_override` if present, else `_auto`**.

`status` is pipeline-owned (`pending`/`approved`(legacy)/`duplicate`/`gone`); human gating uses `hide`/`approved`.

---

## Root

```
underghent_v5/
├── credentials.json              # Google API credentials (root copy, gitignored)
├── index.html                    # GHENTEVENT — landing page (v5 overhaul)
├── underghent.html               # UNDERGHENT — main map (v5 polish)
├── PLAN.md                       # The approved v5 rework plan
├── STRUCTURE.md                  # This file
├── sync.ps1                      # git add -A + commit + push
├── fiestenpipeline/              # Standalone Gentse Feesten 2026 scraper
├── pipeline/                     # Main data pipeline (TypeScript/Node)
├── sheetsdata.example/           # Manual Sheets CSV export snapshot
└── tooling/                      # Audit + timing utilities (not runtime)
```

(`frontline/` still holds the old Aider sandbox as `underghent_WIP.html` + notes — not used by the v5 workflow; safe to delete whenever.)

---

## How the pipeline runs

```
npm run pipeline
```

expands to:

```
pull-venues → scrape:aggregators → scrape:venues → scrape:agendas
  → normalize → dedupe
  → enrich:artists → enrich:genre → enrich:geo
  → pull-overrides            (was pull-geo — see below)
  → export                    (UPSERT by event_id — no more append duplicates)
  → export:venues
```

### Step-by-step

**0. Pull-venues** — full mirror of the Sheets **Venues** tab into `config/venues.json` (the sheet decides; blank cells overwrite; empty sheet refused as safety guard). v5: carries `initials` + `hide` columns; registry has 24 venues (incl. `shoonya`, which the old frontend had but the registry lacked).

**1. Scrape** — `scrape:aggregators` (beldub, goabase, reggaebe), `scrape:venues` (asgaard, bijloke, broei, charlatan, chinastraat, clubsauvage, clubwintercircus, crossover, decentrale, funke, haconcerts, kinkystar, trefpunt, viernulvier, wintercircus — accepts SOURCE_ID args for subsets), `scrape:agendas` (minusOne, vierdeZaal via iCal). Each writes `data/raw/<source>.json`. `scrape:facebook` (Apify) stays outside the chain. **Molotov and Kompass have no scrapers** (Molotov goes through the FB/Apify path; Kompass is closed until further notice).

v5 scraper notes:
- **trefpunt** — fixed (was 0 events): the 2026 theme moved date cards out of `<p>`; parser now walks leaf blocks. Also extracts price, room, time, tickets, poster image; last event no longer dropped.
- **kinkystar** — rewritten for the new kinkystar.com (Stager platform, server-rendered, paginated; date lives in the URL slug). Plain fetch + cheerio, no Playwright. Extracts time, price, genre tags, poster, detail URL, line-up.
- **clubsauvage** — rewritten: parses Wix embedded JSON payloads instead of guessing client-side DOM. If the venue publishes nothing on Wix, 0 is correct (their events live on Facebook → Apify path).
- **goabase** — rewritten to use the official Goabase JSON API (list + per-party detail): venue, organizer, flyer image, line-up artists, entry fee, coordinates, end time.
- All scrapers now surface what their source exposes into the new fields: `image_url` (≈12 sources), `hour_end`, `genre_raw` (source-published genre tags — the genre enricher matches these FIRST), `support_raw`; reggae.be also yields per-event coordinates + flyer; viernulvier/bijloke/haconcerts/decentrale/clubwintercircus/broei/crossover/charlatan/chinastraat gained detail-page or card extraction for previously-empty fields.

**2. Normalize** — raw → canonical (`makeEventId(source|title|date)`), venue/organizer registry lookups. v5: re-scrapes REFRESH scraper-owned fields (fresh value wins; old value only survives when the new scrape came back empty). New canonical fields: `source`, `hour_end`, `support_acts[]`, `image_url`, `genre_raw`, `overrides`.

**3. Dedupe** — exact SHA-1(title+date) pass + fuzzy same-date Dice>0.85 pass; venue scrapers > aggregators > facebook (all 15 venue scrapers now carry top priority). Losers gap-fill the winner (now incl. image, hour_end, support, genre_raw, facebook_id, overrides).

**4. Enrich** — artists / genre / geo. Genre enrichment now treats scraper-published `genre_raw` as the strongest signal (matched first and alone), then falls back to the full-text keyword pass and venue genres.

**5. Pull-overrides** (`npm run pull-overrides`; replaces pull-geo) — reads every `*_override` + `hide`/`approved` cell from the Events AND GeoFail tabs into `event.overrides`. Overrides always win downstream — fixing a WRONG value sticks (the old pull-geo only filled blanks, and **it also read the wrong env var (`SPREADSHEET_ID`), so it had been silently skipping on every run** — the root cause of vanishing edits, alongside the append-only export).

**6. Export** — `events.json` always; Sheets when creds are set. v5: **named-column UPSERT keyed on `event_id`** for both Events and GeoFail (the old code appended everything every run, duplicating rows and orphaning edits). Future events that vanished from the scrape get `status=gone` (rows are never deleted — overrides survive). Events with effective coords (override OR auto) go to Events; the rest to GeoFail; a row that gains coords via override is promoted and its GeoFail row marked `moved`. `last_seen` updated per run.

**7. Export-venues** — full refresh of the Venues tab (clear + rewrite) from `config/venues.json`; headers now include `initials` and `hide`.

### Standalone commands

- `pull-facebook` — approved FB events from `fb_events_raw` into the pipeline.
- `scrape:facebook` / `scrape:facebook:to-sheet` — Apify FB scraper (now maps `imageUrl` through to `image_url`). fb tabs use the same named-column upsert (keyed on `facebook_id`).

### Config / data layout

As before: `pipeline/config/` (credentials, facebook.json, genres.json, organizers.json, venues.json) and `pipeline/data/` (canonical.json, events.json, raw/ per-source). `raw/molotov.json` and `src/scrapers/venues/_peppered.ts` (orphaned helper) were removed in v5; `src/lib/pull-geo-from-sheet.ts` + its command were replaced by `pull-overrides-from-sheet.ts`.

---

## `fiestenpipeline/` — Gentse Feesten 2026

Unchanged in v5. Crawls gentsefeesten.stad.gent days 17–26 July, dedupes by node ID, full-refreshes the `feesten` tab. Shared field names with `fb_events` so GHENTEVENT parses both identically (incl. `gf_image_url`).

---

## Notes

- **One git repo**, one `main`, GitHub Pages serves `index.html` (GHENTEVENT) + `underghent.html` (UNDERGHENT, reachable via the secret gesture).
- **Sheets tabs**: `Events` (+ override columns), `GeoFail` (same schema; quarantine until coords exist), `Venues` (two-way mirror, incl. `initials`/`hide`), `fb_events_raw` (staging/approval gate), `fb_events` (published, read by both frontends), `feesten` (Gentse Feesten, full refresh).
- **Frontend venue registry**: UNDERGHENT fetches the Venues tab at load (embedded array = offline fallback only). Editing a venue in the sheet reaches the map on next page load — no code edit, no pipeline run.
- **Secrets**: `.gitignore` keeps `credentials.json` / `.env` out of git; env vars are `GOOGLE_SHEETS_CREDENTIALS`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_WORKSHEET_NAME`, `APIFY_TOKEN`, `NOMINATIM_USER_AGENT`.
- **Gentse Feesten window**: 17–26 July 2026 everywhere (rail highlight, festival mode, fiestenpipeline day pages).
