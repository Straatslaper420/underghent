# UnderGhent v2 — Project Structure

Generated 2026-06-06. Excludes `.git/`, `.claude/`, `.claire/`, `node_modules/`, `__pycache__/`, and `.aider*` caches.

---

## What this is

UnderGhent is a **Leaflet.js map** that shows upcoming underground music events in (and around) Ghent. There is no backend server — the frontend is a single static HTML file that fetches a publicly-published Google Sheets CSV on load and renders it directly into the map.

The pipeline is a separate offline process: it scrapes a dozen venues and aggregator sites, normalises and deduplicates the raw events, enriches them with genres/artists/coordinates, then exports the result to Google Sheets and a local `events.json`. The Sheets publication is what the frontend reads.

```
Scrapers → normalize → dedupe → enrich → export → Google Sheets → Frontend
```

---

## Root

```
underghent_v2/
├── credentials.json              # Google API credentials (Sheets) — root copy
├── project_snapshot.md           # Repo snapshot doc (72 KB)
├── underghent_agent.py           # Overnight LLM agent (see below)
├── data/                         # Source data exports (CSV from Sheets)
├── frontline/                    # Frontend SPA (its own git repo)
├── pipeline/                     # Data pipeline (TypeScript/Node)
└── tooling/                      # Audit + timing utilities (not runtime)
```

---

## How the pipeline runs

The full pipeline is a single npm script that chains all steps in order:

```
npm run pipeline
```

which expands to:

```
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
     export             (write events.json + push to Google Sheets)
```

### Step-by-step

**1. Scrape** — three parallel scrape commands, each run in sequence:
- `scrape:aggregators` — hits multi-venue aggregator sites (beldub, goabase, reggaebe). Each scraper writes its raw output to `pipeline/data/raw/<source>.json`.
- `scrape:venues` — hits individual venue pages (asgaard, broei, chinastraat, crossover, funke, kinkystar, molotov). Uses Playwright for JS-heavy pages; `_peppered.ts` is a shared base for venues on the Peppered ticketing platform.
- `scrape:agendas` — fetches iCal feeds (minusOne, vierdeZaal) via a shared `_ical.ts` helper.
- `scrape:facebook` — **not part of the main pipeline run**; run separately via `npm run scrape:facebook`. Uses Apify to pull Facebook event data. Config in `pipeline/config/facebook.json`.

**2. Normalize** — reads all `raw/*.json` files, applies field mapping, date parsing, and venue lookups against `config/venues.json` and `config/organizers.json`. Writes a single `pipeline/data/canonical.json` with all events in the canonical schema.

**3. Dedupe** — two-pass deduplication on `canonical.json`:
- *Exact pass*: SHA-1 hash of `normalised(title) + date_start`. Same hash → merge, keeping the higher-priority source (venue scrapers > aggregators > facebook).
- *Fuzzy pass*: same date + Dice coefficient > 0.85 on title → merge.
  When merging, the loser's fields fill gaps in the winner (ticket URL, description, artists, Facebook going/interested counts). Losers are marked `status: "duplicate"` and kept in the file for traceability.

**4. Enrich** — three enrichers run over non-duplicate events in `canonical.json`:
- `artists` — extracts headliner names from event descriptions using pattern matching.
- `genre` — classifies each event against a curated genre taxonomy in `config/genres.json`.
- `geo` — resolves lat/lng for each venue from `config/venues.json`; falls back to geocoding if not found.

**5. Pull-geo** — pulls hand-corrected coordinates from the Google Sheets `Events` tab back into `canonical.json`. This lets you fix bad geocoding in the sheet without re-running the pipeline.

**6. Export** — writes two outputs:
- `pipeline/data/events.json` — always written; this is the local copy.
- Google Sheets (optional) — pushes future non-duplicate events to the configured spreadsheet. Requires `GOOGLE_SHEETS_CREDENTIALS` and `GOOGLE_SPREADSHEET_ID` env vars.

### Config files used by the pipeline

```
pipeline/config/
├── credentials.json   # Google service-account key for Sheets API
├── facebook.json      # Apify actor config for Facebook scraper
├── facebook.README.md # Notes on Facebook scraper setup
├── genres.json        # Genre taxonomy: keywords → genre label
├── organizers.json    # Known organizer name mappings
└── venues.json        # Venue registry: name → id, address, lat/lng, URL
```

### Intermediate data files

