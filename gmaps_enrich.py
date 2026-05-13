"""
gmaps_enrich.py
Enrich event coordinates in events_master.json using Google Maps APIs.

Usage:
  python gmaps_enrich.py                          # dry run
  python gmaps_enrich.py --write                  # write changes
  python gmaps_enrich.py --write --missing-only   # only null lat/lng
  python gmaps_enrich.py --write --venue-id kompass
"""

import os
import json
import time
import sys
import argparse
import difflib

import requests

# ── Config ────────────────────────────────────────────────────────────────────

GMAPS_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MASTER     = os.path.join(BASE_DIR, "output", "events_master.json")
GEOFAIL    = os.path.join(BASE_DIR, "output", "events_geofail.json")
REVIEW     = os.path.join(BASE_DIR, "output", "events_review.json")
VENUES_CFG = os.path.join(BASE_DIR, "config", "venues.json")
CACHE_PATH = os.path.join(BASE_DIR, "config", "venue_cache.json")
REPORT     = os.path.join(BASE_DIR, "gmaps_enrich_report.json")

PLACES_URL  = "https://maps.googleapis.com/maps/api/place/textsearch/json"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

FUZZY_THRESHOLD = 0.85
CHUNK_SIZE      = 100


# ── Helpers ───────────────────────────────────────────────────────────────────

def decimal_places(v) -> int:
    if v is None:
        return 0
    s = str(v)
    if "." in s:
        return len(s.split(".")[1])
    return 0


def is_precise(lat, lng) -> bool:
    return (
        lat is not None
        and lng is not None
        and decimal_places(lat) >= 6
        and decimal_places(lng) >= 6
    )


def needs_enrichment(event: dict, missing_only: bool = False) -> bool:
    lat = event.get("lat")
    lng = event.get("lng")
    if lat is None or lng is None:
        return True
    if event.get("coord_source") == "needs_review":
        return True
    if missing_only:
        return False
    return decimal_places(lat) < 6 or decimal_places(lng) < 6


