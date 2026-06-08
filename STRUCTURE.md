# UnderGhent v2 — Project Structure

Generated 2026-06-08. Excludes `.git/`, `.claude/`, `.claire/`, `node_modules/`, `__pycache__/`, and `.aider*` caches.

---

## What this is

UnderGhent is a **Leaflet.js map** that shows upcoming underground music events in (and around) Ghent. There is no backend server — the frontend is a single static HTML file that fetches publicly-published Google Sheets CSVs on load and renders them directly into the map.

The pipeline is a separate offline process: it scrapes a dozen venues and aggregator sites, normalises and deduplicates the raw events, enriches them with genres/artists/coordinates, then exports the result to Google Sheets and a local `events.json`. The Sheets publication is what the frontend reads.

```
Scrapers → normalize → dedupe → enrich → export → Google Sheets → Frontend
```

---

## Root

```
underghent_v2/
├── credentials.json              # Google API credentials (Sheets) — root copy, gitignored
├── index.html                    # LIVE site, served by GitHub Pages from main root (~62 KB)
├── project_snapshot.md           # Repo snapshot doc
├── sync.ps1                      # One-shot: git add -A + commit + push the whole repo
├── frontline/                    # Frontend working copy (kept in sync with root index.html)
├── pipeline/                     # Data pipeline (TypeScript/Node)
├── sheetsdata.example/           # Manual Sheets CSV export snapshot (sample data)
└── tooling/                      # Audit + timing utilities (not runtime)
```

`sync.ps1` stages, commits and pushes the whole folder; `.gitignore` keeps
`credentials.json`, `.env`, `node_modules/`, caches, etc. out of git. Run it
from the repo root with an optional commit message (defaults to a timestamp).

---

## How the pipeline runs

The full pipeline is a single npm script that chains all steps in order:

```
npm run pipeline
```

which expands to:

```
pull-venues             (pull manual venue edits from Sheets → config/venues.json)
        ↓
scrape:aggregators  →  scrape:venues  →  scrape:agendas
        ↓
    normalize           (merge raw JSON per source into canonical.json)
        ↓
     dedupe             (exact hash + fuzzy title match, priority-merge)
        ↓
  enrich:artists        (extract artist lists from descriptions)
  enrich:genre          (classify genre from title/artists via genres.json)
  enrich:geo            (geocode venues via venues.json registry)
        ↓
    pull-geo            (pull any hand-corrected coords back from Google Sheets)
        ↓
     export             (write events.json + push events to Google Sheets)
        ↓
   export:venues        (push the venue registry to the Sheets "Venues" tab)
```

### Step-by-step

**0. Pull-venues** (`pull-venues`) — runs *first*. Pulls manual edits in the
Sheets **Venues** tab back into `config/venues.json`. Merges by `id`: matching
venues are updated in place (file order preserved), new-id rows are appended,
and local venues missing from the sheet are kept (never deleted), so a stray
blank row can't wipe data. Blank/unparseable cells fall back to the existing
local value, and the file is only rewritten when something actually changed.

**1. Scrape** — three scrape commands run in sequence:
- `scrape:aggregators` — hits multi-venue aggregator sites (beldub, goabase, reggaebe). Each scraper writes its raw output to `pipeline/data/raw/<source>.json`.
- `scrape:venues` — hits individual venue pages (asgaard, broei, charlatan, chinastraat, clubsauvage, crossover, funke, kinkystar). Uses Playwright for JS-heavy pages; `_peppered.ts` is a shared base for venues on the Peppered ticketing platform. **Accepts optional SOURCE_ID args** to run a subset, e.g. `npm run scrape:venues -- asgaard charlatan`; with no args every venue runs. Unknown names are warned about and a no-match exits non-zero.
- `scrape:agendas` — fetches iCal feeds (minusOne, vierdeZaal) via a shared `_ical.ts` helper.
- `scrape:facebook` — **not part of the main pipeline run**; run separately via `npm run scrape:facebook` (or `scrape:facebook:to-sheet` to stage straight into a sheet tab). Uses Apify to pull Facebook event data. Config in `pipeline/config/facebook.json`.

**2. Normalize** — reads all `raw/*.json` files, applies field mapping, date parsing, and venue lookups against `config/venues.json` and `config/organizers.json`. Writes a single `pipeline/data/canonical.json` with all events in the canonical schema.