```
pipeline/data/
├── canonical.json     # All events after normalize — mutated in-place by each step
├── events.json        # Final export (subset of canonical: future + non-duplicate)
├── review-queue.json  # Items flagged for manual review during normalization
└── raw/               # Per-scraper raw output (one file per source)
    ├── asgaard.json
    ├── beldub.json
    ├── broei.json
    ├── chinastraat.json
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
├── .env                          # Secrets (OPENROUTER_API_KEY, GOOGLE_*, etc.)
├── .env.example
├── .gitignore
├── package.json                  # npm scripts (see above)
├── package-lock.json
├── tsconfig.json
│
├── config/                       # Static config (see above)
├── data/                         # Runtime data (see above)
│
└── src/
    ├── commands/                 # CLI entry points — one file per npm run step
    │   ├── dedupe.ts
    │   ├── enrich-artists.ts
    │   ├── enrich-genre.ts
    │   ├── enrich-geo.ts
    │   ├── export.ts
    │   ├── normalize.ts
    │   ├── pull-geo-from-sheet.ts
    │   ├── scrape-agendas.ts
    │   ├── scrape-aggregators.ts
    │   ├── scrape-facebook.ts
    │   └── scrape-venues.ts
    │
    ├── export/
    │   ├── json.ts               # Writes events.json
    │   └── sheets.ts             # Google Sheets push
    │
    ├── lib/                      # Shared utilities
    │   ├── date.ts               # Date parsing helpers
    │   ├── http.ts               # Fetch wrapper with retry
    │   ├── logger.ts             # Structured console logger
    │   ├── pull-geo-from-sheet.ts
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
    │   ├── base.ts               # Shared scraper interface
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
    │       ├── chinastraat.ts
    │       ├── crossover.ts
    │       ├── funke.ts
    │       ├── kinkystar.ts
    │       └── molotov.ts
    │
    └── types/                    # Shared TypeScript types
        ├── canonical.ts          # CanonicalEvent — the central schema
        ├── enricher.ts           # Enricher interface + PipelineContext
        ├── raw.ts                # RawEvent (scraper output)
        ├── registry.ts           # Typed config registries
        └── storage.ts            # StorageAdapter interface
```

---

## `frontline/` — the site

Independent git repo (its own `.git/`). No build step — open `index.html` directly in a browser or serve it statically.

```
frontline/
├── .gitignore
├── index.html                    # Entire frontend (43 KB, single file)
└── qwenwithindexaccess.txt       # Dev notes
```

### What the frontend does

- Fetches a publicly-published Google Sheets CSV (hardcoded URL in the JS) on page load.
- Parses the CSV rows into event objects client-side.
- Renders events as clustered markers on a **Leaflet** map (3 map style options: dark/sunset/light via Stadia tiles).
- Sidebar lists all events; clicking a marker or list item opens an event detail panel.
- Filters: **GHENT ONLY** toggle (filters by city), **week/month/all** time range toggle, free-text search.
- Status bar at the bottom shows event count + a live radio player (**URGENT.FM** — Ghent community radio) with volume and mute.
- CRT scanline overlay for aesthetics. JetBrains Mono throughout.
- Fully mobile-responsive.

The frontend has **no dependency on the local pipeline**. It reads whatever is currently published in the Google Sheet. To update what users see, run the pipeline and push to Sheets.

---

## `data/`

```
data/
└── UnderGhent_Events - Events (11).csv     # Manual Sheets export snapshot (~17 KB)
```

This is a one-off CSV export from the Google Sheet — used as input to `underghent_agent.py`. It is not written by the pipeline.

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

- **Two separate git repos:** the outer `underghent_v2/` and the nested `frontline/`.
- **`frontline/index.html`** (~43 KB) is the canonical frontend SPA. The root-level `index.html` has been removed.
- **`pipeline/`** is the heart of the project — TypeScript, organized as: `commands/` (CLI) → `pipeline/` (stage logic) → `scrapers/` (per-source) → `lib/` (utilities) → `export/` (sinks).
- **Scraper sources** fall into three categories: `agendas/` (iCal feeds), `aggregators/` (multi-venue sites, including Facebook via Apify), `venues/` (individual venue pages using Playwright or Cheerio).
- **Score enricher removed:** `enrich-score.ts` command and `enrichers/score.ts` are gone; `config/scoring.json` has been replaced by `config/facebook.json` for the Facebook aggregator.
- **Facebook scraper** is intentionally excluded from the main `npm run pipeline` chain — run `npm run scrape:facebook` separately since it depends on Apify and has different rate-limit characteristics.
