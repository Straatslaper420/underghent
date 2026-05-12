# UnderGhent / EventGhent — v2 Pipeline

Multi-source cultural event aggregation for Ghent.

## Folder structure

```
underghent_v2/
├── main.py                  ← Run this (or double-click run.bat)
├── run.bat
├── credentials.json         ← Your Google service account (keep secret!)
├── index.html               ← Frontend map
│
├── config/
│   ├── venues.json          ← Canonical venue registry + scrape URLs
│   ├── collectives.json     ← Collective registry
│   └── source_rules.json    ← Classification rules
│
├── data_pipeline/
│   ├── models.py            ← Event data model
│   ├── normalize.py         ← Venue resolution + geocoding + hashing
│   ├── classify.py          ← surface / under / review classification
│   ├── deduplicate.py       ← Cross-source deduplication
│   ├── facebook_ingest.py   ← Stevesie JSON ingestion
│   ├── venue_ingest.py      ← Venue website scrapers
│   ├── collective_ingest.py ← Collective website scrapers
│   ├── storage.py           ← Google Sheets / JSON / (Supabase) backend
│   └── export.py            ← Split JSON exports for frontend
│
├── input/                   ← Drop your Stevesie JSON files here
│
└── output/                  ← Auto-generated
    ├── events_master.json   ← All events
    ├── events_surface.json  ← Surface layer only
    ├── events_under.json    ← Under layer only
    ├── events_review.json   ← Needs human review
    └── events_geofail.json  ← Missing coordinates
```

## Setup

### 1. Install Python dependencies
```
pip install gspread google-auth requests beautifulsoup4
```

### 2. Place your credentials.json
Copy your Google service account credentials.json into this folder (same folder as main.py).

### 3. Drop Stevesie JSON files
Put all downloaded Facebook JSON files in the `input/` folder.

### 4. Run
Double-click `run.bat` or:
```
python main.py
```

## Adding a new venue scraper

1. Add the venue to `config/venues.json` with a `scrape_url`
2. In `data_pipeline/venue_ingest.py`, add:

```python
@register_parser("my_venue_id")
def parse_my_venue(html: str, venue_cfg: dict):
    soup = BeautifulSoup(html, "html.parser")
    events = []
    for item in soup.select("div.event"):
        ev = _make_venue_event(
            venue_cfg=venue_cfg,
            title=item.select_one("h2").text,
            start_iso="2026-06-01T20:00:00",
            source_url="https://myvenuesite.be/event/1"
        )
        events.append(ev)
    return events
```

## Layer logic

| Signal | Layer | Confidence |
|---|---|---|
| Canonical venue in venues.json | venue's config layer | 95% |
| Source type = collective_site | under | 90% |
| Keyword match (techno, rave…) | under | 70% |
| Keyword match (theater, opera…) | surface | 70% |
| Source type default | varies | 50% |
| No signal | review | 30% |

Events with confidence ≥ 85% → auto-approved.
Events with confidence ≥ 50% → pending (manual review in sheet).
Events below 50% → review tab.

## Frontend filters

The map has:
- **Layer toggles**: All / Surface / Under
- **Source toggles**: Facebook / Venue / Collective
- **Date filters**: Free range + Today / Tomorrow / This weekend

## Migrating to Supabase later

In `main.py`, replace:
```python
backend = SheetsBackend(...)
```
with:
```python
backend = SupabaseBackend(url="...", key="...")
```
The SupabaseBackend stub is already in `storage.py`.
