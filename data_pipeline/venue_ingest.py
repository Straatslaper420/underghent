"""
venue_ingest.py
Scrapes public event listings from Ghent venue websites.

Structure discovered by inspection:
  Charlatan: list items with link containing /agenda/, text includes date + title
  Viernulvier: JavaScript-rendered — use their JSON API endpoint instead
  Kompass: JavaScript-rendered — use their JSON API endpoint instead

Add a parser with @register_parser("venue_id").
"""

import json
import os
import re
import time
import requests
from datetime import datetime
from typing import List, Callable
from bs4 import BeautifulSoup

from models import Event
from normalize import make_normalized_hash, VENUE_COORDS
from classify import classify_event

_HERE   = os.path.dirname(os.path.abspath(__file__))
_CONFIG = os.path.join(_HERE, "..", "config")

with open(os.path.join(_CONFIG, "venues.json"), encoding="utf-8") as f:
    _ALL_VENUES = {v["id"]: v for v in json.load(f)["venues"]}

_PARSERS: dict = {}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8",
}


def register_parser(venue_id: str):
    def decorator(fn: Callable):
        _PARSERS[venue_id] = fn
        return fn
    return decorator


def ingest_all_venues(existing_ids: set = None) -> List[Event]:
    if existing_ids is None:
        existing_ids = set()
    all_events = []
    for vid, parser_fn in _PARSERS.items():
        venue_cfg = _ALL_VENUES.get(vid, {})
        scrape_url = venue_cfg.get("scrape_url")
        if not scrape_url:
            print(f"  [venue_ingest] Skipping {vid} — no scrape_url")
            continue
        print(f"  [venue_ingest] Scraping {venue_cfg.get('name', vid)} → {scrape_url}")
        try:
            events = parser_fn(scrape_url, venue_cfg)
            new = [e for e in events if e.raw_id not in existing_ids]
            for e in new:
                existing_ids.add(e.raw_id)
            all_events.extend(new)
            print(f"    Found {len(events)} events, {len(new)} new")
        except Exception as ex:
            print(f"    !! Error scraping {vid}: {ex}")
        time.sleep(1.5)
    return all_events


# ── Shared helpers ────────────────────────────────────────────

def _fetch(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=12)
    resp.raise_for_status()
    return resp.text


def _fetch_json(url: str) -> dict:
    resp = requests.get(url, headers=HEADERS, timeout=12)
    resp.raise_for_status()
    return resp.json()


def _make_event(venue_cfg: dict, title: str, start_iso: str,
                end_iso: str = "", description: str = "",
                source_url: str = "", genre: str = "",
                price: str = "", tickets_url: str = "") -> Event:
    vid    = venue_cfg["id"]
    coords = VENUE_COORDS.get(vid, {})
    raw_id = f"venue_{vid}_{make_normalized_hash(title, start_iso, venue_cfg.get('name',''))}"
    ev = Event(
        id=f"venue:{raw_id}", raw_id=raw_id,
        title=title, description=description,
        start_datetime=start_iso, end_datetime=end_iso,
        venue=venue_cfg.get("name", ""), venue_id=vid,
        address=venue_cfg.get("address", ""), city="Gent",
        lat=coords.get("lat"), lng=coords.get("lng"),
        genre=genre, price=price,
        source_type="venue_site", source_name=vid,
        source_url=source_url or venue_cfg.get("scrape_url", ""),
        tickets_url=tickets_url,
    )
    ev.normalized_hash = make_normalized_hash(title, start_iso, ev.venue)
    cls = classify_event(ev)
    ev.layer           = cls["layer"]
    ev.confidence_score = cls["confidence_score"]
    ev.status          = cls["status"]
    return ev


NL_MONTHS = {
    "jan":1,"feb":2,"mrt":3,"apr":4,"mei":5,"jun":6,
    "jul":7,"aug":8,"sep":9,"okt":10,"nov":11,"dec":12,
    "januari":1,"februari":2,"maart":3,"april":4,"juni":6,
    "juli":7,"augustus":8,"september":9,"oktober":10,
    "november":11,"december":12,
}

