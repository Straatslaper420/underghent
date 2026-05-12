"""
storage.py
Storage abstraction layer.
Currently implements Google Sheets backend.
Swap to Supabase by implementing SupabaseBackend with the same interface.
"""

import time
import json
import os
from typing import List, Set
from models import Event


# ── Interface ─────────────────────────────────────────────────

class StorageBackend:
    def load_existing_ids(self) -> Set[str]:
        raise NotImplementedError
    def load_all_rows(self) -> List[list]:
        raise NotImplementedError
    def write_events(self, events: List[Event]) -> dict:
        raise NotImplementedError
    def write_geofail(self, events: List[Event]) -> dict:
        raise NotImplementedError


# ── Google Sheets Backend ─────────────────────────────────────

class SheetsBackend(StorageBackend):
    SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    def __init__(self, credentials_path: str, sheet_name: str,
                 events_worksheet: str = "Events",
                 geofail_worksheet: str = "GeoFail"):
        import gspread
        from google.oauth2.service_account import Credentials

        creds = Credentials.from_service_account_file(credentials_path, scopes=self.SCOPES)
        client = gspread.authorize(creds)
        spreadsheet = client.open(sheet_name)

        self.sheet     = spreadsheet.worksheet(events_worksheet)
        self.sheet_geo = spreadsheet.worksheet(geofail_worksheet)

    def load_existing_ids(self) -> Set[str]:
        events_ids  = set(self.sheet.col_values(1)[1:])
        geofail_ids = set(self.sheet_geo.col_values(1)[1:])
        return events_ids.union(geofail_ids)

    def load_all_rows(self) -> List[list]:
        return self.sheet.get_all_values()[1:]

    def _ensure_headers(self):
        if self.sheet.cell(1, 1).value != "ID":
            self._write_one(self.sheet, Event.sheets_headers())
        if self.sheet_geo.cell(1, 1).value != "ID":
            self._write_one(self.sheet_geo, Event.sheets_headers())

    def write_events(self, events: List[Event]) -> dict:
        self._ensure_headers()
        if not events:
            return {"written": 0, "failed": 0}
        rows = [ev.to_sheets_row() for ev in events]
        ok = self._batch_write(self.sheet, rows)
        return {"written": ok, "failed": len(rows) - ok}

    def write_geofail(self, events: List[Event]) -> dict:
        self._ensure_headers()
        if not events:
            return {"written": 0, "failed": 0}
        rows = [ev.to_sheets_row() for ev in events]
        ok = self._batch_write(self.sheet_geo, rows)
        return {"written": ok, "failed": len(rows) - ok}

    def _write_one(self, ws, row) -> bool:
        for attempt in range(3):
            try:
                ws.append_row(row, value_input_option="USER_ENTERED")
                time.sleep(1)
                return True
            except Exception as e:
                if "429" in str(e):
                    wait = 60 * (attempt + 1)
                    print(f"    Rate limit — waiting {wait}s")
                    time.sleep(wait)
                else:
                    print(f"    Write error: {e}")
                    return False
        return False

    def _batch_write(self, ws, rows: List[list]) -> int:
        """
        Write ALL rows in a single append_rows() API call.
        This counts as just 1 write request against the quota,
        completely solving the 429 rate limit errors.
        """
        for attempt in range(3):
            try:
                ws.append_rows(rows, value_input_option="USER_ENTERED")
                print(f"    Wrote {len(rows)} rows in 1 API call")
                return len(rows)
            except Exception as e:
                if "429" in str(e):
                    wait = 60 * (attempt + 1)
                    print(f"    Rate limit — waiting {wait}s then retrying")
                    time.sleep(wait)
                else:
                    print(f"    Batch write error: {e}")
                    return 0
        return 0


# ── JSON File Backend (local testing, no Google credentials needed) ──

class JSONBackend(StorageBackend):
    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self._master_path = os.path.join(output_dir, "events_master.json")

    def load_existing_ids(self) -> Set[str]:
        if not os.path.exists(self._master_path):
            return set()
        with open(self._master_path, encoding="utf-8") as f:
            data = json.load(f)
        return {e.get("id", "") for e in data}

    def load_all_rows(self) -> List[list]:
        return []

    def write_events(self, events: List[Event]) -> dict:
        existing = []
        if os.path.exists(self._master_path):
            with open(self._master_path, encoding="utf-8") as f:
                existing = json.load(f)
        existing_ids = {e.get("id") for e in existing}
        new = [e.to_dict() for e in events if e.id not in existing_ids]
        existing.extend(new)
        with open(self._master_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        return {"written": len(new), "failed": 0}

    def write_geofail(self, events: List[Event]) -> dict:
        path = os.path.join(self.output_dir, "events_geofail.json")
        existing = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                existing = json.load(f)
        existing_ids = {e.get("id") for e in existing}
        new = [e.to_dict() for e in events if e.id not in existing_ids]
        existing.extend(new)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        return {"written": len(new), "failed": 0}


# ── Supabase stub (future migration) ─────────────────────────
# class SupabaseBackend(StorageBackend):
#     def __init__(self, url, key):
#         from supabase import create_client
#         self.client = create_client(url, key)
#     def load_existing_ids(self):
#         return {r["id"] for r in self.client.table("events").select("id").execute().data}
#     def write_events(self, events):
#         self.client.table("events").upsert([e.to_dict() for e in events]).execute()
#         return {"written": len(events), "failed": 0}