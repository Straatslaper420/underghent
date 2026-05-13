"""
scrape_venues.py  ·  Venue website scraper (no Facebook)

Scrapes all venue websites, deduplicates, writes new events to Google Sheets
and exports JSON files. Does NOT touch the Facebook input folder.

Double-click scrape_venues.bat  OR  run:  python scrape_venues.py
"""

import sys, os, time

class Logger:
    def __init__(self, path):
        self.terminal = sys.__stdout__
        self.log = open(path, "w", encoding="utf-8")
    def write(self, msg):
        self.terminal.write(msg); self.terminal.flush()
        self.log.write(msg);      self.log.flush()
    def flush(self):
        self.terminal.flush(); self.log.flush()

sys.stdout = Logger("log_venues.txt")
sys.stderr = sys.stdout

# ── Config ────────────────────────────────────────────────────
CREDENTIALS_FILE = "credentials.json"
SHEET_NAME       = "UnderGhent_Events"
OUTPUT_DIR       = "output"

USE_GOOGLE_SHEETS = os.path.exists(CREDENTIALS_FILE)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "data_pipeline"))

from models       import Event
from normalize    import load_runtime_venue_db, make_normalized_hash
from venue_ingest import ingest_all_venues
from deduplicate  import deduplicate, split_by_status
from export       import export_all

# ── Storage backend ───────────────────────────────────────────
if USE_GOOGLE_SHEETS:
    from storage import SheetsBackend
    import gspread
    from google.oauth2.service_account import Credentials
    SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds       = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    client      = gspread.authorize(creds)
    spreadsheet = client.open(SHEET_NAME)

    def _ensure_tab(name):
        try:
            return spreadsheet.worksheet(name)
        except:
            ws = spreadsheet.add_worksheet(title=name, rows=2000, cols=22)
            return ws

    sheet_events    = _ensure_tab("Events")
    sheet_georeview = _ensure_tab("GeoReview")
    sheet_geofail   = _ensure_tab("GeoFail")
    print("Storage: Google Sheets  (Events / GeoReview / GeoFail tabs)")
else:
    from storage import JSONBackend
    backend_events = JSONBackend(OUTPUT_DIR)
    print("Storage: Local JSON  (no credentials.json found)")

# ── Step 1: Load existing IDs ─────────────────────────────────
print("\n========================================")
print("  Loading existing event IDs...")

if USE_GOOGLE_SHEETS:
    ids_events    = set(sheet_events.col_values(1)[1:])
    ids_georeview = set(sheet_georeview.col_values(1)[1:])
    ids_geofail   = set(sheet_geofail.col_values(1)[1:])
    existing_ids  = ids_events | ids_georeview | ids_geofail
    print(f"  Events: {len(ids_events)}  GeoReview: {len(ids_georeview)}  GeoFail: {len(ids_geofail)}")

    rows = sheet_events.get_all_values()[1:]
    n = load_runtime_venue_db(rows)
    print(f"  Loaded {n} venue coord references from Events sheet")

    for row in rows:
        title    = row[1] if len(row) > 1 else ""
        date_raw = row[2] if len(row) > 2 else ""
        venue    = row[6] if len(row) > 6 else ""
        if len(date_raw) == 10:
            d, m, y = date_raw[:2], date_raw[3:5], date_raw[6:]
            date_iso = f"{y}-{m}-{d}"
        else:
            date_iso = date_raw[:10]
        if title and date_iso:
            existing_ids.add(make_normalized_hash(title, date_iso, venue))
else:
    existing_ids = backend_events.load_existing_ids()
    print(f"  Existing: {len(existing_ids)}")

# ── Step 2: Scrape venue websites ─────────────────────────────
print("\n========================================")
print("  VENUE WEBSITE SCRAPING")
venue_events = ingest_all_venues(set(existing_ids))
print(f"  Total new venue events: {len(venue_events)}")

# ── Step 3: Deduplicate ───────────────────────────────────────
print("\n========================================")
print("  DEDUPLICATION")
deduped = deduplicate(venue_events)
_split  = split_by_status(deduped)
if len(_split) == 5:
    approved, geo_review, pending, dups, geofail = _split
else:
    approved, geo_review, pending, geofail = _split
    dups = []

print(f"  approved={len(approved)}  geo_review={len(geo_review)}  "
      f"pending={len(pending)}  dups={len(dups)}  geofail={len(geofail)}")

# ── Step 4: Write ─────────────────────────────────────────────
print("\n========================================")
print("  WRITING TO STORAGE")

def _batch_write_ws(ws, events):
    if not events:
        return 0
    try:
        if ws.cell(1, 1).value != "ID":
            ws.append_row(Event.sheets_headers(), value_input_option="USER_ENTERED")
            time.sleep(1)
    except:
        pass
    rows = [e.to_sheets_row() for e in events]
    for attempt in range(3):
        try:
            ws.append_rows(rows, value_input_option="USER_ENTERED")
            print(f"    Wrote {len(rows)} rows to '{ws.title}'")
            return len(rows)
        except Exception as e:
            if "429" in str(e):
                wait = 60 * (attempt + 1)
                print(f"    Rate limit — waiting {wait}s")
                time.sleep(wait)
            else:
                print(f"    Write error: {e}")
                return 0
    return 0

def _pair_with_dups(canonical_events, dups):
    dup_map = {}
    for d in dups:
        dup_map.setdefault(d.duplicate_of, []).append(d)
    result = []
    for ev in canonical_events:
        result.append(ev)
        result.extend(dup_map.get(ev.id, []))
    return result

if USE_GOOGLE_SHEETS:
    n1 = _batch_write_ws(sheet_events,    _pair_with_dups(approved + pending, dups))
    n2 = _batch_write_ws(sheet_georeview, geo_review)
    n3 = _batch_write_ws(sheet_geofail,   geofail)
    print(f"  Events: {n1}  GeoReview: {n2}  GeoFail: {n3}")
else:
    res = backend_events.write_events(approved + pending)
    print(f"  Written: {res['written']}")

# ── Step 5: Export JSON ───────────────────────────────────────
print("\n========================================")
print("  EXPORTING JSON FILES")
export_all(deduped, OUTPUT_DIR)

# ── Summary ───────────────────────────────────────────────────
print("\n========================================")
print(f"  Venue sites scraped:  {len(venue_events)}")
print(f"  Duplicates removed:   {len(dups)}")
print(f"  → Approved:           {len(approved)}")
print(f"  → Pending:            {len(pending)}")
print(f"  → GeoReview:          {len(geo_review)}  ← run geo_review_tool.py to fix")
print(f"  → GeoFail:            {len(geofail)}")
print("========================================")
print()
if geo_review:
    print(f"  !! {len(geo_review)} events need location verification.")
    print(f"     Run: python geo_review_tool.py")
    print()
print("  Log saved to: log_venues.txt")
print("========================================")
input("\nDone. Press Enter to close...")
