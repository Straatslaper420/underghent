# Graph Report - .  (2026-06-30)

## Corpus Check
- Large corpus: 117 files · ~932,993 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 654 nodes · 1387 edges · 34 communities (32 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `safeRun()` - 45 edges
2. `fetchHtml()` - 43 edges
3. `makeScraperResult()` - 41 edges
4. `parseCheerio()` - 38 edges
5. `CanonicalEvent` - 28 edges
6. `log()` - 26 edges
7. `ScraperResult` - 25 edges
8. `parseTime()` - 23 edges
9. `JsonStorageAdapter` - 22 edges
10. `scripts` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Fiestenpipeline Run Command (npm run run)` --semantically_similar_to--> `scrape:venues SOURCE_ID Runner`  [INFERRED] [semantically similar]
  fiestenpipeline/how to run.txt → pipeline/src/scrapers/how to scrape specific venues.txt
- `Festival Mode + Confetti` --semantically_similar_to--> `CRT Scanline / Glitch Aesthetic`  [INFERRED] [semantically similar]
  index.html → frontline/underghent_WIP.html
- `Cross-Tab Dedupe (date + fuzzy title)` --semantically_similar_to--> `pull-venues (Venues tab -> venues.json)`  [INFERRED] [semantically similar]
  index.html → pipeline/src/scrapers/how to scrape specific venues.txt
- `Graphify Knowledge Graph Workflow` --conceptually_related_to--> `Tooling Refactor Orchestration Helpers`  [AMBIGUOUS]
  CLAUDE.md → tooling/README.md
- `Festival Signal on Underground Carrier (Visual Direction)` --rationale_for--> `GHENT//EVENT Frontend (index.html)`  [INFERRED]
  PLAN.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sheets Ownership: Upsert + Pull-Overrides + Schema** — plan_sheets_ownership_model, plan_named_column_upsert, plan_pull_overrides, plan_events_tab_schema, plan_override_columns [EXTRACTED 0.85]
- **Day Rail / Feesten Festival-Mode Flow** — index_dayrail, index_feesten_segment, index_festival_mode_confetti, index_per_day_marker_layers [EXTRACTED 0.85]
- **Facebook Discovery + Geo/Genre Filtering** — pipeline_config_facebook_readme_apify_actor, pipeline_config_facebook_readme_discovery_mode, pipeline_config_facebook_readme_ghent_bounds, pipeline_config_facebook_readme_music_only_gate [EXTRACTED 0.80]

## Communities (34 total, 2 thin omitted)

### Community 0 - "Venue Scraping & HTTP/Date Utils"
Cohesion: 0.05
Nodes (87): allScrapers, dataDir, __dirname, storage, wanted, NL_MONTHS, parseNlDate(), parseTime() (+79 more)

### Community 1 - "Storage & Export Orchestration"
Cohesion: 0.06
Nodes (26): dataDir, __dirname, outputPath, storage, configDir, dataDir, __dirname, storage (+18 more)

### Community 2 - "Event Detail Fetching"
Cohesion: 0.10
Nodes (32): absUrl(), clean(), fetchDetail(), fieldByLabel(), parseDetail(), concurrentMap(), fetchHtml(), politeDelay() (+24 more)

### Community 3 - "Aggregator Scraping & Normalization"
Cohesion: 0.09
Nodes (32): dataDir, __dirname, scrapers, storage, parseIcalDatetime(), normalizeAgenda(), normalizeAll(), normalizeBeldub() (+24 more)

### Community 4 - "Genre Keyword Generation"
Cohesion: 0.06
Nodes (30): ACR, afterCount, allCodes, buildText(), CURATED_ALIASES, CURATED_KEYWORDS, DENY, deriveKeywords() (+22 more)

### Community 5 - "Pipeline Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, apify-client, cheerio, dotenv, esbuild, googleapis, playwright, zod (+26 more)

### Community 6 - "Frontend, Sheets & Dev Workflow"
Cohesion: 0.08
Nodes (25): Graphify Knowledge Graph Workflow, Fiestenpipeline Run Command (npm run run), Aider Frontline Edit + Promote Workflow, sync.ps1 Commit/Push Script, Cross-Tab Dedupe (date + fuzzy title), Google Sheets CSV Data Source (FB + Feesten), GHENT//EVENT Frontend (index.html), Walking Route Builder (+17 more)

### Community 7 - "Google Sheets Export"
Cohesion: 0.16
Nodes (23): appendEventsToTab(), AUTO_COLUMNS, autoValue(), buildAutoRow(), colLetter(), ensureHeaders(), ensureSheetExists(), exportSheets() (+15 more)

### Community 8 - "Frontend Day Rail & Upsert Rework"
Cohesion: 0.11
Nodes (20): UNDERGHENT WIP Frontend, CRT Scanline / Glitch Aesthetic, Day Rail Component, Gentse Feesten Gold Segment, Festival Mode + Confetti, Per-Day Marker Layers, Secret 3x-Slam Gesture to UNDERGHENT, Day Rail Mechanic (+12 more)

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
Cohesion: 0.17
Nodes (12): active, configDir, ctx, dataDir, __dirname, registries, storage, artistEnricher (+4 more)

### Community 13 - "Geo Enrichment"
Cohesion: 0.14
Nodes (13): active, configDir, ctx, dataDir, __dirname, geoEnricher, registries, storage (+5 more)

### Community 14 - "Asgaard Scraper"
Cohesion: 0.31
Nodes (13): CardData, eventsFromJson(), extractEventArray(), findTicketUrl(), looksLikeEventArray(), MONTHS, parseDate(), parseFullPageText() (+5 more)

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
Cohesion: 0.27
Nodes (8): dedupeKey(), deduplicateAll(), merge(), mergeAggregatorIds(), priority(), SOURCE_PRIORITY, sourceOf(), diceCoefficient()

### Community 19 - "Venue Export & Logging"
Cohesion: 0.23
Nodes (9): configDir, __dirname, resolvedCreds, configDir, __dirname, resolvedCreds, log(), logError() (+1 more)

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
Cohesion: 0.36
Nodes (7): dedupeKey(), deduplicateAll(), merge(), mergeAggregatorIds(), priority(), SOURCE_PRIORITY, sourceOf()

### Community 27 - "Normalization Registry Loader"
Cohesion: 0.29
Nodes (6): configDir, dataDir, __dirname, registries, storage, loadRegistries()

### Community 28 - "Music-Only Genre Gate"
Cohesion: 0.40
Nodes (5): musicOnly Genre Keyword Gate, Curated Keyword Additions, Genre Keyword/Alias Matching, musicmap.info master-genrelist Source, Generated Genre Taxonomy

### Community 29 - "Genre Text Matching"
Cohesion: 0.70
Nodes (4): normalizeText(), buildCombinedText(), escapeRe(), longestMatch()

## Ambiguous Edges - Review These
- `Graphify Knowledge Graph Workflow` → `Tooling Refactor Orchestration Helpers`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **240 isolated node(s):** `name`, `version`, `type`, `scrape`, `export` (+235 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Graphify Knowledge Graph Workflow` and `Tooling Refactor Orchestration Helpers`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `CanonicalEvent` connect `Storage & Export Orchestration` to `Aggregator Scraping & Normalization`, `Google Sheets Export`, `Artist Enrichment`, `Geo Enrichment`, `Event Deduplication`, `Facebook Pull from Sheet`, `Event Deduplication (Fiesten)`, `Genre Text Matching`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `log()` connect `Venue Export & Logging` to `Venue Scraping & HTTP/Date Utils`, `Storage & Export Orchestration`, `Aggregator Scraping & Normalization`, `Facebook Scraper Config`, `Artist Enrichment`, `Geo Enrichment`, `Facebook Pull from Sheet`, `Genre Enrichment`, `Facebook Pull (Fiesten)`, `Venue Sync from Sheet`, `Normalization Registry Loader`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `safeRun()` connect `Venue Scraping & HTTP/Date Utils` to `Storage & Export Orchestration`, `Aggregator Scraping & Normalization`, `Funke / Paylogic Scraper`, `Asgaard Scraper`, `Venue Export & Logging`, `Wintercircus Scraper`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `name`, `version`, `type` to the rest of the system?**
  _249 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Venue Scraping & HTTP/Date Utils` be split into smaller, more focused modules?**
  _Cohesion score 0.05098988748041589 - nodes in this community are weakly interconnected._
- **Should `Storage & Export Orchestration` be split into smaller, more focused modules?**
  _Cohesion score 0.05605499735589635 - nodes in this community are weakly interconnected._