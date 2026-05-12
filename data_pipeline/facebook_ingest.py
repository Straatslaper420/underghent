"""
facebook_ingest.py
Strict ingestion. Events with uncertain coordinates are NOT auto-placed on the map.
They go to geo_review status so a human can verify via geo_review_tool.py.
"""

import json
import os
import re
from typing import List

from models import Event
from normalize import (
    resolve_location,
    looks_like_address,
    make_normalized_hash,
    timestamp_to_iso,
)
from classify import classify_event


def ingest_folder(folder_path: str, existing_ids: set = None) -> List[Event]:
    if existing_ids is None:
        existing_ids = set()

    files = sorted(f for f in os.listdir(folder_path) if f.endswith(".json"))
    events = []
    stats = {"geocoded": 0, "alias": 0, "needs_review": 0, "unresolved": 0}

    for filename in files:
        print(f"  [facebook] Processing {filename}")
        try:
            with open(os.path.join(folder_path, filename), encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"    !! Read error: {e}")
            continue

        raw_events = _extract_events(data)
        print(f"    Found {len(raw_events)} raw events")

        for raw in raw_events:
            ev = _parse(raw, stats)
            if not ev:
                continue
            if ev.raw_id in existing_ids:
                continue
            existing_ids.add(ev.raw_id)
            events.append(ev)

    total = len(events)
    exact = stats["alias"] + stats["geocoded"]
    print(f"  [facebook] Total new events: {total}")
    print(f"  [facebook] Geo: exact={exact}  geo_review={stats['needs_review']}  unresolved={stats['unresolved']}  (sum={exact+stats['needs_review']+stats['unresolved']})")
    return events


def collect_social_updates(folder_path: str) -> dict:
    """
    Scan all JSON files and collect the latest interested/going counts
    for every event ID found, including ones already in the sheet.
    Returns dict: {raw_id: {interested: str, going: str}}
    """
    files = sorted(f for f in os.listdir(folder_path) if f.endswith(".json"))
    updates = {}

    for filename in files:
        try:
            with open(os.path.join(folder_path, filename), encoding="utf-8") as f:
                data = json.load(f)
        except:
            continue

        for raw in _extract_events(data):
            if not isinstance(raw, dict):
                continue

            raw_id = None
            for field in ["id", "eventUrl", "url"]:
                if field in raw:
                    raw_id = _fb_id(raw[field])
                    break
            if not raw_id:
                continue

            social     = raw.get("social_context") or {}
            social_txt = social.get("text", "") if isinstance(social, dict) else ""
            interested, going = "", ""
            m  = re.search(r"([\d\s,. ]+)\s+geïnteresseerd", social_txt)
            m2 = re.search(r"(\d+)\s+gaan", social_txt)
            if m:  interested = re.sub(r"[\s,. ]", "", m.group(1))
            if m2: going      = m2.group(1)

            # Keep the entry with the highest interested count
            if raw_id in updates:
                try:
                    existing = int(updates[raw_id]["interested"] or 0)
                    new_val  = int(interested or 0)
                    if new_val <= existing:
                        continue
                except:
                    pass

            updates[raw_id] = {"interested": interested, "going": going}

    print(f"  [facebook] Collected social counts for {len(updates)} events")
    return updates


