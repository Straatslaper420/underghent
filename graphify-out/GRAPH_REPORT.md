# Graph Report - underghent_v6  (2026-07-01)

## Corpus Check
- 109 files · ~933,471 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 726 nodes · 1427 edges · 77 communities (45 shown, 32 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b2d180f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Venue Scraping & HTTPDate Utils|Venue Scraping & HTTP/Date Utils]]
- [[_COMMUNITY_Storage & Export Orchestration|Storage & Export Orchestration]]
- [[_COMMUNITY_Event Detail Fetching|Event Detail Fetching]]
- [[_COMMUNITY_Aggregator Scraping & Normalization|Aggregator Scraping & Normalization]]
- [[_COMMUNITY_Genre Keyword Generation|Genre Keyword Generation]]
- [[_COMMUNITY_Pipeline Dependencies|Pipeline Dependencies]]
- [[_COMMUNITY_Frontend, Sheets & Dev Workflow|Frontend, Sheets & Dev Workflow]]
- [[_COMMUNITY_Google Sheets Export|Google Sheets Export]]
- [[_COMMUNITY_Frontend Day Rail & Upsert Rework|Frontend Day Rail & Upsert Rework]]
- [[_COMMUNITY_Facebook Scraper Config|Facebook Scraper Config]]
- [[_COMMUNITY_Funke  Paylogic Scraper|Funke / Paylogic Scraper]]
- [[_COMMUNITY_Fiesten Dependencies|Fiesten Dependencies]]
- [[_COMMUNITY_Artist Enrichment|Artist Enrichment]]
- [[_COMMUNITY_Geo Enrichment|Geo Enrichment]]
- [[_COMMUNITY_Asgaard Scraper|Asgaard Scraper]]
- [[_COMMUNITY_TypeScript Config (Pipeline)|TypeScript Config (Pipeline)]]
- [[_COMMUNITY_Pipeline Timing Harness|Pipeline Timing Harness]]
- [[_COMMUNITY_TypeScript Config (alt)|TypeScript Config (alt)]]
- [[_COMMUNITY_Event Deduplication|Event Deduplication]]
- [[_COMMUNITY_Venue Export & Logging|Venue Export & Logging]]
- [[_COMMUNITY_Facebook Pull from Sheet|Facebook Pull from Sheet]]
- [[_COMMUNITY_Wintercircus Scraper|Wintercircus Scraper]]
- [[_COMMUNITY_Genre Enrichment|Genre Enrichment]]
- [[_COMMUNITY_Facebook Pull (Fiesten)|Facebook Pull (Fiesten)]]
- [[_COMMUNITY_Venue Sync from Sheet|Venue Sync from Sheet]]
- [[_COMMUNITY_Data Registries|Data Registries]]
- [[_COMMUNITY_Event Deduplication (Fiesten)|Event Deduplication (Fiesten)]]
- [[_COMMUNITY_Normalization Registry Loader|Normalization Registry Loader]]
- [[_COMMUNITY_Music-Only Genre Gate|Music-Only Genre Gate]]
- [[_COMMUNITY_Genre Text Matching|Genre Text Matching]]
- [[_COMMUNITY_Sync Test Marker|Sync Test Marker]]
- [[_COMMUNITY_Trefpunt Scraper Fix|Trefpunt Scraper Fix]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]

## God Nodes (most connected - your core abstractions)
1. `safeRun()` - 45 edges
2. `fetchHtml()` - 43 edges
3. `makeScraperResult()` - 41 edges
4. `parseCheerio()` - 38 edges
5. `CanonicalEvent` - 28 edges
6. `log()` - 26 edges
7. `ScraperResult` - 25 edges
8. `Super-genres → subgenres (FINAL keywords)` - 24 edges
9. `parseTime()` - 23 edges
10. `JsonStorageAdapter` - 22 edges

## Surprising Connections (you probably didn't know these)
- `Fiestenpipeline Run Command (npm run run)` --semantically_similar_to--> `scrape:venues SOURCE_ID Runner`  [INFERRED] [semantically similar]
  fiestenpipeline/how to run.txt → pipeline/src/scrapers/how to scrape specific venues.txt
- `Festival Mode + Confetti` --semantically_similar_to--> `CRT Scanline / Glitch Aesthetic`  [INFERRED] [semantically similar]
  index.html → frontline/underghent_WIP.html