**3. Dedupe** — two-pass deduplication on `canonical.json`:
- *Exact pass*: SHA-1 hash of `normalised(title) + date_start`. Same hash → merge, keeping the higher-priority source (venue scrapers > aggregators > facebook).
- *Fuzzy pass*: same date + Dice coefficient > 0.85 on title → merge.
  When merging, the loser's fields fill gaps in the winner (ticket URL, description, artists, Facebook going/interested counts). Losers are marked `status: "duplicate"` and kept in the file for traceability.

**4. Enrich** — three enrichers run over non-duplicate events in `canonical.json`:
- `artists` — extracts headliner names from event descriptions using pattern matching.
- `genre` — classifies each event against the curated genre taxonomy in `config/genres.json`.
- `geo` — resolves lat/lng for each venue from `config/venues.json`; falls back to geocoding if not found.

**5. Pull-geo** — pulls hand-corrected coordinates from the Google Sheets `Events` tab back into `canonical.json`. This lets you fix bad geocoding in the sheet without re-running the pipeline.

**6. Export** — writes two outputs:
- `pipeline/data/events.json` — always written; this is the local copy.
- Google Sheets (optional) — pushes future non-duplicate events. Events *with* coords go to the `Events` tab; events *missing* coords go to a `GeoFail` tab. Requires `GOOGLE_SHEETS_CREDENTIALS` and `GOOGLE_SPREADSHEET_ID` env vars; skips cleanly if they're unset.

**7. Export-venues** (`export:venues`) — full refresh of the Sheets **Venues**
tab: clears it, then writes headers + the current `config/venues.json` snapshot
(one row per venue, every field a column) so re-runs stay in sync without
duplicate rows. Worksheet name overridable via `GOOGLE_VENUES_WORKSHEET_NAME`
(default `Venues`).

### Standalone commands (not in the main chain)

- `pull-facebook` — pulls *approved* Facebook events from the Sheets
  `fb_events_raw` tab into the pipeline, resolving venues against the registry.
- `scrape:facebook` / `scrape:facebook:to-sheet` — Apify Facebook scraper.

### Config files used by the pipeline

```
pipeline/config/
├── credentials.json   # Google service-account key for Sheets API (gitignored)
├── facebook.json      # Apify actor config for Facebook scraper
├── facebook.README.md # Notes on Facebook scraper setup
├── genres.json        # Genre taxonomy: keywords → genre label (generated, see scripts/)
├── organizers.json    # Known organizer name mappings
└── venues.json        # Venue registry: id, name, aliases, address, lat/lng,
                       #   underground_weight, genres, area, website, scrape_url, scrape_type
```

### Intermediate data files

```
pipeline/data/
├── canonical.json          # All events after normalize — mutated in-place by each step
├── events.json             # Final export (subset of canonical: future + non-duplicate)
├── review-queue.json       # Items flagged for manual review during normalization
├── musicmap-raw.json       # Source taxonomy input for the genre generator
├── genres.generated.json   # STAGING output of gen-genres (does NOT overwrite config)
├── genres-report.md        # Human-readable genre generation report
└── raw/                    # Per-scraper raw output (one file per source)
    ├── asgaard.json
    ├── beldub.json
    ├── broei.json
    ├── charlatan.json
    ├── chinastraat.json
    ├── clubsauvage.json
    ├── funke.json
    ├── goabase.json
    ├── kinkystar.json
    ├── minusOne.json
    ├── molotov.json
    ├── reggaebe.json
    ├── thecrossover.json
    └── vierdeZaal.json
```

---

## `pipeline/` — full tree

TypeScript, ESM, run with `tsx` (no compile step needed).