def _parse(raw: dict, stats: dict) -> Event:
    if not isinstance(raw, dict):
        return None

    # ── ID ────────────────────────────────────────────────────
    raw_id = None
    for field in ["id", "eventUrl", "url"]:
        if field in raw:
            raw_id = _fb_id(raw[field])
            break
    if not raw_id:
        return None

    # ── Basic fields ──────────────────────────────────────────
    title     = raw.get("name", "") or ""
    start_iso = timestamp_to_iso(raw.get("start_timestamp") or raw.get("start_time"))
    end_iso   = timestamp_to_iso(raw.get("end_timestamp")   or raw.get("end_time"))

    # ── Venue + address from Facebook place ───────────────────
    place = raw.get("event_place") or raw.get("place") or {}

    # contextual_name is what Facebook shows — can be a venue name OR a street address
    venue_raw = (
        place.get("contextual_name") or
        place.get("name") or
        raw.get("venue", "") or
        ""
    ).strip()

    # address field (usually inside place.address)
    raw_address = ""
    if isinstance(place.get("address"), dict):
        raw_address = place["address"].get("street_address", "") or ""
    elif isinstance(place.get("address"), str):
        raw_address = place["address"]
    raw_address = raw_address.strip()

    # ── Geo resolution ────────────────────────────────────────
    geo = resolve_location(venue_raw, raw_address)

    # Determine what goes in the venue vs address columns
    if looks_like_address(venue_raw) and not raw_address:
        # contextual_name is the address — use it as address, no venue name
        display_venue   = ""
        display_address = geo.address or venue_raw
    else:
        display_venue   = geo.canonical_name or venue_raw
        display_address = geo.address or raw_address

    # ── Track stats ───────────────────────────────────────────
    src = geo.coordinate_source
    if "alias" in src or "runtime_db" in src:
        stats["alias"] += 1
    elif "geocode" in src and not geo.needs_review:
        stats["geocoded"] += 1
    elif geo.needs_review:
        stats["needs_review"] += 1
    else:
        stats["unresolved"] += 1

    # ── Social stats ──────────────────────────────────────────
    social     = raw.get("social_context") or {}
    social_txt = social.get("text", "") if isinstance(social, dict) else ""
    interested, going = "", ""
    m  = re.search(r"([\d\s,.\u00a0]+)\s+ge\u00efnteresseerd", social_txt)
    m2 = re.search(r"(\d+)\s+gaan", social_txt)
    if m:  interested = re.sub(r"[\s,.\u00a0]", "", m.group(1))
    if m2: going      = m2.group(1)

    # ── Extra fields from JSON ───────────────────────────────
    # price from ticketing_context_row
    ticketing = raw.get("ticketing_context_row") or {}
    price = (ticketing.get("price_range_text") or "").strip()

    # description hint from cover photo accessibility_caption
    cover = raw.get("cover_photo") or {}
    photo = cover.get("photo") or {}
    caption = photo.get("accessibility_caption") or ""
    # caption often has OCR'd poster text — useful as a description hint
    # clean it up: remove "Kan een ... zijn van" prefix Facebook adds
    caption = re.sub(r"^Kan een .{0,60} zijn van\s*", "", caption, flags=re.I).strip()
    caption = re.sub(r"[‎‏‪-‮]", "", caption).strip()
    description_hint = caption[:400] if caption else ""

    # day_time_sentence gives human-readable date ("za, 23 mei om 20:00")
    day_sentence = raw.get("day_time_sentence") or ""

    source_url = raw.get("eventUrl") or raw.get("url") or ""
    if source_url and not source_url.startswith("http"):
        source_url = f"https://www.facebook.com/events/{source_url}/"

    # ── Build Event ───────────────────────────────────────────
    ev = Event(
        id          = f"fb:{raw_id}",
        raw_id      = raw_id,
        title       = title,
        start_datetime = start_iso,
        end_datetime   = end_iso,
        venue       = display_venue,
        venue_id    = geo.venue_id or "",
        address     = display_address,
        city        = "Gent",
        lat         = geo.lat if not geo.needs_review else None,
        lng         = geo.lng if not geo.needs_review else None,
        price       = price,
        source_type = "facebook",
        source_name = "Facebook",
        source_url  = source_url,
        interested  = interested,
        going       = going,
        description = description_hint,
        geo_guess_address = f"coord_source:{src} | guess_lat:{geo.lat or ''} | guess_lng:{geo.lng or ''} | guess_addr:{geo.address or ''}",
    )

    ev.normalized_hash = make_normalized_hash(title, start_iso, ev.venue)

    # ── Classify ──────────────────────────────────────────────
    cls = classify_event(ev)
    ev.layer            = cls["layer"]
    ev.confidence_score = cls["confidence_score"]

    # Status logic:
    # - needs_review AND has a guess → "geo_review" (show in review tool, not on map)
    # - unresolved with no guess   → sent to GeoFail sheet
    # - clean geo                  → use classifier status
    if geo.needs_review:
        ev.status = "geo_review"
    else:
        ev.status = cls["status"]

    return ev


def _fb_id(value) -> str:
    if not value: return None
    m = re.search(r'events/(\d+)', str(value))
    return m.group(1) if m else str(value)


def _extract_events(data) -> list:
    try:
        edges = data["data"]["viewer"]["suggested_events"]["events"]["edges"]
        return [e["node"] for e in edges if "node" in e]
    except (KeyError, TypeError): pass
    try:
        edges = data["data"]["events"]["edges"]
        return [e["node"] for e in edges if "node" in e]
    except (KeyError, TypeError): pass
    if "events" in data and isinstance(data["events"], list): return data["events"]
    if "search_results" in data and isinstance(data["search_results"], list): return data["search_results"]
    if "data" in data:
        if isinstance(data["data"], list): return data["data"]
        if isinstance(data["data"], dict):
            n = _extract_events(data["data"])
            if n: return n
    if "edges" in data and isinstance(data["edges"], list):
        return [e["node"] for e in data["edges"] if "node" in e]
    if isinstance(data, list): return data
    if isinstance(data, dict) and "id" in data: return [data]
    return []