- `Cross-Tab Dedupe (date + fuzzy title)` --semantically_similar_to--> `pull-venues (Venues tab -> venues.json)`  [INFERRED] [semantically similar]
  index.html → pipeline/src/scrapers/how to scrape specific venues.txt
- `pull-venues (Venues tab -> venues.json)` --conceptually_related_to--> `Venues Tab Two-Way Mirror`  [INFERRED]
  pipeline/src/scrapers/how to scrape specific venues.txt → PLAN.md
- `Venues-From-Sheet Loader` --shares_data_with--> `Venues Tab Two-Way Mirror`  [INFERRED]
  underghent.html → PLAN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sheets Ownership: Upsert + Pull-Overrides + Schema** — plan_sheets_ownership_model, plan_named_column_upsert, plan_pull_overrides, plan_events_tab_schema, plan_override_columns [EXTRACTED 0.85]
- **Day Rail / Feesten Festival-Mode Flow** — index_dayrail, index_feesten_segment, index_festival_mode_confetti, index_per_day_marker_layers [EXTRACTED 0.85]
- **Facebook Discovery + Geo/Genre Filtering** — pipeline_config_facebook_readme_apify_actor, pipeline_config_facebook_readme_discovery_mode, pipeline_config_facebook_readme_ghent_bounds, pipeline_config_facebook_readme_music_only_gate [EXTRACTED 0.80]

## Communities (77 total, 32 thin omitted)

### Community 0 - "Venue Scraping & HTTP/Date Utils"
Cohesion: 0.16
Nodes (23): NL_MONTHS, parseNlDate(), parseTime(), scrapeList(), makeScraperResult(), parseCheerio(), CATEGORY_SLUGS, extractEvents() (+15 more)

### Community 1 - "Storage & Export Orchestration"
Cohesion: 0.18
Nodes (3): SupabaseStorageAdapter, CanonicalEvent, StorageAdapter

### Community 2 - "Event Detail Fetching"
Cohesion: 0.10
Nodes (32): absUrl(), clean(), fetchDetail(), fieldByLabel(), parseDetail(), concurrentMap(), fetchHtml(), politeDelay() (+24 more)

### Community 3 - "Aggregator Scraping & Normalization"
Cohesion: 0.16
Nodes (14): configDir, dataDir, __dirname, registries, storage, log(), normalizeAgenda(), normalizeAll() (+6 more)

### Community 4 - "Genre Keyword Generation"
Cohesion: 0.06
Nodes (30): ACR, afterCount, allCodes, buildText(), CURATED_ALIASES, CURATED_KEYWORDS, DENY, deriveKeywords() (+22 more)

### Community 5 - "Pipeline Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, apify-client, cheerio, dotenv, esbuild, googleapis, playwright, zod (+26 more)

### Community 6 - "Frontend, Sheets & Dev Workflow"
Cohesion: 0.17
Nodes (13): Fiestenpipeline Run Command (npm run run), Aider Frontline Edit + Promote Workflow, sync.ps1 Commit/Push Script, Cross-Tab Dedupe (date + fuzzy title), Google Sheets CSV Data Source (FB + Feesten), GHENT//EVENT Frontend (index.html), Walking Route Builder, Facebook Events Scraper Config (+5 more)

### Community 7 - "Google Sheets Export"
Cohesion: 0.16
Nodes (23): appendEventsToTab(), AUTO_COLUMNS, autoValue(), buildAutoRow(), colLetter(), ensureHeaders(), ensureSheetExists(), exportSheets() (+15 more)

### Community 8 - "Frontend Day Rail & Upsert Rework"
Cohesion: 0.22
Nodes (10): UNDERGHENT WIP Frontend, CRT Scanline / Glitch Aesthetic, Day Rail Component, Gentse Feesten Gold Segment, Festival Mode + Confetti, Per-Day Marker Layers, Secret 3x-Slam Gesture to UNDERGHENT, UNDERGHENT Frontend (underghent.html) (+2 more)

### Community 9 - "Facebook Scraper Config"
Cohesion: 0.12
Nodes (15): config, configDir, dataDir, __dirname, storage, STREET_WORDS, toSheet, ActorInput (+7 more)

### Community 10 - "Funke / Paylogic Scraper"
Cohesion: 0.15
Nodes (16): clean(), enrichFromPaylogic(), pad(), parseEventH2(), parseFunketivities(), parseProgram(), PaylogicChannel, PaylogicEmbeddedEvent (+8 more)

