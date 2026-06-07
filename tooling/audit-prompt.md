# Audit prompt — Underghent v2 backend efficiency review

You are reviewing the complete source of a small TypeScript event-aggregation pipeline plus a static HTML frontend. The full source follows after the `=== BUNDLE START ===` marker. Real source is ~300KB total — small enough that you can hold all of it.

## Architecture (what you're looking at)

- **`pipeline/`** — Node/TypeScript. Scrapes events from Ghent venues/aggregators, normalizes, dedupes, enriches (artists/genre/geo/score), exports to JSON + Google Sheets.
- **`frontline/index.html`** — single-file static frontend that consumes the exported JSON.
- **Pipeline runs as 11 sequential `npm run` steps** chained by `&&` in `pipeline/package.json`.
- **Scrapers** live in `pipeline/src/scrapers/{venues,aggregators,agendas}/`. Each is a separate file.
- **Enrichers** live in `pipeline/src/pipeline/enrichers/`. Each likely calls an external API per event.
- **Storage** is JSON files via `pipeline/src/lib/storage/`. Whole `canonical.json` is re-read/re-written each step.

## What to find (be specific, cite file + line)

Produce a **hit list** organized by category. For each finding give: `file:line`, one-sentence problem, one-sentence fix, and an effort/impact label (`low/med/high` for each).

### 1. Serial work that could be parallel
- Pipeline steps that have no dependency on each other
- `for ... await` loops over independent items inside any single step (scrapers, enrichers)
- Sequential `fetch` calls that could be `Promise.all`'d

### 2. Uncached repeat work
- API calls (geo, genre, artist lookups) that re-query the same input across runs
- File reads/writes done multiple times when once would do
- Anything recomputed every run that could be persisted by content-hash

### 3. Redundant passes / O(n²) hotspots
- Multiple iterations over the events array where one would suffice
- Nested loops over events (e.g. fuzzy dedupe in `dedupe.ts` — confirm it's bounded sensibly)
- `Array.find` / `.includes` inside a loop that should be a `Map`/`Set` lookup

### 4. I/O patterns
- Sync `fs` calls (`readFileSync`, `writeFileSync`) on hot paths
- Full-file rewrites where append/diff would work
- JSON parse/stringify of the entire dataset per step

### 5. Scraper-specific
- Playwright launches per-scrape instead of shared browser context
- Missing rate limiting or politeness delays where required
- Identical retry/error-handling logic that should be extracted

### 6. Frontend (`frontline/index.html`)
- Whole event dataset shipped to client when filtering/paging on server would do
- Render work in main thread that could be deferred
- Repeated DOM queries inside loops

### 7. Anything else
- Dead code, unused exports, duplicated utilities
- Type safety holes that could let bad data through and cost a re-run
- Config that should be data-driven instead of code

## Output format

Markdown, grouped by the 7 categories above. Inside each category, one bullet per finding:

```
- **`file/path.ts:42`** — [problem in one sentence]
  - Fix: [one sentence]
  - Effort: low | Impact: high
```

End with a **"Top 5 wins"** section: ranked list of changes that maximize (impact ÷ effort). Be opinionated.

Do NOT rewrite code. Do NOT explain what the code does. Just find the inefficiencies and rank them.

=== BUNDLE START ===