```
pipeline/
├── .env                          # Secrets (GOOGLE_*, APIFY, etc.)
├── .env.example
├── .gitignore
├── package.json                  # npm scripts (see above)
├── package-lock.json
├── tsconfig.json
│
├── config/                       # Static config (see above)
├── data/                         # Runtime data (see above)
│
├── scripts/                      # Standalone generators (not in the pipeline chain)
│   ├── gen-genres.mjs            # Builds genres taxonomy from musicmap → data/genres.generated.json
│   └── verify-genre.mts          # Sanity-checks the genre matcher
│
└── src/
    ├── commands/                 # CLI entry points — one file per npm run step
    │   ├── dedupe.ts
    │   ├── enrich-artists.ts
    │   ├── enrich-genre.ts
    │   ├── enrich-geo.ts
    │   ├── export.ts
    │   ├── export-venues.ts          # Push venue registry → Sheets "Venues" tab
    │   ├── normalize.ts
    │   ├── pull-facebook-from-sheet.ts   # Approved FB events from fb_events_raw tab
    │   ├── pull-geo-from-sheet.ts
    │   ├── pull-venues-from-sheet.ts     # Manual venue edits → config/venues.json
    │   ├── scrape-agendas.ts
    │   ├── scrape-aggregators.ts
    │   ├── scrape-facebook.ts
    │   └── scrape-venues.ts              # Accepts SOURCE_ID args for a subset
    │
    ├── export/
    │   ├── json.ts               # Writes events.json
    │   └── sheets.ts             # Google Sheets push: events (Events/GeoFail),
    │                             #   venues (full refresh), FB upsert/append helpers
    │
    ├── lib/                      # Shared utilities
    │   ├── date.ts               # Date parsing helpers
    │   ├── http.ts               # Fetch wrapper with retry
    │   ├── logger.ts             # Structured console logger
    │   ├── pull-facebook-from-sheet.ts
    │   ├── pull-geo-from-sheet.ts
    │   ├── pull-venues-from-sheet.ts
    │   ├── registry.ts           # Loads config/ JSON files into typed registries
    │   ├── text.ts               # Text normalisation + Dice coefficient
    │   └── storage/
    │       ├── json.ts           # File-based StorageAdapter (reads/writes data/*.json)
    │       └── supabase.ts       # Supabase StorageAdapter (alternate backend)
    │
    ├── pipeline/                 # Stage logic (called by commands/)
    │   ├── dedupe.ts             # Two-pass dedup + merge logic
    │   ├── normalize.ts          # Raw → canonical transformation
    │   └── enrichers/
    │       ├── artists.ts        # Artist name extraction
    │       ├── genre.ts          # Genre classification
    │       └── geo.ts            # Venue geocoding
    │
    ├── scrapers/
    │   ├── base.ts               # Shared scraper interface + safeRun wrapper
    │   ├── how to scrape specific venues.txt   # Notes on per-venue / pull-venues usage
    │   ├── agendas/              # iCal-feed scrapers
    │   │   ├── _ical.ts          # Shared iCal fetch + parse helper
    │   │   ├── minusOne.ts
    │   │   └── vierdeZaal.ts
    │   ├── aggregators/          # Multi-venue aggregator scrapers
    │   │   ├── beldub.ts
    │   │   ├── facebook.ts       # Apify-based Facebook scraper
    │   │   ├── goabase.ts
    │   │   └── reggaebe.ts
    │   └── venues/               # Individual venue page scrapers
    │       ├── _peppered.ts      # Shared base for Peppered-platform venues
    │       ├── asgaard.ts
    │       ├── broei.ts
    │       ├── charlatan.ts
    │       ├── chinastraat.ts
    │       ├── clubsauvage.ts
    │       ├── crossover.ts
    │       ├── funke.ts
    │       └── kinkystar.ts
    │
    └── types/                    # Shared TypeScript types
        ├── canonical.ts          # CanonicalEvent — the central schema
        ├── enricher.ts           # Enricher interface + PipelineContext + ScraperResult
        ├── raw.ts                # RawEvent / RawEventBase (scraper output)
        ├── registry.ts           # Typed config registries (VenueRecord, GenreRecord, …)
        └── storage.ts            # StorageAdapter interface
```

---

## `frontline/` — the site (working copy)

No build step — open `index.html` directly in a browser or serve it statically.
This is the **working copy** for frontend edits; the **live** file is the root
`index.html`. The two are identical (~62 KB single-file SPA) and kept in sync
manually for now.

```
frontline/
├── .gitignore
├── index.html                    # Entire frontend (single file)
└── qwenwithindexaccess.txt       # Dev notes
```

### What the frontend does

- Fetches two publicly-published Google Sheets CSVs on load: the main `Events`
  publication and a separate `fb_events` tab (joined by gid). Hardcoded URLs in
  the JS (`SHEET_CSV`, `FB_CSV`).
- Parses the CSV rows into event objects client-side.
- Renders events on a **Leaflet** map (3 map styles: dark/sunset/light via Stadia tiles).
- **Venue layer:** an in-file `VENUES` array (a hand-maintained mirror of
  `config/venues.json` plus short map initials) drives three things — labelled
  **venue circles** on the map (with live event-count badges), a right-side
  **venue feed** panel listing that venue's events, and the **VENUE PORTALS**
  sidebar list. Events are matched to venues by name/alias first, then by
  nearest coordinates (~90 m).