### Community 11 - "Fiesten Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, cheerio, dotenv, googleapis, devDependencies, tsx, @types/node, typescript (+8 more)

### Community 12 - "Artist Enrichment"
Cohesion: 0.14
Nodes (12): active, configDir, ctx, dataDir, __dirname, registries, storage, artistEnricher (+4 more)

### Community 13 - "Geo Enrichment"
Cohesion: 0.14
Nodes (13): active, configDir, ctx, dataDir, __dirname, geoEnricher, registries, storage (+5 more)

### Community 14 - "Asgaard Scraper"
Cohesion: 0.28
Nodes (14): CardData, eventsFromJson(), extractEventArray(), findTicketUrl(), looksLikeEventArray(), MONTHS, parseDate(), parseFullPageText() (+6 more)

### Community 15 - "TypeScript Config (Pipeline)"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, lib, module, moduleResolution, outDir, resolveJsonModule, rootDir (+5 more)

### Community 16 - "Pipeline Timing Harness"
Cohesion: 0.17
Nodes (8): DATA_DIR, __dirname, main(), OUT_FILE, PIPELINE, ROOT, runStep(), STEPS

### Community 17 - "TypeScript Config (alt)"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, lib, module, moduleResolution, resolveJsonModule, skipLibCheck, strict (+3 more)

### Community 18 - "Event Deduplication"
Cohesion: 0.15
Nodes (19): dedupeKey(), deduplicateAll(), merge(), mergeAggregatorIds(), priority(), SOURCE_PRIORITY, sourceOf(), diceCoefficient() (+11 more)

### Community 19 - "Venue Export & Logging"
Cohesion: 0.22
Nodes (8): configDir, __dirname, resolvedCreds, configDir, __dirname, resolvedCreds, logError(), loadRegistries()

### Community 20 - "Facebook Pull from Sheet"
Cohesion: 0.31
Nodes (10): APPROVED_VALUES, isApproved(), parseInt2(), parseList(), parseNum(), PullFacebookConfig, pullFacebookFromSheet(), PullFacebookResult (+2 more)

### Community 21 - "Wintercircus Scraper"
Cohesion: 0.35
Nodes (10): DomCard, eventsFromApiArray(), extractFromDom(), looksLikeEventArray(), parseApiDate(), parseDotDate(), parseHour(), scrape() (+2 more)

### Community 22 - "Genre Enrichment"
Cohesion: 0.22
Nodes (8): active, configDir, ctx, dataDir, __dirname, registries, storage, genreEnricher

### Community 23 - "Facebook Pull (Fiesten)"
Cohesion: 0.22
Nodes (7): configDir, dataDir, __dirname, registries, resolvedCreds, storage, MissingApprovedColumnError

### Community 24 - "Venue Sync from Sheet"
Cohesion: 0.33
Nodes (8): numOrNull(), orNull(), pullVenuesFromSheet(), PullVenuesResult, rowToVenue(), SCRAPE_TYPES, splitList(), VenuesSyncConfig

### Community 25 - "Data Registries"
Cohesion: 0.42
Nodes (7): GenresFile, OrganizersFile, VenuesFile, GenreRecord, OrganizerRecord, Registries, VenueRecord

### Community 26 - "Event Deduplication (Fiesten)"
Cohesion: 0.06
Nodes (30): alt — Alternative Rock / Indie  (w2)  [9 subs], blu — Blues  (w1)  [12 subs], brb — Breakbeat  (w3)  [11 subs], con — Contemporary Rock  (w1)  [7 subs], cou — Country  (w1)  [11 subs], Curated additions (approved), dnb — Drum 'n' Bass (D'n'b) / Jungle  (w3)  [10 subs], dtp — Downtempo / Ambient  (w3)  [13 subs] (+22 more)

### Community 27 - "Normalization Registry Loader"
Cohesion: 0.16
Nodes (17): dataDir, __dirname, scrapers, storage, parseIcalDatetime(), AgendaSource, findCalendarId(), parseIcalBlock() (+9 more)

