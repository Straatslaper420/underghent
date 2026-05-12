"""
geo_review_tool.py
Interactive command-line tool to verify uncertain event locations.

Reads geo_review events from Google Sheets (status='geo_review'),
opens Google Maps for each one, and lets you approve/fix/skip.

Usage:
  python geo_review_tool.py

Controls:
  Y / Enter  → approve the guessed location
  N          → reject (event stays in geo_review, lat/lng cleared)
  A <addr>   → manually enter a correct address (will be geocoded)
  S          → skip for now
  Q          → quit and save progress

What it writes back to the sheet:
  - Approved:  status='pending', lat/lng confirmed, address updated
  - Rejected:  status='geo_review', lat='' lng='' (goes back to GeoFail eventually)
  - Fixed:     status='pending', new lat/lng from manually entered address
"""

import sys
import os
import re
import time
import webbrowser

# Add pipeline to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "data_pipeline"))

from normalize import _geocode_with_verify
try:
    import venue_cache as _vc
except ImportError:
    class _vc:
        @staticmethod
        def update_from_review(*a, **kw): pass

CREDENTIALS_FILE = "credentials.json"
SHEET_NAME       = "UnderGhent_Events"
EVENTS_WS        = "Events"
GEOFAIL_WS       = "GeoFail"


def main():
    print("\n" + "=" * 60)
    print("  GEO REVIEW TOOL — UnderGhent")
    print("  Verify uncertain event locations")
    print("=" * 60 + "\n")

    # Connect to sheets
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds  = Credentials.from_service_account_file(CREDENTIALS_FILE, scopes=scopes)
        client = gspread.authorize(creds)
        spreadsheet = client.open(SHEET_NAME)
        sheet     = spreadsheet.worksheet(EVENTS_WS)
        sheet_geo = spreadsheet.worksheet(GEOFAIL_WS)
        print("  Connected to Google Sheets\n")
    except Exception as e:
        print(f"  !! Could not connect: {e}")
        return

    # Load all rows
    all_rows = sheet.get_all_values()
    headers  = all_rows[0] if all_rows else []

    def col(name):
        try: return headers.index(name)
        except: return None

    # Find review rows
    status_col    = col("Status")
    desc_col      = col("Description")
    lat_col       = col("Lat")
    lng_col       = col("Lng")
    addr_col      = col("Address")
    venue_col     = col("Venue")
    title_col     = col("Title")
    date_col      = col("Date_Start")
    srcurl_col    = col("Source_url")
    geo_guess_col = col("Geo_guess_address")

    if status_col is None:
        print("  !! Sheet missing Status column. Run the pipeline first.")
        return

    review_rows = []
    for i, row in enumerate(all_rows[1:], start=2):  # row 2 = first data row
        if len(row) > status_col and row[status_col].strip() == "geo_review":
            review_rows.append((i, row))

    if not review_rows:
        print("  No events with status=geo_review found. All clear!")
        return

    print(f"  Found {len(review_rows)} events needing geo review.\n")
    print("  Controls:")
    print("    Y / Enter → approve guessed location")
    print("    N         → reject (clear coords)")
    print("    A <addr>  → enter correct address")
    print("    S         → skip")
    print("    Q         → quit")
    print()

    approved = rejected = fixed = skipped = 0
    updates = []   # list of (row_idx, {col_idx: new_value})

    for idx, (row_num, row) in enumerate(review_rows):
        def _get(c):
            if c is None or c >= len(row): return ""
            return row[c].strip()

        title    = _get(title_col)
        venue    = _get(venue_col)
        address  = _get(addr_col)
        date     = _get(date_col)
        desc     = _get(desc_col)
        src_url  = _get(srcurl_col)
        geo_guess = _get(geo_guess_col) if geo_guess_col else ""

        # Parse the guess lat/lng out of description
        guess_lat, guess_lng = None, None
        guess_addr = geo_guess or ""
        m_lat = re.search(r'guess_lat:([\d.]+)', desc)
        m_lng = re.search(r'guess_lng:([\d.]+)', desc)
        m_adr = re.search(r'guess_addr:(.+?)(?:\||$)', desc)
        if m_lat: guess_lat = float(m_lat.group(1))
        if m_lng: guess_lng = float(m_lng.group(1))
        if m_adr and not guess_addr: guess_addr = m_adr.group(1).strip()

        print(f"\n{'─'*58}")
        print(f"  [{idx+1}/{len(review_rows)}]  {title}")
        print(f"  Venue:   {venue or '(none)'}")
        print(f"  Address: {address or '(none)'}")
        print(f"  Date:    {date}")
        if guess_addr:
            print(f"  Nominatim returned: {guess_addr[:80]}")

        if guess_lat and guess_lng:
            maps_url = f"https://www.google.com/maps?q={guess_lat},{guess_lng}"
            print(f"  Maps:    {maps_url}")
            # Auto-open in browser
            try:
                webbrowser.open(maps_url)
            except:
                pass
        elif src_url:
            print(f"  FB URL:  {src_url}")

        # Prompt
        try:
            ans = input("\n  [Y/N/A <address>/S/Q] → ").strip()
        except KeyboardInterrupt:
            print("\n\n  Interrupted — saving progress...")
            break

        if ans.upper() == "Q":
            break
        elif ans.upper() == "S":
            skipped += 1
            continue
        elif ans == "" or ans.upper() == "Y":
            if guess_lat is None:
                print("  !! No guess coords to approve. Use A <address> instead.")
                skipped += 1
                continue
            # Approve guess
            updates.append((row_num, {
                status_col: "pending",
                lat_col:    str(guess_lat).replace(".", ","),
                lng_col:    str(guess_lng).replace(".", ","),
                addr_col:   guess_addr or address,
            }))
            _vc.update_from_review(venue or title, guess_lat, guess_lng, guess_addr or address)
            approved += 1
            print(f"  ✓ Approved: {guess_lat}, {guess_lng}")

        elif ans.upper() == "N":
            # Reject — clear coords, keep as geo_review so it shows in GeoFail
            updates.append((row_num, {
                status_col: "geo_review",
                lat_col:    "",
                lng_col:    "",
            }))
            rejected += 1
            print("  ✗ Rejected")

        elif ans.upper().startswith("A "):
            manual_addr = ans[2:].strip()
            if not manual_addr:
                print("  !! No address entered.")
                skipped += 1
                continue
            print(f"  Geocoding: {manual_addr}...")
            lat, lng, resolved = _geocode_with_verify(
                manual_addr + (", Gent, Belgium" if "gent" not in manual_addr.lower() else ""),
                must_contain_ghent=False,  # user-entered, trust them
            )
            if lat is None:
                print("  !! Geocoding failed. Try a different address.")
                skipped += 1
                continue
            # Show them what we got
            confirm_url = f"https://www.google.com/maps?q={lat},{lng}"
            print(f"  → {resolved[:80]}")
            print(f"  → {confirm_url}")
            try:
                webbrowser.open(confirm_url)
                ok = input("  Confirm? [Y/N] → ").strip().upper()
            except KeyboardInterrupt:
                skipped += 1
                continue
            if ok == "Y" or ok == "":
                updates.append((row_num, {
                    status_col: "pending",
                    lat_col:    str(lat).replace(".", ","),
                    lng_col:    str(lng).replace(".", ","),
                    addr_col:   resolved or manual_addr,
                }))
                _vc.update_from_review(venue or title, lat, lng, resolved or manual_addr)
                fixed += 1
                print(f"  ✓ Fixed: {lat}, {lng}")
            else:
                skipped += 1
                print("  Skipped")
        else:
            print("  !! Unknown command, skipping")
            skipped += 1

    # ── Write updates back to sheet ────────────────────────────
    if updates:
        print(f"\n  Writing {len(updates)} updates to sheet...")
        for row_num, changes in updates:
            for col_idx, val in changes.items():
                if col_idx is not None:
                    try:
                        sheet.update_cell(row_num, col_idx + 1, val)
                        time.sleep(0.3)
                    except Exception as e:
                        print(f"  !! Could not update row {row_num}: {e}")
        print("  Done.")

    print(f"\n{'='*60}")
    print(f"  Approved: {approved}  Fixed: {fixed}  Rejected: {rejected}  Skipped: {skipped}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