- **Scene/venue portals (sidebar):** a **SCENE PORTALS** block of external
  scene links (Goabase, Reggae.be, FOMO Station, VNDG) and a **VENUE PORTALS**
  block listing every venue (hover to fly the map there, click to open its feed).
- Filters: **GHENT ONLY** toggle, **week/month/all** time range, free-text search.
- Status bar at the bottom shows event count + a live radio player
  (**URGENT.FM** — Ghent community radio) with volume and mute.
- CRT scanline overlay for aesthetics. JetBrains Mono throughout. Mobile-responsive.

The frontend has **no dependency on the local pipeline**. It reads whatever is
currently published in the Google Sheet. To update what users see, run the
pipeline and push to Sheets.

---

## `sheetsdata.example/`

```
sheetsdata.example/
└── UnderGhent_Events - Events (11).csv     # Manual Sheets export snapshot (~17 KB)
```

A one-off CSV export from the Google Sheet — a sample of the published data. It
is not written by the pipeline.

---

## `tooling/`

Developer utilities. Not part of the runtime pipeline — nothing here is called during a normal pipeline run.

```
tooling/
├── README.md
├── audit-prompt.md               # Prompt to paste into an LLM for codebase review
├── build-audit-bundle.ps1        # Concatenates all source into audit-bundle.txt
├── frontend-timing.html          # Browser harness: loads frontline in iframe, dumps Performance API JSON
└── pipeline-timing.mjs           # Runs every npm step, captures wall time + RSS + record counts
```

**Workflow:**
1. `pwsh tooling/build-audit-bundle.ps1` → produces `audit-bundle.txt`
2. Paste `audit-prompt.md` + bundle into an LLM (e.g. qwen3-coder on OpenRouter)
3. `node tooling/pipeline-timing.mjs` → `tooling/timing-baseline.json` (per-step perf)
4. Open `tooling/frontend-timing.html` in browser → `tooling/frontend-baseline.json` (page load metrics)

---

## Notes

- **One git repo:** everything lives under a single `underghent_v2/.git`. There
  is no nested `frontline/.git` any more — one history, one remote, one `main`
  branch. Aider is still scoped to *editing* only the `frontline/` folder.
- **Live site = root `index.html`, served by GitHub Pages from `main` root.**
  Root `index.html` is the canonical *served* file. `frontline/index.html` holds
  an identical copy and is the working file for frontend edits; the two are kept
  in sync manually.
- **Venues are now first-class.** `config/venues.json` is the registry
  (round-trips to/from the Sheets `Venues` tab via `export:venues` /
  `pull-venues`), and the frontend mirrors it as the in-file `VENUES` array that
  powers map circles, the venue feed, and the venue-portals sidebar. The
  `VenueRecord` type carries `underground_weight`, `genres`, `scrape_type`, etc.
- **Genre taxonomy is generated, not hand-written.** `scripts/gen-genres.mjs`
  builds it from `data/musicmap-raw.json` into the *staging* file
  `data/genres.generated.json` (+ `genres-report.md`); it does not overwrite
  `config/genres.json`. Genre enrichment is keyword-only — no AI.
- **Secrets excluded from the repo:** the root `.gitignore` keeps
  `credentials.json` and `.env` out of git. The old `underghent_agent.py`
  (which held a hardcoded key) has been removed.
- **`pipeline/`** is the heart of the project — TypeScript, organized as:
  `commands/` (CLI) → `pipeline/` (stage logic) → `scrapers/` (per-source) →
  `lib/` (utilities) → `export/` (sinks), with `scripts/` for standalone generators.
- **Scraper sources** fall into three categories: `agendas/` (iCal feeds),
  `aggregators/` (multi-venue sites, including Facebook via Apify), `venues/`
  (individual venue pages using Playwright or Cheerio). `molotov` is still a
  known venue (data in `raw/molotov.json`, listed in the frontend) but no longer
  has an active scraper.
- **Facebook scraper** is intentionally excluded from the main `npm run pipeline`
  chain — run `npm run scrape:facebook` separately since it depends on Apify and
  has different rate-limit characteristics. Approved FB events flow in via the
  `fb_events_raw` Sheets tab (`pull-facebook`) and the frontend reads the
  published `fb_events` tab directly.
