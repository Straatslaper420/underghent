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
            today = datetime.now().strftime("%Y-%m-%d")
            events = [e for e in events if e.start_datetime[:10] >= today]
            new = [e for e in events if e.id not in existing_ids
                   and e.raw_id not in existing_ids
                   and e.normalized_hash not in existing_ids]
            for e in new:
                existing_ids.add(e.id)
                existing_ids.add(e.raw_id)
                existing_ids.add(e.normalized_hash)
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


def _parse_peppered(url: str, venue_cfg: dict, base_url: str,
                    genre: str = "") -> List[Event]:
    """
    Shared parser for all Peppered CMS venues (Charlatan, VIERNULVIER, De Bijloke).
    Events live in <li class="eventCard"> with <a class="desc"> containing title + date.
    The first <a> in the card is the image link — we skip it and use a.desc.
    Date formats vary per site: 'wo 13 mei' or '12.05' or '12.05.26'.
    """
    events = []
    seen = set()
    now = datetime.now()

    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")

        for card in soup.select("li.eventCard"):
            desc_a = card.select_one("a.desc")
            if not desc_a:
                continue

            href = desc_a.get("href", "")
            src_url = href if href.startswith("http") else base_url + href

            title_el = desc_a.select_one("h3.title, h2.title, h3, h2")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title or len(title) < 3:
                continue

            date_div = desc_a.select_one("div.top-date")
            if not date_div:
                continue

            # Time: span.time anywhere inside top-date
            time_el = date_div.select_one("span.time")
            time_str = None
            if time_el:
                tm = re.search(r"(\d{1,2}):(\d{2})", time_el.get_text())
                if tm:
                    time_str = f"{int(tm.group(1)):02d}:{tm.group(2)}"
                time_el.decompose()  # remove so it doesn't pollute date text

            start_span = date_div.select_one("span.start")
            date_text = start_span.get_text(strip=True) if start_span else ""

            date_str = ""
            # "12.05" or "12.05.26" format
            dm = re.match(r"^(\d{1,2})\.(\d{2})(?:\.(\d{2,4}))?$", date_text)
            if dm:
                day_n, mon_n = int(dm.group(1)), int(dm.group(2))
                yr_s = dm.group(3)
                if yr_s:
                    yr_n = 2000 + int(yr_s) if len(yr_s) == 2 else int(yr_s)
                else:
                    yr_n = now.year
                    if mon_n < now.month or (mon_n == now.month and day_n < now.day):
                        yr_n = now.year + 1
                date_str = f"{yr_n}-{mon_n:02d}-{day_n:02d}"

            # "wo 13 mei" format
            if not date_str:
                date_str = _parse_nl_date(date_text)

            if not date_str:
                continue

            room_el = desc_a.select_one(".venue, .room")
            room = room_el.get_text(strip=True) if room_el else ""

            uid = f"{date_str}_{title[:30]}"
            if uid in seen:
                continue
            seen.add(uid)

            start_iso = f"{date_str}T{time_str}:00" if time_str else date_str
            ev = _make_event(venue_cfg=venue_cfg, title=title,
                             start_iso=start_iso, source_url=src_url,
                             genre=genre)
            ev.room = room
            events.append(ev)

    except Exception as e:
        print(f"    !! peppered parse error ({venue_cfg.get('id')}): {e}")

    return events