def _parse_nl_date(s: str, year: int = None) -> str:
    """Parse Dutch date strings like 'di 12 mei', '12 mei 2026', '12/05/2026'."""
    if not s: return ""
    s = s.strip().lower()
    yr = year or datetime.now().year

    # DD/MM/YYYY or DD.MM.YYYY
    m = re.search(r'(\d{1,2})[./](\d{1,2})[./](\d{4})', s)
    if m: return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"

    # DD month YYYY or DD month (with optional weekday prefix)
    m = re.search(r'(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?', s)
    if m:
        day  = int(m.group(1))
        mon  = NL_MONTHS.get(m.group(2)[:3])
        yr2  = int(m.group(3)) if m.group(3) else yr
        if mon: return f"{yr2}-{mon:02d}-{day:02d}"

    return ""


def _parse_time(s: str) -> str:
    """Extract HH:MM from a string."""
    m = re.search(r'(\d{1,2}):(\d{2})', s or "")
    if m: return f"{int(m.group(1)):02d}:{m.group(2)}"
    return "20:00"


# ══════════════════════════════════════════════════════════════
# CHARLATAN
# Structure: li elements, each containing an <a href="/agenda/...">
# Text block: "Title [tags] day DD mon HH:MM - HH:MM [description] Venue Room"
# ══════════════════════════════════════════════════════════════

@register_parser("charlatan")
def parse_charlatan(url: str, venue_cfg: dict) -> List[Event]:
    html = _fetch(url)
    soup = BeautifulSoup(html, "html.parser")
    events = []

    # Each event is a list item containing a link to /agenda/<slug>
    for li in soup.select("li"):
        a = li.find("a", href=re.compile(r'/agenda/[^/]+$'))
        if not a:
            continue
        href = a.get("href", "")
        if not href.startswith("http"):
            href = "https://www.charlatan.be" + href

        # Get all text from the link
        full_text = a.get_text(" ", strip=True)
        if len(full_text) < 5:
            continue

        # Extract date: pattern "dag DD maand" e.g. "di 12 mei" or "za 16 mei"
        date_str = ""
        time_str = "22:00"
        date_m = re.search(
            r'(?:ma|di|wo|do|vr|za|zo)\s+(\d{1,2}\s+[a-z]+(?:\s+\d{4})?)',
            full_text.lower()
        )
        if date_m:
            date_str = _parse_nl_date(date_m.group(1))
        time_m = re.search(r'(\d{1,2}:\d{2})', full_text)
        if time_m:
            time_str = time_m.group(1)

        if not date_str:
            continue

        # Title: first meaningful line of text (before genre tags and date)
        # Split on newlines or the date pattern
        lines = [l.strip() for l in full_text.split("\n") if l.strip()]
        title = lines[0] if lines else full_text[:80]
        # Remove the venue suffix "Charlatan, Gent..."
        title = re.sub(r'\s*Charlatan.*$', '', title, flags=re.IGNORECASE).strip()
        if not title or len(title) < 3:
            continue

        # Genre: text in tags like "Nightlife", "Concerten"
        genre_m = re.search(r'(Nightlife|Concerten|Comedy)', full_text, re.I)
        genre = genre_m.group(1) if genre_m else ""

        # Tickets URL: look for stager.co link
        tickets_a = li.find("a", href=re.compile(r'stager|tickets|ticketmaster', re.I))
        tickets_url = tickets_a.get("href", "") if tickets_a else ""

        start_iso = f"{date_str}T{time_str}:00"

        ev = _make_event(
            venue_cfg=venue_cfg,
            title=title,
            start_iso=start_iso,
            source_url=href,
            genre=genre,
            tickets_url=tickets_url,
        )
        events.append(ev)

    return events


# ══════════════════════════════════════════════════════════════
# VIERNULVIER — they have a JSON API
# ══════════════════════════════════════════════════════════════

