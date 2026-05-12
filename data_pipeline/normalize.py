"""
normalize.py
Strict, transparent venue/address resolution.

KEY DESIGN DECISIONS:
- If contextual_name looks like a real street address → geocode it directly, no fuzzy
- If contextual_name is a venue name → check alias map (exact only), then flag for review
- Fuzzy matching is DISABLED for coordinate assignment — it caused wrong locations
- coordinate_source field tracks exactly how coords were assigned
- Only exact_alias and direct_geocode are trusted enough to auto-approve
- Everything else → geo_review (needs human confirmation via geo_review_tool.py)
"""

import re
import hashlib
import json
import os
import time
import requests
from datetime import datetime
from typing import Optional, Tuple

# ─── Config ───────────────────────────────────────────────────
_HERE   = os.path.dirname(os.path.abspath(__file__))
_CONFIG = os.path.join(_HERE, "..", "config")

with open(os.path.join(_CONFIG, "venues.json"), encoding="utf-8") as f:
    _VENUES_CFG = json.load(f)["venues"]

# ─── Build lookup tables ──────────────────────────────────────
ALIAS_MAP    = {}   # normalised_alias → venue_id
VENUE_COORDS = {}   # venue_id → {name, lat, lng, address, layer}

def _norm(s: str) -> str:
    if not s: return ""
    s = s.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    for w in ["the","club","de","het","een","zaal","cafe","café","restaurant",
              "bar","bv","vzw","concertzaal","belgium","belgie","belgië","ghent","gent"]:
        s = re.sub(rf"\b{w}\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()

for _v in _VENUES_CFG:
    VENUE_COORDS[_v["id"]] = {
        "name":    _v["name"],
        "lat":     _v.get("lat"),
        "lng":     _v.get("lng"),
        "address": _v.get("address", ""),
        "layer":   _v.get("layer", "review"),
    }
    for _alias in _v.get("aliases", []):
        ALIAS_MAP[_norm(_alias)] = _v["id"]

_RUNTIME_DB = {}   # norm → {original, lat, lng, address}

# ─── Venue cache (local persistent file) ─────────────────────
try:
    import venue_cache as _vc
except ImportError:
    # venue_cache.py not yet on disk — create a no-op stub
    class _vc:
        @staticmethod
        def load(): return {}
        @staticmethod
        def update_from_sheet_rows(rows): return 0
        @staticmethod
        def update_from_geocode(*a, **kw): pass

def load_runtime_venue_db(rows: list) -> int:
    global _RUNTIME_DB
    _RUNTIME_DB = {}

    # 1. Seed from local file cache first (survives sheet wipes)
    file_cache = _vc.load()
    for vname, vdata in file_cache.items():
        k = _norm(vname)
        if k and vdata.get("lat") and vdata.get("lng"):
            _RUNTIME_DB[k] = {
                "original": vname,
                "lat":      vdata["lat"],
                "lng":      vdata["lng"],
                "address":  vdata.get("address", ""),
            }

    # 2. Merge sheet rows (and save any new ones back to file cache)
    _vc.update_from_sheet_rows(rows)

    for row in rows:
        if len(row) < 12: continue
        venue = row[6]
        try:
            lat = float(str(row[10]).replace(",", "."))
            lng = float(str(row[11]).replace(",", "."))
        except:
            continue
        addr = row[8] if len(row) > 8 else ""
        if venue and lat and lng:
            k = _norm(venue)
            if k:
                _RUNTIME_DB[k] = {"original": venue, "lat": lat, "lng": lng, "address": addr}

    return len(_RUNTIME_DB)

# ─── Address detection ────────────────────────────────────────
# Matches: "Lange Violettestraat 277A, 9000 Ghent" or "Vrouwebroersstraat 21, Gent"
_ADDR_RE = re.compile(
    r'\b\d+\w*\b.*,.*(?:\d{4}|gent|ghent|belgium|belgi)',
    re.IGNORECASE
)

def looks_like_address(s: str) -> bool:
    """True if the string is a street address rather than a venue name."""
    return bool(_ADDR_RE.search(s or ""))

# ─── Result object ────────────────────────────────────────────
class GeoResult:
    __slots__ = ("lat","lng","address","canonical_name","venue_id",
                 "coordinate_source","confidence","needs_review")

    def __init__(self, lat=None, lng=None, address="", canonical_name="",
                 venue_id="", coordinate_source="unresolved",
                 confidence=0.0, needs_review=True):
        self.lat              = lat
        self.lng              = lng
        self.address          = address
        self.canonical_name   = canonical_name
        self.venue_id         = venue_id
        self.coordinate_source = coordinate_source
        self.confidence       = confidence
        self.needs_review     = needs_review   # True = must be verified by human

    def __repr__(self):
        return (f"GeoResult(src={self.coordinate_source}, conf={self.confidence:.2f}, "
                f"review={self.needs_review}, lat={self.lat}, name={self.canonical_name!r})")

# ─── Core resolution ──────────────────────────────────────────

def resolve_location(venue_name: str, address: str = "") -> GeoResult:
    """
    Determine coordinates for an event.

    Strategy:
    1. If venue_name IS an address → geocode it directly, high confidence
    2. If venue_name is a known alias → use config coords, trusted
    3. If venue_name exactly matches runtime DB → use those coords, trusted
    4. If address field has something → geocode that
    5. Otherwise → unresolved, needs_review=True, no coords assigned

    NEVER fuzzy-matches for coordinate assignment.
    """
    vn = (venue_name or "").strip()
    ad = (address or "").strip()

    # ── 1. contextual_name IS a street address ─────────────────
    if looks_like_address(vn):
        # Make sure it's in Gent — basic sanity check
        ghent_terms = ["gent","ghent","9000","9030","9032","9040","9041","9042","9050","9051","9052"]
        vn_low = vn.lower()
        is_ghent = any(t in vn_low for t in ghent_terms)
        if is_ghent:
            lat, lng, resolved_addr = _geocode_with_verify(vn, must_contain_ghent=True)
            if lat is not None:
                _vc.update_from_geocode(vn, lat, lng, resolved_addr or vn, "direct_address_geocode")
                return GeoResult(
                    lat=lat, lng=lng,
                    address=resolved_addr or vn,
                    canonical_name=vn,
                    coordinate_source="direct_address_geocode",
                    confidence=0.95,
                    needs_review=False,
                )
        # Address doesn't look Ghent → flag it
        return GeoResult(
            canonical_name=vn,
            coordinate_source="unresolved",
            confidence=0.0,
            needs_review=True,
        )

    # ── 2. Exact alias match from config ──────────────────────
    key = _norm(vn)
    if key and key in ALIAS_MAP:
        vid = ALIAS_MAP[key]
        c   = VENUE_COORDS[vid]
        if c["lat"] and c["lng"]:
            return GeoResult(
                lat=c["lat"], lng=c["lng"],
                address=c["address"],
                canonical_name=c["name"],
                venue_id=vid,
                coordinate_source="exact_alias",
                confidence=1.0,
                needs_review=False,
            )

    # ── 3. Exact match in runtime DB ──────────────────────────
    if key and key in _RUNTIME_DB:
        r = _RUNTIME_DB[key]
        return GeoResult(
            lat=r["lat"], lng=r["lng"],
            address=r["address"],
            canonical_name=r["original"],
            coordinate_source="exact_runtime_db",
            confidence=0.90,
            needs_review=False,
        )

    # ── 4. Geocode the address field if present ────────────────
    if ad and not looks_like_address(ad):
        # address field isn't a full address either — skip
        ad = ""

    if ad:
        lat, lng, resolved_addr = _geocode_with_verify(ad, must_contain_ghent=True)
        if lat is not None:
            _vc.update_from_geocode(vn, lat, lng, resolved_addr or ad, "address_field_geocode")
            return GeoResult(
                lat=lat, lng=lng,
                address=resolved_addr or ad,
                canonical_name=vn,
                coordinate_source="address_field_geocode",
                confidence=0.85,
                needs_review=False,
            )

    # ── 5. Try geocoding venue name + Gent as last resort ─────
    # But flag for review — venue-name geocoding can be wrong (e.g. "De Centrale" → Delft)
    if vn:
        query = f"{vn}, Gent, Belgium"
        lat, lng, resolved_addr = _geocode_with_verify(query, must_contain_ghent=True)
        if lat is not None:
            # Save guess to cache so geo_review_tool can promote it to human_verified
            _vc.update_from_geocode(vn, lat, lng, resolved_addr or "", source="venue_name_geocode")
            return GeoResult(
                lat=lat, lng=lng,
                address=resolved_addr or "",
                canonical_name=vn,
                coordinate_source="venue_name_geocode",
                confidence=0.55,       # LOW — could be wrong
                needs_review=True,     # ← ALWAYS review these
            )

    # ── 6. Unresolved ─────────────────────────────────────────
    return GeoResult(
        canonical_name=vn,
        coordinate_source="unresolved",
        confidence=0.0,
        needs_review=True,
    )


def _geocode_with_verify(query: str, must_contain_ghent: bool = True
                         ) -> Tuple[Optional[float], Optional[float], str]:
    """
    Geocode via Nominatim with a Gent viewbox so results are biased toward
    the city, and a hard bbox rejection so nothing outside Gent ever gets used.
    Returns (lat, lng, display_name) or (None, None, "").
    """
    # Gent bounding box — hard rejection of results outside this area
    LAT_MIN, LAT_MAX = 50.95, 51.15
    LNG_MIN, LNG_MAX = 3.55,  3.90

    # Viewbox biases Nominatim toward Gent without hard-excluding suburbs
    # format: left,top,right,bottom (lng_min,lat_max,lng_max,lat_min)
    VIEWBOX = f"{LNG_MIN},{LAT_MAX},{LNG_MAX},{LAT_MIN}"

    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q":             query,
                "format":        "json",
                "limit":         5,
                "addressdetails": 1,
                "viewbox":       VIEWBOX,
                "bounded":       1,      # only return results inside viewbox
            },
            headers={"User-Agent": "UnderGhent/2.0"},
            timeout=8,
        )
        time.sleep(1.1)   # Nominatim 1 req/sec policy
        data = resp.json()

        # First pass: prefer results with "Gent" in display_name
        for result in data:
            lat = float(result["lat"])
            lng = float(result["lon"])
            display = result.get("display_name", "")
            if must_contain_ghent:
                if not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
                    continue
                if "gent" not in display.lower() and "ghent" not in display.lower():
                    continue
            return lat, lng, display

        # Second pass: accept any result inside bbox even without "Gent" in name
        for result in data:
            lat = float(result["lat"])
            lng = float(result["lon"])
            display = result.get("display_name", "")
            if must_contain_ghent:
                if not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
                    continue
            return lat, lng, display

    except Exception:
        pass

    return None, None, ""


# ─── Helpers ──────────────────────────────────────────────────

def make_normalized_hash(title: str, date_str: str, venue: str) -> str:
    def _c(s): return re.sub(r"\W+", "", (s or "").lower())
    raw = _c(title) + "|" + _c((date_str or "")[:10]) + "|" + _c(venue)
    return hashlib.md5(raw.encode()).hexdigest()[:12]

def timestamp_to_iso(ts) -> str:
    if not ts: return ""
    try:
        return datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%dT%H:%M:%S")
    except:
        return ""

def format_coord(coord) -> str:
    if coord is None: return ""
    return str(coord).replace(".", ",")