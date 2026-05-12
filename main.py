"""
main.py  ·  UnderGhent / EventGhent pipeline orchestrator

Geo routing:
  approved    → Events sheet   (exact coords, auto-classified)
  pending     → Events sheet   (good coords, needs editorial review)
  geo_review  → GeoReview sheet (has a coord GUESS → run geo_review_tool.py to confirm)
  geofail     → GeoFail sheet  (no coords at all → fix venue in venues.json or add alias)
  duplicate   → not written
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

sys.stdout = Logger("log.txt")
sys.stderr = sys.stdout

# ── Config ────────────────────────────────────────────────────
FACEBOOK_INPUT_FOLDER = r"input"
CREDENTIALS_FILE      = "credentials.json"
SHEET_NAME            = "UnderGhent_Events"
OUTPUT_DIR            = "output"

USE_GOOGLE_SHEETS = os.path.exists(CREDENTIALS_FILE)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "data_pipeline"))

from models             import Event
from normalize          import load_runtime_venue_db
from facebook_ingest    import ingest_folder as ingest_facebook, collect_social_updates
from venue_ingest       import ingest_all_venues
from collective_ingest  import ingest_all_collectives
from deduplicate        import deduplicate, split_by_status
from export             import export_all

# ── Storage backend ───────────────────────────────────────────
if USE_GOOGLE_SHEETS:
    from storage import SheetsBackend

    import gspread
    from google.oauth2.service_account import Credentials
    SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds  = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=SCOPES)
    client = gspread.authorize(creds)
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

    backend_events    = SheetsBackend.__new__(SheetsBackend)
    backend_events.sheet     = sheet_events
    backend_events.sheet_geo = sheet_geofail

    backend_review = SheetsBackend.__new__(SheetsBackend)
    backend_review.sheet     = sheet_georeview
    backend_review.sheet_geo = sheet_georeview

    print("Storage: Google Sheets  (Events / GeoReview / GeoFail tabs)")
else:
    from storage import JSONBackend
    backend_events = JSONBackend(OUTPUT_DIR)
    backend_review = None
    print("Storage: Local JSON")

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
    try:
        import json as _j, os as _os
        _cf = _os.path.join(_os.path.dirname(__file__), "data_pipeline", "..", "config", "venue_cache.json")
        _cache = _j.load(open(_cf)) if _os.path.exists(_cf) else {}
        print(f"  Local venue cache: {len(_cache)} venues")
    except:
        print("  Local venue cache: (empty)")
else:
    existing_ids = backend_events.load_existing_ids()
    print(f"  Existing: {len(existing_ids)}")

# ── Step 1b: Update social counts for existing events ─────────
print("\n========================================")
print("  UPDATING SOCIAL COUNTS (interested / going)")

if USE_GOOGLE_SHEETS and os.path.exists(FACEBOOK_INPUT_FOLDER):
    social_updates = collect_social_updates(FACEBOOK_INPUT_FOLDER)

    # Build lookup: raw_id → (sheet_name, row_number, interested_col, going_col)
    # We need to scan all three sheets
    interested_col = 19   # 1-based column index (col 19 = Interested)
    going_col      = 20   # 1-based column index (col 20 = Going)

    updated_count = 0
    sheets_to_scan = [
        (sheet_events,    "Events"),
        (sheet_georeview, "GeoReview"),
        (sheet_geofail,   "GeoFail"),
    ]

    # Collect all (sheet, row_num, raw_id, cur_interested, cur_going)
    cells_to_update = []   # list of (ws, row_num, new_interested, new_going)

    for ws, ws_name in sheets_to_scan:
        try:
            all_vals = ws.get_all_values()
        except Exception as e:
            print(f"  !! Could not read {ws_name}: {e}")
            continue

        if not all_vals:
            continue

        for row_num, row in enumerate(all_vals[1:], start=2):
            if not row:
                continue
            sheet_id = row[0].strip()  # column A = full ID like "fb:123456"
            # Extract the raw numeric ID
            raw_id = sheet_id.replace("fb:", "").strip()

            if raw_id not in social_updates:
                continue

            upd = social_updates[raw_id]
            cur_interested = row[18].strip() if len(row) > 18 else ""
            cur_going      = row[19].strip() if len(row) > 19 else ""

            # Only update if the number actually changed
            new_interested = upd["interested"]
            new_going      = upd["going"]

            if new_interested != cur_interested or new_going != cur_going:
                cells_to_update.append((ws, row_num, new_interested, new_going))

    if cells_to_update:
        print(f"  Updating {len(cells_to_update)} events with new social counts...")
        # Batch updates: group by worksheet to minimise API calls
        from collections import defaultdict
        by_sheet = defaultdict(list)
        for ws, rn, ni, ng in cells_to_update:
            by_sheet[ws].append((rn, ni, ng))

        for ws, items in by_sheet.items():
            # Build a batch update request
            body = {"valueInputOption": "USER_ENTERED", "data": []}
            for rn, ni, ng in items:
                if ni:
                    body["data"].append({
                        "range": f"{ws.title}!S{rn}",   # col S = 19
                        "values": [[ni]]
                    })
                if ng:
                    body["data"].append({
                        "range": f"{ws.title}!T{rn}",   # col T = 20
                        "values": [[ng]]
                    })
            if body["data"]:
                for attempt in range(3):
                    try:
                        ws.spreadsheet.values_batch_update(body)
                        updated_count += len(items)
                        print(f"  Updated {len(items)} rows in {ws.title}")
                        break
                    except Exception as e:
                        if "429" in str(e):
                            wait = 60 * (attempt + 1)
                            print(f"  Rate limit — waiting {wait}s")
                            time.sleep(wait)
                        else:
                            print(f"  Batch update error: {e}")
                            break
    else:
        print("  No social count changes detected")

# ── Step 2: Ingest ────────────────────────────────────────────
print("\n========================================")
print("  FACEBOOK INGESTION")
fb_events = []
if os.path.exists(FACEBOOK_INPUT_FOLDER):
    fb_events = ingest_facebook(FACEBOOK_INPUT_FOLDER, set(existing_ids))
else:
    print(f"  !! Folder '{FACEBOOK_INPUT_FOLDER}' not found")

print("\n========================================")
print("  VENUE WEBSITE INGESTION")
venue_events = ingest_all_venues(set(existing_ids))

print("\n========================================")
print("  COLLECTIVE WEBSITE INGESTION")
collective_events = ingest_all_collectives(set(existing_ids))

# ── Step 3: Deduplicate ───────────────────────────────────────
print("\n========================================")
print("  DEDUPLICATION")
all_new = fb_events + venue_events + collective_events
print(f"  Total raw new events: {len(all_new)}")
deduped = deduplicate(all_new)
_split = split_by_status(deduped)
if len(_split) == 5:
    approved, geo_review, pending, dups, geofail = _split
else:
    # Old deduplicate.py — upgrade it
    approved, geo_review, pending, geofail = _split
    dups = []
    print("  !! Old deduplicate.py detected — please replace it with the new version")

print(f"  approved={len(approved)}  geo_review={len(geo_review)}  "
      f"pending={len(pending)}  dups={len(dups)}  geofail={len(geofail)}")

# ── Step 4: Write ─────────────────────────────────────────────
print("\n========================================")
print("  WRITING TO STORAGE")

def _batch_write_ws(ws, events):
    """Write events to a specific worksheet directly."""
    if not events:
        return 0
    # Ensure header
    try:
        if ws.cell(1,1).value != "ID":
            ws.append_row(Event.sheets_headers(), value_input_option="USER_ENTERED")
            time.sleep(1)
    except:
        pass
    rows = [e.to_sheets_row() for e in events]
    for attempt in range(3):
        try:
            ws.append_rows(rows, value_input_option="USER_ENTERED")
            print(f"    Wrote {len(rows)} rows to '{ws.title}' in 1 API call")
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

if USE_GOOGLE_SHEETS:
    n1 = _batch_write_ws(sheet_events,    approved + pending)
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
print(f"  Facebook:      {len(fb_events)}")
print(f"  Venue sites:   {len(venue_events)}")
print(f"  Collectives:   {len(collective_events)}")
print(f"  Duplicates:    {len(dups)}")
print(f"  → Approved:    {len(approved)}")
print(f"  → GeoReview:   {len(geo_review)}  ← run geo_review_tool.py to fix these")
print(f"  → Pending:     {len(pending)}")
print(f"  → Low interest:{len([e for e in deduped if e.status=='low_interest'])}")
print(f"  → GeoFail:     {len(geofail)}")
if geo_review:
    print(f"\n  !! {len(geo_review)} events need location verification.")
    print(f"     Run: python geo_review_tool.py")
print("========================================")