def load_json(path: str) -> list | dict:
    if not os.path.exists(path):
        return [] if path.endswith("master") or path in (GEOFAIL, REVIEW) else {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── Venue matching ────────────────────────────────────────────────────────────

def build_venue_index(venues_list: list) -> dict:
    """Return dict keyed by venue id."""
    return {v["id"]: v for v in venues_list}


def fuzzy_match_venue(event: dict, venues: dict) -> dict | None:
    name = (event.get("venue") or "").lower().strip()
    if not name:
        return None
    best_ratio = 0.0
    best_venue = None
    for v in venues.values():
        candidates = [v.get("name", ""), v.get("canonical_name", "")] + v.get("aliases", [])
        for cand in candidates:
            ratio = difflib.SequenceMatcher(None, name, cand.lower()).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_venue = v
    if best_ratio >= FUZZY_THRESHOLD:
        return best_venue
    return None


def resolve_venue(event: dict, venues: dict) -> tuple[dict | None, str]:
    """Return (venue_dict_or_None, match_type)."""
    vid = event.get("venue_id", "")
    if vid and vid in venues:
        return venues[vid], "exact"
    fuzzy = fuzzy_match_venue(event, venues)
    if fuzzy:
        return fuzzy, "fuzzy"
    return None, "address_only"


# ── GMaps API ─────────────────────────────────────────────────────────────────

def _get_with_backoff(url: str, params: dict) -> dict | None:
    """GET with exponential backoff on 429."""
    for wait in (0, 2, 4, 8):
        if wait:
            time.sleep(wait)
        try:
            resp = requests.get(url, params=params, timeout=10)
        except requests.RequestException as exc:
            print(f"  !! Network error: {exc}")
            return None
        if resp.status_code == 429:
            continue
        if resp.status_code != 200:
            print(f"  !! HTTP {resp.status_code} from GMaps")
            return None
        return resp.json()
    print("  !! GMaps rate limit — giving up after backoff")
    return None


def gmaps_place_search(name: str, address: str, rough_lat=None, rough_lng=None) -> dict | None:
    """Places Text Search. Returns {'lat', 'lng', 'place_id', 'formatted_address'} or None."""
    params = {
        "query": f"{name} {address}",
        "fields": "place_id,geometry/location,formatted_address",
        "key": GMAPS_KEY,
    }
    if rough_lat is not None and rough_lng is not None:
        params["locationbias"] = f"circle:500@{rough_lat},{rough_lng}"

    time.sleep(0.02)
    data = _get_with_backoff(PLACES_URL, params)
    if not data or data.get("status") not in ("OK", "ZERO_RESULTS"):
        return None
    results = data.get("results", [])
    if not results:
        return None
    r = results[0]
    loc = r.get("geometry", {}).get("location", {})
    return {
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "place_id": r.get("place_id", ""),
        "formatted_address": r.get("formatted_address", ""),
        "coord_source": "gmaps_place_search",
        "coord_confidence": "ROOFTOP",
    }


def gmaps_geocode(address: str) -> dict | None:
    """Geocoding API. Returns result dict or None."""
    params = {"address": address, "key": GMAPS_KEY}
    time.sleep(0.02)
    data = _get_with_backoff(GEOCODE_URL, params)
    if not data or data.get("status") not in ("OK", "ZERO_RESULTS"):
        return None
    results = data.get("results", [])
    if not results:
        return None
    r = results[0]
    loc_type = r.get("geometry", {}).get("location_type", "APPROXIMATE")
    if loc_type == "APPROXIMATE":
        return {"needs_review": True, "coord_confidence": loc_type}
    loc = r.get("geometry", {}).get("location", {})
    return {
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "place_id": r.get("place_id", ""),
        "formatted_address": r.get("formatted_address", ""),
        "coord_source": "gmaps_geocode",
        "coord_confidence": loc_type,
    }


# ── Core logic ────────────────────────────────────────────────────────────────

def lookup_venue_coords(
    venue: dict | None,
    event: dict,
    venue_lookup_cache: dict,
    match_type: str,
) -> dict | None:
    """
    Return a result dict or None.
    Checks venue_lookup_cache first; populates it on miss.
    """
    # Determine cache key
    if venue:
        cache_key = venue["id"]
    else:
        cache_key = (event.get("address") or "").strip()

    if cache_key in venue_lookup_cache:
        return venue_lookup_cache[cache_key]

    result = None

    if venue and venue.get("website"):
        rough_lat = venue.get("lat")
        rough_lng = venue.get("lng")
        result = gmaps_place_search(
            venue.get("canonical_name") or venue.get("name", ""),
            venue.get("address", ""),
            rough_lat, rough_lng,
        )
    else:
        addr = (venue.get("address") if venue else None) or event.get("address", "")
        if addr:
            result = gmaps_geocode(addr)

    venue_lookup_cache[cache_key] = result
    return result


def analyse(events: list, venues: dict, missing_only: bool, venue_id_filter: str | None):
    """
    Walk events, categorise them, build venue_lookup_cache plan (no API calls).
    Returns (to_enrich, skipped, match_counts, unique_keys_with_strategy).
    """
    to_enrich   = []
    skipped     = []
    match_exact = 0
    match_fuzzy = 0
    match_addr  = 0
    unique_keys: dict[str, dict] = {}   # cache_key -> {venue, event, strategy}

    for ev in events:
        if venue_id_filter and ev.get("venue_id") != venue_id_filter:
            continue
        if not needs_enrichment(ev, missing_only):
            skipped.append(ev)
            continue

        venue, match_type = resolve_venue(ev, venues)

        if match_type == "exact":
            match_exact += 1
        elif match_type == "fuzzy":
            match_fuzzy += 1
        else:
            match_addr += 1

        cache_key = venue["id"] if venue else (ev.get("address") or "").strip()
        strategy  = "gmaps_place_search" if (venue and venue.get("website")) else "gmaps_geocode"

        if cache_key not in unique_keys:
            unique_keys[cache_key] = {
                "venue": venue,
                "event": ev,
                "strategy": strategy,
                "match_type": match_type,
            }

        to_enrich.append({
            "event": ev,
            "venue": venue,
            "cache_key": cache_key,
            "strategy": strategy,
            "match_type": match_type,
        })

    return to_enrich, skipped, (match_exact, match_fuzzy, match_addr), unique_keys


def print_dry_run(events_all: list, to_enrich: list, skipped: list,
                  match_counts: tuple, unique_keys: dict):
    me, mf, ma = match_counts
    print("\n=== DRY RUN REPORT ===")
    print(f"Total events in master:        {len(events_all)}")
    print(f"Events already precise (skip): {len(skipped)}")
    print(f"Events to enrich:              {len(to_enrich)}")
    print(f"  - matched to venue (exact):  {me}")
    print(f"  - matched to venue (fuzzy):  {mf}")
    print(f"  - address-only fallback:     {ma}")
    print(f"Unique venues to look up:      {len(unique_keys)}  (this many API calls)")
    print(f"Estimated GMaps API calls:     {len(unique_keys)}")
    print()

    # Print up to 5 samples
    shown = 0
    seen_keys: set[str] = set()
    print("Sample of what WOULD change:")
    for item in to_enrich:
        ck = item["cache_key"]
        if ck in seen_keys:
            continue
        seen_keys.add(ck)
        ev = item["event"]
        venue = item["venue"]
        lat = ev.get("lat")
        lng = ev.get("lng")
        dp  = min(decimal_places(lat), decimal_places(lng)) if lat is not None else 0
        vid = ev.get("venue_id") or "—"
        ws  = venue.get("website", "") if venue else ""
        print(f'  Event "{ev.get("title","?")[:60]}" (id: {ev.get("id","")})')
        print(f'    venue_id: {vid}  -> strategy: {item["strategy"]}')
        if ws:
            print(f'    website: {ws}')
        print(f'    current lat/lng: {lat}, {lng}  ({dp}dp — imprecise)')
        print(f'    -> would become: 7dp precision')
        print()
        shown += 1
        if shown >= 5:
            break

    print("Run with --write to apply changes.")


def enrich_and_write(events_all: list, to_enrich: list, venues: dict,
                     cache: dict, dry_run: bool, venue_id_filter: str | None):
    """
    Perform API calls, apply write-back, return report dict.
    """
    venue_lookup_cache: dict[str, dict | None] = {}

    # Pre-populate from venue_cache.json for any already-cached entries
    for ck, entry in cache.items():
        src = entry.get("source", "")
        if src in ("gmaps_place_search", "gmaps_geocode"):
            venue_lookup_cache[ck] = {
                "lat": entry.get("lat"),
                "lng": entry.get("lng"),
                "place_id": "",
                "formatted_address": entry.get("address", ""),
                "coord_source": src,
                "coord_confidence": entry.get("coord_confidence", ""),
            }

    stats = {
        "total_events": len(events_all),
        "skipped_precise": 0,
        "updated": 0,
        "via_place_search": 0,
        "via_geocode": 0,
        "needs_review": 0,
        "cache_hits": 0,
        "venue_cache_new": 0,
        "changes": [],
    }

    # Count skipped
    for ev in events_all:
        if venue_id_filter and ev.get("venue_id") != venue_id_filter:
            continue
        if not needs_enrichment(ev, False):
            stats["skipped_precise"] += 1

    total = len(to_enrich)
    chunks = max(1, (total + CHUNK_SIZE - 1) // CHUNK_SIZE)

    for i, item in enumerate(to_enrich):
        ev         = item["event"]
        venue      = item["venue"]
        cache_key  = item["cache_key"]
        strategy   = item["strategy"]

        if i > 0 and i % CHUNK_SIZE == 0:
            chunk_num = i // CHUNK_SIZE
            print(f"[chunk {chunk_num}/{chunks}] processed {i}/{total} events")

        # Check in-run cache first
        if cache_key in venue_lookup_cache:
            result = venue_lookup_cache[cache_key]
            stats["cache_hits"] += 1
        else:
            result = lookup_venue_coords(venue, ev, venue_lookup_cache, item["match_type"])

        old_lat = ev.get("lat")
        old_lng = ev.get("lng")

        if not result:
            ev["coord_source"]     = "needs_review"
            ev["coord_confidence"] = ""
            stats["needs_review"] += 1
            continue

        if result.get("needs_review"):
            ev["coord_source"]     = "needs_review"
            ev["coord_confidence"] = result.get("coord_confidence", "APPROXIMATE")
            stats["needs_review"] += 1
            continue

        new_lat = result.get("lat")
        new_lng = result.get("lng")
        if new_lat is None or new_lng is None:
            ev["coord_source"] = "needs_review"
            stats["needs_review"] += 1
            continue

        new_lat = round(new_lat, 7)
        new_lng = round(new_lng, 7)
        src     = result.get("coord_source", "")
        conf    = result.get("coord_confidence", "")

        ev["lat_precise"]      = new_lat
        ev["lng_precise"]      = new_lng
        ev["lat"]              = new_lat
        ev["lng"]              = new_lng
        ev["gmaps_place_id"]   = result.get("place_id", "")
        ev["coord_source"]     = src
        ev["coord_confidence"] = conf

        if ev.get("status") in ("geo_review", "geofail"):
            ev["status"] = "pending"

        stats["updated"] += 1
        if src == "gmaps_place_search":
            stats["via_place_search"] += 1
        elif src == "gmaps_geocode":
            stats["via_geocode"] += 1

        stats["changes"].append({
            "id":       ev.get("id"),
            "title":    ev.get("title"),
            "venue_id": ev.get("venue_id"),
            "old_lat":  old_lat, "old_lng": old_lng,
            "new_lat":  new_lat, "new_lng": new_lng,
            "source":   src,
            "confidence": conf,
        })

        # Update venue_cache.json entry
        vname = (venue.get("canonical_name") or venue.get("name")) if venue else ev.get("venue", "")
        if vname and vname not in cache:
            cache[vname] = {
                "address":           result.get("formatted_address", ev.get("address", "")),
                "lat":               new_lat,
                "lng":               new_lng,
                "source":            src,
                "coord_confidence":  conf,
            }
            stats["venue_cache_new"] += 1

    if i % CHUNK_SIZE != 0 or total == 0:
        print(f"[chunk {chunks}/{chunks}] processed {total}/{total} events")

    return stats


def patch_output_file(path: str, updated_map: dict[str, dict]):
    """Patch events in a JSON list file using updated_map keyed by event id."""
    if not os.path.exists(path):
        return
    events = load_json(path)
    changed = 0
    for ev in events:
        eid = ev.get("id")
        if eid in updated_map:
            ev.update(updated_map[eid])
            changed += 1
    write_json(path, events)
    print(f"  Patched {changed} events in {os.path.basename(path)}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Enrich event coordinates via Google Maps")
    parser.add_argument("--write",        action="store_true", help="Apply changes (default: dry run)")
    parser.add_argument("--missing-only", action="store_true", help="Only enrich events with no lat/lng")
    parser.add_argument("--venue-id",     default="",          help="Restrict to a single venue_id")
    args = parser.parse_args()

    if args.write and not GMAPS_KEY:
        raise ValueError("Set GOOGLE_MAPS_API_KEY environment variable first")

    if not args.write and not GMAPS_KEY:
        print("(No GOOGLE_MAPS_API_KEY set — analysis only, no API calls will be made)\n")

    # Load data
    events_all: list = load_json(MASTER)
    venues_list = load_json(VENUES_CFG)
    venues = build_venue_index(venues_list.get("venues", venues_list) if isinstance(venues_list, dict) else venues_list)
    cache: dict = load_json(CACHE_PATH)
    if isinstance(cache, list):
        cache = {}

    venue_id_filter = args.venue_id.strip() or None

    # Analyse (no API calls)
    to_enrich, skipped, match_counts, unique_keys = analyse(
        events_all, venues, args.missing_only, venue_id_filter
    )

    print_dry_run(events_all, to_enrich, skipped, match_counts, unique_keys)

    if not args.write:
        # Ask for confirmation if interactive
        if sys.stdin.isatty():
            try:
                ans = input("\nProceed with --write? [y/N] ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                print("\nAborted.")
                return
            if ans != "y":
                print("Aborted.")
                return
        else:
            return

    print("\n=== ENRICHING... ===")
    stats = enrich_and_write(events_all, to_enrich, venues, cache, dry_run=False,
                              venue_id_filter=venue_id_filter)

    # Build id->event map for patching sibling files
    updated_ids = {c["id"] for c in stats["changes"]}
    updated_map = {ev["id"]: ev for ev in events_all if ev.get("id") in updated_ids}

    # Write back
    print("\nWriting files...")
    write_json(MASTER, events_all)
    print(f"  Updated {MASTER}")

    write_json(CACHE_PATH, cache)
    print(f"  Updated {CACHE_PATH}")

    patch_output_file(GEOFAIL, updated_map)
    patch_output_file(REVIEW,  updated_map)

    write_json(REPORT, stats)
    print(f"  Report -> {REPORT}")

    # Summary
    print("\n=== ENRICHMENT COMPLETE ===")
    print(f"Events updated:                   {stats['updated']}")
    print(f"  - via place_search:             {stats['via_place_search']}")
    print(f"  - via geocode:                  {stats['via_geocode']}")
    print(f"Events skipped (already precise): {stats['skipped_precise']}")
    print(f"Events flagged needs_review:      {stats['needs_review']}")
    print(f"venue_cache.json new entries:     {stats['venue_cache_new']}")


if __name__ == "__main__":
    main()