@register_parser("viernulvier")
def parse_viernulvier(url: str, venue_cfg: dict) -> List[Event]:
    # Try their public JSON feed first
    json_url = "https://www.viernulvier.gent/api/agenda"
    events = []

    try:
        data = _fetch_json(json_url)
        items = data if isinstance(data, list) else data.get("items", data.get("events", []))
        for item in items:
            title    = item.get("title") or item.get("name") or ""
            date_raw = item.get("date") or item.get("startDate") or item.get("start") or ""
            slug     = item.get("url") or item.get("slug") or item.get("link") or ""
            genre    = item.get("genre") or item.get("category") or ""
            tickets  = item.get("ticketsUrl") or item.get("tickets") or ""

            if not title or not date_raw:
                continue

            # Normalise date
            if "T" in str(date_raw):
                start_iso = str(date_raw)[:19]
            else:
                d = _parse_nl_date(str(date_raw))
                start_iso = f"{d}T20:00:00" if d else ""

            if not start_iso:
                continue

            src_url = slug if slug.startswith("http") else \
                      ("https://www.viernulvier.gent" + slug if slug.startswith("/") else url)

            ev = _make_event(venue_cfg, title, start_iso,
                             source_url=src_url, genre=str(genre), tickets_url=str(tickets))
            events.append(ev)

        if events:
            return events
    except Exception as e:
        print(f"    JSON API failed ({e}), trying HTML...")

    # Fallback: HTML scrape
    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")
        for item in soup.select("article, li.event, div.event-item"):
            title_el = item.select_one("h2, h3, .title")
            date_el  = item.select_one("time, .date")
            link_el  = item.select_one("a[href]")
            if not title_el: continue
            title    = title_el.get_text(strip=True)
            date_str = (date_el.get("datetime") or date_el.get_text()) if date_el else ""
            d        = _parse_nl_date(date_str) if date_str else ""
            if not title or not d: continue
            href = link_el.get("href","") if link_el else ""
            if href and not href.startswith("http"):
                href = "https://www.viernulvier.gent" + href
            ev = _make_event(venue_cfg, title, f"{d}T20:00:00", source_url=href)
            events.append(ev)
    except Exception as e:
        print(f"    HTML fallback also failed: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# KOMPASS — JavaScript-rendered, try common API patterns
# ══════════════════════════════════════════════════════════════

@register_parser("kompass")
def parse_kompass(url: str, venue_cfg: dict) -> List[Event]:
    events = []

    # Kompass uses WordPress — try WP REST API
    wp_urls = [
        "https://kompassklub.com/wp-json/wp/v2/tribe_events?per_page=50&status=publish",
        "https://kompassklub.com/wp-json/tribe/events/v1/events?per_page=50",
    ]

    for api_url in wp_urls:
        try:
            data = _fetch_json(api_url)
            items = data if isinstance(data, list) else data.get("events", [])
            for item in items:
                title    = item.get("title", {})
                if isinstance(title, dict): title = title.get("rendered", "")
                title    = re.sub(r'<[^>]+>', '', str(title)).strip()
                start    = item.get("start_date") or item.get("date") or ""
                link     = item.get("link") or item.get("url") or url
                desc     = item.get("description", {})
                if isinstance(desc, dict): desc = desc.get("rendered", "")
                desc     = re.sub(r'<[^>]+>', '', str(desc))[:300]

                if not title or not start: continue
                if "T" not in str(start):
                    d = _parse_nl_date(str(start))
                    start = f"{d}T23:00:00" if d else ""
                if not start: continue

                ev = _make_event(venue_cfg, title, str(start)[:19],
                                 description=desc, source_url=str(link))
                events.append(ev)
            if events:
                return events
        except Exception:
            continue

    # HTML fallback
    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")
        for item in soup.select("article.type-tribe_events, .tribe-event, article.event"):
            title_el = item.select_one("h2, h3, .tribe-event-name, .event-title")
            date_el  = item.select_one("time, .tribe-event-date-start, .event-date")
            link_el  = item.select_one("a[href]")
            if not title_el: continue
            title    = title_el.get_text(strip=True)
            date_raw = (date_el.get("datetime") or date_el.get_text()) if date_el else ""
            d        = _parse_nl_date(date_raw) if date_raw else ""
            if not title or not d: continue
            href = link_el.get("href","") if link_el else url
            ev = _make_event(venue_cfg, title, f"{d}T23:00:00", source_url=href)
            events.append(ev)
    except Exception as e:
        print(f"    Kompass HTML fallback failed: {e}")

    return events


# ── Add future parsers below ──────────────────────────────────
# @register_parser("minusone")
# def parse_minusone(url, venue_cfg): ...
