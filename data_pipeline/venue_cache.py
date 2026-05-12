"""
venue_cache.py
Persistent local cache of venue coordinates.
Saved to config/venue_cache.json — commit this file to git.

This means:
  - Venue coords survive sheet wipes
  - Pipeline doesn't need sheet data to resolve known venues
  - New coords (from geocoding or manual review) are saved back here
  - Acts as a growing knowledge base across all runs

Format:
  {
    "Charlatan": {
      "lat": 51.0544, "lng": 3.7186,
      "address": "Vlasmarkt 6, 9000 Gent",
      "source": "venues_json",   // how we know this
      "aliases": ["charlatan", "de charlatan"]
    },
    ...
  }
"""

import json
import os

_HERE       = os.path.dirname(os.path.abspath(__file__))
_CACHE_FILE = os.path.join(_HERE, "..", "config", "venue_cache.json")


def load() -> dict:
    """Load the cache. Returns {} if file doesn't exist yet."""
    if not os.path.exists(_CACHE_FILE):
        return {}
    try:
        with open(_CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  [venue_cache] Could not load cache: {e}")
        return {}


def save(cache: dict):
    """Write cache to disk."""
    os.makedirs(os.path.dirname(_CACHE_FILE), exist_ok=True)
    with open(_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2, sort_keys=True)


def update_from_sheet_rows(rows: list) -> int:
    """
    Merge new venue coords from sheet rows into the cache.
    Only adds entries — never overwrites existing ones with lower-quality data.
    Returns number of new entries added.
    """
    cache = load()
    added = 0

    for row in rows:
        if len(row) < 12:
            continue
        venue = (row[6] or "").strip()
        addr  = (row[8] or "").strip() if len(row) > 8 else ""
        try:
            lat = float(str(row[10]).replace(",", "."))
            lng = float(str(row[11]).replace(",", "."))
        except (ValueError, TypeError):
            continue

        if not venue or not lat or not lng:
            continue

        if venue not in cache:
            cache[venue] = {
                "lat":     lat,
                "lng":     lng,
                "address": addr,
                "source":  "sheet_row",
            }
            added += 1
        else:
            # Update address if we have a better one
            if addr and not cache[venue].get("address"):
                cache[venue]["address"] = addr

    if added:
        save(cache)

    return added


def update_from_geocode(venue_name: str, lat: float, lng: float,
                         address: str, source: str = "geocoded") -> None:
    """Save a single newly-geocoded venue to the cache."""
    cache = load()
    if venue_name and venue_name not in cache:
        cache[venue_name] = {
            "lat":     lat,
            "lng":     lng,
            "address": address,
            "source":  source,
        }
        save(cache)


def update_from_review(venue_name: str, lat: float, lng: float,
                        address: str) -> None:
    """Save a human-verified location (from geo_review_tool) to the cache."""
    cache = load()
    # Human-verified always wins — overwrite
    cache[venue_name] = {
        "lat":     lat,
        "lng":     lng,
        "address": address,
        "source":  "human_verified",
    }
    save(cache)
    print(f"  [venue_cache] Saved human-verified: {venue_name} → {lat}, {lng}")


def get(venue_name: str) -> dict:
    """Look up a single venue. Returns {} if not found."""
    return load().get(venue_name, {})


def stats() -> str:
    cache = load()
    by_source = {}
    for v in cache.values():
        s = v.get("source", "unknown")
        by_source[s] = by_source.get(s, 0) + 1
    parts = [f"{s}:{n}" for s, n in sorted(by_source.items())]
    return f"{len(cache)} venues ({', '.join(parts)})"