### Community 29 - "Genre Text Matching"
Cohesion: 0.15
Nodes (12): domainLastCall, fetchHtml(), fetchJson(), withRetry(), BroeiDetail, fetchDetail(), scrapeList(), collectEventUrls() (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (9): dataDir, __dirname, scrapers, storage, NL_MONTHS, scrape(), scrapeList(), HEADERS (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (13): 1. CORE ARCHITECTURE — Sheets per-column ownership, 2. SCRAPERS, 3. FRONTEND, 4. EXECUTION ORDER, Bugs found (these explain your vanishing edits), Dead scrapers — root causes (verified), Field upgrades per working scraper, Housekeeping (+5 more)

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (11): allScrapers, dataDir, __dirname, storage, wanted, RawBeldubEvent, RawEvent, RawEventBase (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.21
Nodes (10): configDir, dataDir, __dirname, storage, OVERRIDE_READ_COLUMNS, OverridesSyncConfig, parseOverrides(), pullOverridesFromSheet() (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (11): scrape(), safeRun(), BijlokeDetail, buildEvent(), fetchDetail(), scrape(), scrapeWithPlaywright(), scrape() (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.17
Nodes (11): 1. Serial work that could be parallel, 2. Uncached repeat work, 3. Redundant passes / O(n²) hotspots, 4. I/O patterns, 5. Scraper-specific, 6. Frontend (`frontline/index.html`), 7. Anything else, Architecture (what you're looking at) (+3 more)

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (7): Detail, fetchDetail(), genresFrom(), KNOWN_GENRES, scrape(), scrapeList(), SUBTITLE_HINTS

### Community 43 - "Community 43"
Cohesion: 0.32
Nodes (6): dataDir, __dirname, outputPath, storage, exportJson(), sortEvents()

### Community 44 - "Community 44"
Cohesion: 0.43
Nodes (7): artistsFromLineup(), DETAIL_URL(), isoDate(), isoTime(), priceFromText(), scrape(), scrapeList()

### Community 45 - "Community 45"
Cohesion: 0.46
Nodes (7): collectWixEvents(), extractJsonBlobs(), isoDate(), isoTime(), looksLikeWixEvent(), scrape(), scrapeList()

### Community 46 - "Community 46"
Cohesion: 0.29
Nodes (5): fetchDetail(), HaDetail, scrape(), scrapeList(), scrapePage()

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (6): ⚠️ Billing, Capturing the Ghent "explore" URL, Facebook events scraper — `config/facebook.json`, Field reference, Run modes, Surrounding towns

### Community 48 - "Community 48"
Cohesion: 0.38
Nodes (6): buildEvent(), fetchDetail(), parseDotDate(), PepperedDetail, scrape(), scrapeWithPlaywright()

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (5): Files, Step 1 — full-codebase audit (free, ~1 minute), Step 2 — baseline timing, Step 3 onward, tooling/

## Knowledge Gaps
- **308 isolated node(s):** `name`, `version`, `type`, `scrape`, `export` (+303 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CanonicalEvent` connect `Storage & Export Orchestration` to `Community 34`, `Aggregator Scraping & Normalization`, `Community 37`, `Google Sheets Export`, `Community 40`, `Community 41`, `Community 43`, `Artist Enrichment`, `Geo Enrichment`, `Event Deduplication`, `Facebook Pull from Sheet`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `log()` connect `Aggregator Scraping & Normalization` to `Community 34`, `Community 36`, `Community 37`, `Facebook Scraper Config`, `Community 43`, `Artist Enrichment`, `Geo Enrichment`, `Venue Export & Logging`, `Facebook Pull from Sheet`, `Genre Enrichment`, `Facebook Pull (Fiesten)`, `Venue Sync from Sheet`, `Normalization Registry Loader`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `safeRun()` connect `Community 38` to `Venue Scraping & HTTP/Date Utils`, `Community 34`, `Community 36`, `Funke / Paylogic Scraper`, `Community 42`, `Community 44`, `Community 45`, `Asgaard Scraper`, `Community 46`, `Community 48`, `Venue Export & Logging`, `Wintercircus Scraper`, `Normalization Registry Loader`, `Genre Text Matching`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `name`, `version`, `type` to the rest of the system?**
  _317 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Event Detail Fetching` be split into smaller, more focused modules?**
  _Cohesion score 0.09871794871794871 - nodes in this community are weakly interconnected._
- **Should `Genre Keyword Generation` be split into smaller, more focused modules?**
  _Cohesion score 0.06190476190476191 - nodes in this community are weakly interconnected._
- **Should `Pipeline Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._