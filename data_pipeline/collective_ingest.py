"""
collective_ingest.py
Scrapes public event pages from collective/DIY websites.
Same register_parser pattern as venue_ingest.py.

Currently: framework only. Add parsers as collectives get public web pages.
"""

import json
import os
import re
import time
import requests
from typing import List, Callable
from bs4 import BeautifulSoup

from models import Event
from normalize import make_normalized_hash, resolve_location
from classify import classify_event

_HERE = os.path.dirname(os.path.abspath(__file__))
_CONFIG = os.path.join(_HERE, "..", "config")

with open(os.path.join(_CONFIG, "collectives.json"), encoding="utf-8") as f:
    _ALL_COLLECTIVES = {c["id"]: c for c in json.load(f)["collectives"]}

_PARSERS: dict = {}


def register_parser(collective_id: str):
    def decorator(fn: Callable):
        _PARSERS[collective_id] = fn
        return fn
    return decorator


def ingest_all_collectives(existing_ids: set = None) -> List[Event]:
    if existing_ids is None:
        existing_ids = set()

    all_events = []

    for cid, parser_fn in _PARSERS.items():
        coll_cfg = _ALL_COLLECTIVES.get(cid, {})
        scrape_url = coll_cfg.get("scrape_url")
        if not scrape_url:
            print(f"  [collective_ingest] Skipping {cid} — no scrape_url")
            continue

        print(f"  [collective_ingest] Scraping {coll_cfg.get('name', cid)}")
        try:
            html = _fetch(scrape_url)
            events = parser_fn(html, coll_cfg)
            new = [e for e in events if e.raw_id not in existing_ids]
            for e in new:
                existing_ids.add(e.raw_id)
            all_events.extend(new)
            print(f"    Found {len(events)} events, {len(new)} new")
        except Exception as ex:
            print(f"    !! Error scraping {cid}: {ex}")
        time.sleep(1)

    return all_events


def _fetch(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; UnderGhentBot/2.0)"}
    resp = requests.get(url, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.text


def _make_collective_event(
    coll_cfg: dict,
    title: str,
    start_iso: str,
    end_iso: str = "",
    venue_name: str = "",
    address: str = "",
    description: str = "",
    source_url: str = "",
    genre: str = "",
) -> Event:
    # Try to geocode the venue
    lat, lng = None, None
    if venue_name or address:
        geo = resolve_location(venue_name, address)
        lat, lng = geo.lat, geo.lng
        venue_name = geo.canonical_name or venue_name

    cid = coll_cfg["id"]
    raw_id = f"coll_{cid}_{make_normalized_hash(title, start_iso, venue_name)}"

    tags = coll_cfg.get("tags", [])
    auto_genre = genre or (tags[0] if tags else "")

    ev = Event(
        id=f"collective:{raw_id}",
        raw_id=raw_id,
        title=title,
        description=description,
        start_datetime=start_iso,
        end_datetime=end_iso,
        venue=venue_name,
        address=address,
        city="Gent",
        lat=lat,
        lng=lng,
        genre=auto_genre,
        source_type="collective_site",
        source_name=cid,
        source_url=source_url or coll_cfg.get("scrape_url", ""),
    )
    ev.normalized_hash = make_normalized_hash(title, start_iso, ev.venue)
    cls = classify_event(ev)
    ev.layer = cls["layer"]
    ev.confidence_score = cls["confidence_score"]
    ev.status = cls["status"]
    return ev


# ── Future parsers ────────────────────────────────────────────
# @register_parser("vantara_vichitra")
# def parse_vantara(html, coll_cfg): ...