def _fetch_google_ical(page_url: str, venue_cfg: dict) -> List[Event]:
    """
    Extract Google Calendar iCal feed from a page that embeds one,
    then parse all VEVENT blocks into Event objects.

    Works for vierdezaal.gent and minus-one.be/agenda.
    """
    events = []
    try:
        html = _fetch(page_url)
        m = re.search(
            r'calendar\.google\.com/calendar/embed\?src=([^&"\']+)',
            html
        )
        if not m:
            print(f"    No Google Calendar embed found on {page_url}")
            return []

        cal_id = requests.utils.unquote(m.group(1))
        ical_url = (
            f"https://calendar.google.com/calendar/ical/"
            f"{requests.utils.quote(cal_id)}/public/basic.ics"
        )
        ical_text = _fetch(ical_url)

        blocks = re.split(r'BEGIN:VEVENT', ical_text)[1:]
        for block in blocks:
            def _field(name):
                pattern = rf'{name}[^:]*:(.*?)(?=\r?\n[A-Z]|\r?\nEND:VEVENT)'
                fm = re.search(pattern, block, re.DOTALL)
                if not fm:
                    return ""
                val = fm.group(1)
                val = re.sub(r'\r?\n[ \t]', '', val)
                val = val.replace('\\n', '\n').replace('\\,', ',').replace('\\;', ';')
                return val.strip()

            title   = _field("SUMMARY")
            dtstart = _field("DTSTART")
            dtend   = _field("DTEND")
            desc    = _field("DESCRIPTION")[:300]
            src_url = _field("URL")

            if not title or not dtstart:
                continue

            dt_clean = re.sub(r'^.*:', '', dtstart)
            dt_clean = dt_clean.replace('Z', '')
            if 'T' in dt_clean:
                try:
                    dt = datetime.strptime(dt_clean[:15], "%Y%m%dT%H%M%S")
                    start_iso = dt.strftime("%Y-%m-%dT%H:%M:%S")
                except Exception:
                    continue
            else:
                try:
                    dt = datetime.strptime(dt_clean[:8], "%Y%m%d")
                    start_iso = dt.strftime("%Y-%m-%d")  # all-day: no time known
                except Exception:
                    continue

            end_iso = ""
            if dtend:
                de_clean = re.sub(r'^.*:', '', dtend).replace('Z', '')
                if 'T' in de_clean:
                    try:
                        de = datetime.strptime(de_clean[:15], "%Y%m%dT%H%M%S")
                        end_iso = de.strftime("%Y-%m-%dT%H:%M:%S")
                    except Exception:
                        pass

            ev = _make_event(
                venue_cfg, title, start_iso,
                end_iso=end_iso,
                description=desc,
                source_url=src_url or page_url,
            )
            events.append(ev)

    except Exception as e:
        print(f"    !! Google iCal fetch failed: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# CHARLATAN — Peppered CMS
# ══════════════════════════════════════════════════════════════

@register_parser("charlatan")
def parse_charlatan(url: str, venue_cfg: dict) -> List[Event]:
    return _parse_peppered(url, venue_cfg, base_url="https://www.charlatan.be",
                           genre="club")


# ══════════════════════════════════════════════════════════════
# VIERNULVIER — Peppered CMS (JSON API returns 401)
# ══════════════════════════════════════════════════════════════

@register_parser("viernulvier")
def parse_viernulvier(url: str, venue_cfg: dict) -> List[Event]:
    return _parse_peppered(url, venue_cfg, base_url="https://www.viernulvier.gent")


# ══════════════════════════════════════════════════════════════
# KOMPASS — JS-rendered, no events in raw HTML
# ══════════════════════════════════════════════════════════════

@register_parser("kompass")
def parse_kompass(url: str, venue_cfg: dict) -> List[Event]:
    print(f"  [kompass] Site is JS-rendered — no events in static HTML. "
          f"Check for a ticket API or add to Facebook pipeline.")
    return []


# ══════════════════════════════════════════════════════════════
# HOT CLUB GENT
# ══════════════════════════════════════════════════════════════

@register_parser("hotclub")
def parse_hotclub(url: str, venue_cfg: dict) -> List[Event]:
    events = []

    now = datetime.now()
    urls_to_fetch = [url]
    next_month = now.month + 1
    next_year  = now.year
    if next_month > 12:
        next_month = 1
        next_year += 1
    urls_to_fetch.append(
        f"https://www.hotclub.gent/programma.php?maand={next_month}&jaar={next_year}"
    )

    EN_MONTHS = {
        "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
        "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    }

    seen = set()
    for fetch_url in urls_to_fetch:
        try:
            html = _fetch(fetch_url)
        except Exception as e:
            print(f"    hotclub fetch failed ({fetch_url}): {e}")
            continue

        soup = BeautifulSoup(html, "html.parser")
        body_text = soup.get_text("\n")
        blocks = re.split(r'-\s*-\s*-\s*-\s*-', body_text)

        for block in blocks:
            block = block.strip()
            if not block:
                continue

            day_m = re.search(
                r'(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)'
                r',?\s+(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\s+om\s+(\d{1,2})u(\d{2})',
                block, re.IGNORECASE
            )
            if not day_m:
                continue

            day_num  = int(day_m.group(1))
            month_s  = day_m.group(2).lower()
            year_s   = int(day_m.group(3)) if day_m.group(3) else now.year
            hour_s   = int(day_m.group(4))
            minute_s = int(day_m.group(5))
            mon_num  = EN_MONTHS.get(month_s)
            if not mon_num:
                continue

            start_iso = f"{year_s}-{mon_num:02d}-{day_num:02d}T{hour_s:02d}:{minute_s:02d}:00"

            lines = [l.strip() for l in block.split('\n') if l.strip()]
            title = ""
            for i, line in enumerate(lines):
                if re.search(r'\bom\s+\d+u\d+', line, re.I):
                    for j in range(i + 1, len(lines)):
                        candidate = lines[j]
                        if re.match(r'^[\-\s]+$', candidate):
                            continue
                        if re.match(r'^\[', candidate):
                            continue
                        title = candidate
                        break
                    break

            if not title or len(title) < 3:
                continue

            title = re.sub(r'^[A-Za-z\s&]+:\s*', '', title).strip()
            title = re.sub(r'^>\s*', '', title).strip()
            if not title:
                continue

            genre_m = re.search(r'\[\s*([^\]]+)\s*\]', block)
            genre = genre_m.group(1).strip() if genre_m else "jazz"

            if re.search(r'bar lume', block, re.I):
                use_cfg = dict(venue_cfg)
                use_cfg["name"]    = "Bar Lume"
                use_cfg["address"] = "Vrijdagmarkt 33, 9000 Gent"
            else:
                use_cfg = venue_cfg

            uid = f"{start_iso}_{title[:30]}"
            if uid in seen:
                continue
            seen.add(uid)

            ev = _make_event(
                venue_cfg=use_cfg,
                title=title,
                start_iso=start_iso,
                source_url=fetch_url,
                genre=genre,
            )
            events.append(ev)

        time.sleep(1)

    return events


# ══════════════════════════════════════════════════════════════
# DE CENTRALE
# ══════════════════════════════════════════════════════════════

@register_parser("decentrale")
def parse_decentrale(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    EN_MONTHS_SHORT = {
        "jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
        "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12,
    }
    now = datetime.now()

    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")

        for a in soup.find_all("a", href=re.compile(r'/agenda/')):
            href = a.get("href", "")
            text = a.get_text(" ", strip=True)
            if not text or len(text) < 5:
                continue

            date_m = re.search(
                r'(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.(\d{1,2})\.([A-Za-z]{3})',
                text
            )
            if not date_m:
                continue

            day_num = int(date_m.group(1))
            month_s = date_m.group(2).lower()
            mon_num = EN_MONTHS_SHORT.get(month_s)
            if not mon_num:
                continue

            year = now.year
            if mon_num < now.month or (mon_num == now.month and day_num < now.day):
                year = now.year + 1

            start_iso = f"{year}-{mon_num:02d}-{day_num:02d}"

            title = text[:date_m.start()].strip()
            title = re.sub(r'\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$', '', title, flags=re.I).strip()
            if not title or len(title) < 3:
                continue

            src_url = href if href.startswith("http") else "https://www.decentrale.be" + href

            ev = _make_event(
                venue_cfg=venue_cfg,
                title=title,
                start_iso=start_iso,
                source_url=src_url,
                genre="world",
            )
            events.append(ev)

    except Exception as e:
        print(f"    !! decentrale parse error: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# HA CONCERTS
# Structure: .concert-list contains alternating a.concert-thumb
# (image + time[datetime]) and div.concert-details (h2 title + .concert-starttime)
# ══════════════════════════════════════════════════════════════

@register_parser("ha_concerts")
def parse_ha_concerts(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    html = None

    for attempt in range(3):
        try:
            html = _fetch(url)
            break
        except Exception as e:
            if attempt == 2:
                print(f"    ha_concerts unreachable after 3 attempts: {e}")
                return []
            time.sleep(3)

    try:
        soup = BeautifulSoup(html, "html.parser")
        thumbs  = soup.select("a.concert-thumb")
        details = soup.select("div.concert-details")

        for thumb, detail in zip(thumbs, details):
            time_el  = thumb.select_one("time[datetime]")
            date_str = time_el.get("datetime", "") if time_el else ""
            if not date_str:
                continue

            title_el = detail.select_one("h2, h3")
            title    = title_el.get_text(strip=True) if title_el else ""
            if not title or len(title) < 3:
                continue

            st_el    = detail.select_one(".concert-starttime")
            time_str = _parse_time(st_el.get_text() if st_el else "") or "20:00"
            href     = thumb.get("href", "")

            start_iso = f"{date_str}T{time_str}:00"
            ev = _make_event(venue_cfg=venue_cfg, title=title,
                             start_iso=start_iso, source_url=href)
            events.append(ev)

    except Exception as e:
        print(f"    !! ha_concerts parse error: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# THE CROSSOVER
# ══════════════════════════════════════════════════════════════

@register_parser("thecrossover")
def parse_thecrossover(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    now = datetime.now()

    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")

        agenda = soup.find(id="agenda") or soup.find("section", id="agenda") or soup

        event_links = []
        for h2 in agenda.find_all("h2"):
            a = h2.find("a", href=True)
            if a and not a["href"].startswith("http"):
                event_links.append(("https://www.thecrossover.be" + a["href"], a.get_text(strip=True)))
            elif a and a["href"].startswith("http"):
                event_links.append((a["href"], a.get_text(strip=True)))

        if not event_links:
            for a in soup.find_all("a", href=re.compile(r'^/[a-z0-9\-]+$')):
                if a.get_text(strip=True) == "Details":
                    parent = a.find_parent()
                    h2 = parent.find_previous("h2") if parent else None
                    title_text = h2.get_text(strip=True) if h2 else ""
                    href = "https://www.thecrossover.be" + a["href"]
                    if title_text and href not in [e[0] for e in event_links]:
                        event_links.append((href, title_text))

        for detail_url, title in event_links[:15]:
            try:
                detail_html = _fetch(detail_url)
                detail_soup = BeautifulSoup(detail_html, "html.parser")
                detail_text = detail_soup.get_text(" ")

                date_str = ""
                dm = re.search(
                    r'(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})',
                    detail_text, re.I
                )
                if dm:
                    date_str = _parse_nl_date(f"{dm.group(1)} {dm.group(2)} {dm.group(3)}")
                if not date_str:
                    dm2 = re.search(r'(\d{1,2})[/\.](\d{1,2})[/\.](\d{4})', detail_text)
                    if dm2:
                        date_str = f"{dm2.group(3)}-{int(dm2.group(2)):02d}-{int(dm2.group(1)):02d}"

                if not date_str:
                    continue

                time_str = _parse_time(detail_text)
                um = re.search(r'(\d{1,2})u(\d{2})', detail_text)
                if um and time_str == "20:00":
                    time_str = f"{int(um.group(1)):02d}:{um.group(2)}"

                price_m = re.search(r'(\d+)[,\.](\d{2})\s*(?:euro|€)?', detail_text)
                price = f"€{price_m.group(1)},{price_m.group(2)}" if price_m else ""

                start_iso = f"{date_str}T{time_str}:00"
                ev = _make_event(
                    venue_cfg=venue_cfg,
                    title=title,
                    start_iso=start_iso,
                    source_url=detail_url,
                    genre="live music",
                    price=price,
                )
                events.append(ev)
                time.sleep(1)

            except Exception as e:
                print(f"    crossover detail fetch failed ({detail_url}): {e}")
                time.sleep(1)

    except Exception as e:
        print(f"    !! thecrossover parse error: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# ZEBRASTRAAT — JS-filtered WordPress, no events in static HTML
# ══════════════════════════════════════════════════════════════

@register_parser("zebrastraat")
def parse_zebrastraat(url: str, venue_cfg: dict) -> List[Event]:
    print(f"  [zebrastraat] Events are JS-filtered — not in static HTML. "
          f"Add to Facebook pipeline or find their API.")
    return []


# ══════════════════════════════════════════════════════════════
# BROEI — calendar table structure
# /agenda/YYYY/MM has a <table> where each <td class="day"> contains
# <div class="date"><span>DD</span></div> and <div class="event"> children.
# ══════════════════════════════════════════════════════════════

@register_parser("broei")
def parse_broei(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    now = datetime.now()
    seen = set()

    fetch_urls = [
        f"https://www.broei.be/agenda/{now.year}/{now.month:02d}",
    ]
    next_m = now.month + 1
    next_y = now.year
    if next_m > 12:
        next_m = 1
        next_y += 1
    fetch_urls.append(f"https://www.broei.be/agenda/{next_y}/{next_m:02d}")

    for fetch_url in fetch_urls:
        url_m = re.search(r'/agenda/(\d{4})/(\d{2})', fetch_url)
        if not url_m:
            continue
        year_n, month_n = int(url_m.group(1)), int(url_m.group(2))

        try:
            html = _fetch(fetch_url)
        except Exception as e:
            print(f"    broei fetch failed ({fetch_url}): {e}")
            continue

        soup = BeautifulSoup(html, "html.parser")

        for td in soup.select("td.day"):
            day_el = td.select_one("div.date span")
            if not day_el or not day_el.get_text(strip=True).isdigit():
                continue
            day_n    = int(day_el.get_text(strip=True))
            date_str = f"{year_n}-{month_n:02d}-{day_n:02d}"

            for event_div in td.select(".event"):
                # First <a> without class event__content is the title link
                title_a = None
                for a in event_div.find_all("a"):
                    cls = a.get("class") or []
                    if "event__content" not in cls:
                        title_a = a
                        break
                if not title_a:
                    title_a = event_div.find("a")
                if not title_a:
                    continue

                title = title_a.get_text(strip=True)
                if not title or len(title) < 3:
                    continue

                href    = title_a.get("href", "").strip()
                src_url = href if href.startswith("http") else "https://www.broei.be" + href

                time_p   = event_div.select_one("p")
                time_str = _parse_time(time_p.get_text() if time_p else "")

                uid = f"{date_str}_{title[:30]}"
                if uid in seen:
                    continue
                seen.add(uid)

                start_iso = f"{date_str}T{time_str}:00"
                ev = _make_event(venue_cfg=venue_cfg, title=title,
                                 start_iso=start_iso, source_url=src_url)
                events.append(ev)

        time.sleep(1)

    return events


# ══════════════════════════════════════════════════════════════
# TREFPUNT
# ══════════════════════════════════════════════════════════════

@register_parser("trefpunt")
def parse_trefpunt(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    now = datetime.now()
    seen = set()

    NL_MONTHS_SHORT = {
        "jan":1,"feb":2,"mrt":3,"apr":4,"mei":5,"jun":6,
        "jul":7,"aug":8,"sep":9,"okt":10,"nov":11,"dec":12,
    }

    try:
        html  = _fetch(url)
        soup  = BeautifulSoup(html, "html.parser")
        body_text = soup.get_text("\n")

        date_pattern = re.compile(
            r'(?:MAA|DIN|WOE|DON|VRI|ZAT|ZON)\s+(\d{1,2})\s+(JAN|FEB|MRT|APR|MEI|JUN|JUL|AUG|SEP|OKT|NOV|DEC)',
            re.I
        )

        chunks = date_pattern.split(body_text)

        i = 1
        while i + 2 < len(chunks):
            day_str  = chunks[i]
            mon_str  = chunks[i + 1].lower()
            content  = chunks[i + 2]
            i += 3

            mon_n = NL_MONTHS_SHORT.get(mon_str[:3])
            if not mon_n:
                continue

            day_n  = int(day_str)
            year_n = now.year
            if mon_n < now.month or (mon_n == now.month and day_n < now.day):
                year_n = now.year + 1

            date_str = f"{year_n}-{mon_n:02d}-{day_n:02d}"

            lines = [l.strip() for l in content.split('\n') if l.strip()]
            if not lines:
                continue
            title = lines[0]
            title = re.sub(r'^[A-Z\s]+//\s*', '', title).strip()
            if not title or len(title) < 3:
                continue

            time_str = _parse_time(content)
            um = re.search(r'(\d{1,2})u(\d{2})', content)
            if um and time_str == "20:00":
                time_str = f"{int(um.group(1)):02d}:{um.group(2)}"

            price_m = re.search(r'€\s*(\d+)', content)
            price   = f"€{price_m.group(1)}" if price_m else ""

            fb_m    = re.search(r'(https://fb\.me/[^\s\n]+)', content)
            src_url = fb_m.group(1) if fb_m else url

            uid = f"{date_str}_{title[:30]}"
            if uid in seen:
                continue
            seen.add(uid)

            start_iso = f"{date_str}T{time_str}:00"
            ev = _make_event(
                venue_cfg=venue_cfg,
                title=title,
                start_iso=start_iso,
                source_url=src_url,
                genre="jazz",
                price=price,
            )
            events.append(ev)

    except Exception as e:
        print(f"    !! trefpunt parse error: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# KINKY STAR
# ══════════════════════════════════════════════════════════════

@register_parser("kinkystar")
def parse_kinkystar(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    seen = set()
    EN_MONTHS = {
        "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
        "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    }
    # Words that indicate nav/footer text leaked in as a "title"
    NAV_WORDS = {"menu", "home", "about", "contact", "facebook", "instagram",
                 "tickets", "programma", "agenda", "info", "follow", "newsletter"}

    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")

        # Try structured HTML first: look for headings or anchors near date text
        DATE_RE = re.compile(
            r'(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)'
            r'\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})',
            re.I
        )
        TIME_RE = re.compile(r'(\d{1,2}):(\d{2})')

        # Walk every text node that contains a full date
        for tag in soup.find_all(string=DATE_RE):
            date_m = DATE_RE.search(tag)
            if not date_m:
                continue

            day_n  = int(date_m.group(1))
            mon_s  = date_m.group(2).lower()
            year_n = int(date_m.group(3))
            mon_n  = EN_MONTHS.get(mon_s)
            if not mon_n:
                continue
            date_str = f"{year_n}-{mon_n:02d}-{day_n:02d}"

            # Extract time from the same tag text if present
            time_m = TIME_RE.search(tag)
            start_iso = (f"{date_str}T{int(time_m.group(1)):02d}:{time_m.group(2)}:00"
                         if time_m else date_str)

            # Walk up the DOM to find the nearest heading or container with title
            parent = tag.parent
            title = ""
            for _ in range(5):  # at most 5 levels up
                if parent is None:
                    break
                # Look for a heading sibling or child
                heading = parent.find(["h1", "h2", "h3", "h4"])
                if heading:
                    title = heading.get_text(strip=True)
                    break
                # Or any <a> that looks like an event link (not nav)
                for a in parent.find_all("a", href=True):
                    t = a.get_text(strip=True)
                    if (3 <= len(t) <= 80
                            and t.lower() not in NAV_WORDS
                            and not any(w in t.lower() for w in NAV_WORDS)):
                        title = t
                        break
                if title:
                    break
                parent = parent.parent

            if not title or len(title) < 3 or len(title) > 100:
                continue
            if title.lower() in NAV_WORDS:
                continue

            uid = f"{date_str}_{title[:30]}"
            if uid in seen:
                continue
            seen.add(uid)

            ev = _make_event(
                venue_cfg=venue_cfg,
                title=title,
                start_iso=start_iso,
                source_url=url,
                genre="indie",
            )
            events.append(ev)

    except Exception as e:
        print(f"    !! kinkystar parse error: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# COPA DOK — Webflow dynamic list
# Each .w-dyn-item has .card-title (date) + artist name in remaining text
# ══════════════════════════════════════════════════════════════

@register_parser("copadok")
def parse_copadok(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    seen = set()

    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")

        for item in soup.select(".w-dyn-item"):
            date_el = item.select_one(".card-title")
            if not date_el:
                continue
            date_text = date_el.get_text(strip=True)
            date_str  = _parse_nl_date(date_text)
            if not date_str:
                continue

            # Artist name: text between the date and the first "Learn More"
            full_text = item.get_text(" ", strip=True)
            after_date = full_text.replace(date_text, "", 1).strip()
            before_more = after_date.split("Learn More")[0].strip()
            title = re.sub(r'\s+', ' ', before_more).strip()
            if not title or len(title) < 2:
                continue

            uid = f"{date_str}_{title[:30]}"
            if uid in seen:
                continue
            seen.add(uid)

            start_iso = f"{date_str}T14:00:00"
            ev = _make_event(venue_cfg=venue_cfg, title=title,
                             start_iso=start_iso, source_url=url, genre="festival")
            events.append(ev)

    except Exception as e:
        print(f"    !! copadok parse error: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# DE BIJLOKE — Peppered CMS
# ══════════════════════════════════════════════════════════════

@register_parser("debijloke")
def parse_debijloke(url: str, venue_cfg: dict) -> List[Event]:
    return _parse_peppered(url, venue_cfg, base_url="https://www.bijloke.be",
                           genre="classical")


# ══════════════════════════════════════════════════════════════
# CHINASTRAAT
# ══════════════════════════════════════════════════════════════

@register_parser("chinastraat")
def parse_chinastraat(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    seen = set()

    EN_MONTHS = {
        "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
        "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
        "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
        "sep":9,"oct":10,"nov":11,"dec":12,
    }

    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")

        modal_containers = soup.find_all(
            True,
            class_=re.compile(r'modal|popup|lightbox|overlay|w-modal|dialog', re.I)
        )

        if not modal_containers:
            modal_containers = [
                div for div in soup.find_all("div")
                if div.find("h3") and re.search(
                    r'(?:thursday|friday|saturday|sunday|monday|donderdag|vrijdag|zaterdag|zondag|maandag)',
                    div.get_text(), re.I
                )
            ]

        for modal in modal_containers:
            text = modal.get_text("\n")

            title_el = modal.find(["h3", "h2", "strong"])
            title    = title_el.get_text(strip=True) if title_el else ""
            if not title:
                lines = [l.strip() for l in text.split('\n') if l.strip()]
                title = lines[0] if lines else ""
            if not title or len(title) < 3:
                continue

            if title.lower() in ["bio", "line-up", "line up", "practical", "nl", "en"]:
                continue

            date_str = ""

            dm = re.search(
                r'(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+'
                r'(?:(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)(?:\s+(\d{4}))?'
                r'|([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?)',
                text, re.I
            )
            if dm:
                if dm.group(1):
                    day_n  = int(dm.group(1))
                    mon_s  = dm.group(2).lower()
                    year_n = int(dm.group(3)) if dm.group(3) else datetime.now().year
                else:
                    mon_s  = dm.group(4).lower()
                    day_n  = int(dm.group(5))
                    year_n = int(dm.group(6)) if dm.group(6) else datetime.now().year
                mon_n = EN_MONTHS.get(mon_s) or EN_MONTHS.get(mon_s[:3])
                if mon_n:
                    date_str = f"{year_n}-{mon_n:02d}-{day_n:02d}"

            if not date_str:
                date_str = _parse_nl_date(text)

            if not date_str:
                continue

            time_str = None
            tm = re.search(r'(\d{1,2})h?:?(\d{2})', text)
            if tm:
                time_str = f"{int(tm.group(1)):02d}:{tm.group(2)}"

            end_iso = ""
            end_m = re.search(r'[-–]\s*(\d{1,2}):(\d{2})', text)
            if end_m:
                end_iso = f"{date_str}T{int(end_m.group(1)):02d}:{end_m.group(2)}:00"

            price_m = re.search(r'€\s*(\d+)', text)
            price   = f"€{price_m.group(1)}" if price_m else ""

            ticket_a    = modal.find("a", href=re.compile(r'ticket|weticket|chipta', re.I))
            tickets_url = ticket_a.get("href", "") if ticket_a else ""

            uid = f"{date_str}_{title[:30]}"
            if uid in seen:
                continue
            seen.add(uid)

            start_iso = f"{date_str}T{time_str}:00" if time_str else date_str
            ev = _make_event(
                venue_cfg=venue_cfg,
                title=title,
                start_iso=start_iso,
                end_iso=end_iso,
                source_url=url,
                genre="club",
                price=price,
                tickets_url=tickets_url,
            )
            events.append(ev)

    except Exception as e:
        print(f"    !! chinastraat parse error: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# VIERDE ZAAL — Google Calendar iCal
# ══════════════════════════════════════════════════════════════

@register_parser("vierdeZaal")
def parse_vierdezaal(url: str, venue_cfg: dict) -> List[Event]:
    return _fetch_google_ical(url, venue_cfg)


# ══════════════════════════════════════════════════════════════
# WINTERCIRCUS
# ══════════════════════════════════════════════════════════════

@register_parser("wintercircus")
def parse_wintercircus(url: str, venue_cfg: dict) -> List[Event]:
    events = []
    seen = set()

    api_urls = [
        "https://portal.wintercircus.be/api/events",
        "https://portal.wintercircus.be/api/agenda",
        "https://portal.wintercircus.be/events.json",
    ]
    for api_url in api_urls:
        try:
            data  = _fetch_json(api_url)
            items = data if isinstance(data, list) else data.get("events", data.get("items", []))
            for item in items:
                title = item.get("title") or item.get("name") or ""
                start = item.get("startDate") or item.get("start") or item.get("date") or ""
                link  = item.get("url") or item.get("link") or url
                if not title or not start:
                    continue
                if "T" in str(start):
                    start_iso = str(start)[:19]
                else:
                    d = _parse_nl_date(str(start))
                    start_iso = d if d else ""
                if not start_iso:
                    continue
                ev = _make_event(venue_cfg, title, start_iso, source_url=str(link))
                events.append(ev)
            if events:
                return events
        except Exception:
            continue

    try:
        html = _fetch(url)
        soup = BeautifulSoup(html, "html.parser")

        date_pattern = re.compile(r'(\d{2})\.\s*(\d{2})\.\s*(\d{2})\b')

        for container in soup.find_all(True):
            container_text = container.get_text(" ")
            dm = date_pattern.search(container_text)
            if not dm:
                continue

            h3 = container.find("h3")
            if not h3:
                continue

            title = h3.get_text(strip=True)
            if not title or len(title) < 3:
                continue

            day_n  = int(dm.group(1))
            mon_n  = int(dm.group(2))
            year_n = 2000 + int(dm.group(3))
            date_str  = f"{year_n}-{mon_n:02d}-{day_n:02d}"
            start_iso = date_str

            cat_el = container.find(class_=re.compile(r'category|tag|genre', re.I))
            genre  = cat_el.get_text(strip=True).lower() if cat_el else ""

            a_el    = container.find("a", href=True)
            href    = a_el.get("href", "") if a_el else ""
            src_url = href if href.startswith("http") else "https://portal.wintercircus.be" + href

            uid = f"{date_str}_{title[:30]}"
            if uid in seen:
                continue
            seen.add(uid)

            ev = _make_event(venue_cfg=venue_cfg, title=title,
                             start_iso=start_iso, source_url=src_url, genre=genre)
            events.append(ev)

    except Exception as e:
        print(f"    !! wintercircus HTML fallback failed: {e}")

    return events


# ══════════════════════════════════════════════════════════════
# MINUS ONE — Wix JS site, no scrapeable HTML
# ══════════════════════════════════════════════════════════════

@register_parser("minusone")
def parse_minusone(url: str, venue_cfg: dict) -> List[Event]:
    print(f"  [minusone] Wix site — events not in raw HTML. "
          f"Minus One events are captured via Facebook/Stevesie pipeline instead.")
    return []


# ══════════════════════════════════════════════════════════════
# TEST BLOCK
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    print("=" * 60)
    print(" VENUE INGEST — test run")
    print("=" * 60)

    target = sys.argv[1] if len(sys.argv) > 1 else None

    total = 0
    for vid, parser_fn in _PARSERS.items():
        if target and vid != target:
            continue
        venue_cfg = _ALL_VENUES.get(vid, {"id": vid, "name": vid})
        scrape_url = venue_cfg.get("scrape_url")
        if not scrape_url:
            print(f"\n  [{vid}] SKIP — no scrape_url in venues.json")
            continue
        print(f"\n  [{vid}] Scraping {venue_cfg.get('name', vid)}")
        print(f"          URL: {scrape_url}")
        try:
            events = parser_fn(scrape_url, venue_cfg)
            print(f"          ✓ {len(events)} events found")
            for e in events[:3]:
                print(f"            - {e.start_datetime[:10]} | {e.title[:60]}")
            if len(events) > 3:
                print(f"            ... and {len(events)-3} more")
            total += len(events)
        except Exception as ex:
            print(f"          ✗ ERROR: {ex}")
            import traceback
            traceback.print_exc()
        time.sleep(2)

    print(f"\n{'='*60}")
    print(f"  TOTAL EVENTS FOUND: {total}")
    print(f"{'='*60}")
