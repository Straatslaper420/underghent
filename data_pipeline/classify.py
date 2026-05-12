"""
classify.py
Classify events into surface/under/review AND decide auto-approval.

Status logic:
  approved     → show on map immediately
  pending      → has coords, decent signal, needs human check in sheet
  low_interest → coords known but interest+going < MIN_INTEREST and venue unknown
                 hidden from map unless manually changed to approved in sheet
  review       → weak signal, no coords confidence, or unknown venue

Auto-approve rules (in priority order):
  1. Venue is in venues.json with confirmed coords → approved
  2. Venue matched from approved runtime DB (exact) → approved
  3. Venue unknown BUT interest+going >= MIN_INTEREST → pending (human decides)
  4. Venue unknown AND interest+going < MIN_INTEREST → low_interest (hidden)
  5. No coords at all → geo_review or geofail (handled by ingest, not here)
"""

import json
import os
import re

_HERE   = os.path.dirname(os.path.abspath(__file__))
_CONFIG = os.path.join(_HERE, "..", "config")

with open(os.path.join(_CONFIG, "source_rules.json"), encoding="utf-8") as f:
    _RULES = json.load(f)

with open(os.path.join(_CONFIG, "venues.json"), encoding="utf-8") as f:
    _VENUES = {v["id"]: v for v in json.load(f)["venues"]}

with open(os.path.join(_CONFIG, "collectives.json"), encoding="utf-8") as f:
    _COLLECTIVES = {c["id"]: c for c in json.load(f)["collectives"]}

_LAYER_RULES  = _RULES["layer_rules"]
_CONF         = _LAYER_RULES["confidence"]
_STATUS_RULES = _RULES["status_rules"]

_UNDER_KW   = [k.lower() for k in _LAYER_RULES["keyword_rules"]["under"]]
_SURFACE_KW = [k.lower() for k in _LAYER_RULES["keyword_rules"]["surface"]]

# Minimum combined interest+going for an unknown-venue event to get pending
# instead of low_interest. Tune this number freely.
MIN_INTEREST = 10


def _parse_count(s) -> int:
    """Parse '1,3 d.' or '335' or '' to an integer."""
    if not s:
        return 0
    # Handle Facebook's "1,3 d." (1300) or plain "335"
    s = str(s).strip()
    # Remove dots used as thousands separator in Dutch ("1.300")
    s = re.sub(r'\.(?=\d{3})', '', s)
    # Handle comma as decimal or thousands: "1,3 d." → 1300, "1,300" → 1300
    m = re.match(r'([\d,]+)\s*([dDkKmM]?)', s)
    if not m:
        return 0
    num_str = m.group(1).replace(',', '.')
    multiplier_char = m.group(2).lower()
    try:
        num = float(num_str)
    except ValueError:
        return 0
    multipliers = {'d': 1000, 'k': 1000, 'm': 1000000}
    return int(num * multipliers.get(multiplier_char, 1))


def classify_event(event) -> dict:
    """
    Returns {"layer": str, "confidence_score": float, "status": str}
    status is one of: approved | pending | low_interest | review | geo_review
    """
    d = event.to_dict() if hasattr(event, "to_dict") else event

    venue_id    = d.get("venue_id", "") or ""
    source_type = d.get("source_type", "") or ""
    source_name = (d.get("source_name", "") or "").lower()
    title       = (d.get("title", "") or "").lower()
    description = (d.get("description", "") or "").lower()
    text        = title + " " + description

    interested  = _parse_count(d.get("interested", ""))
    going       = _parse_count(d.get("going", ""))
    total_buzz  = interested + going

    # ── Layer classification ──────────────────────────────────

    # 1. Canonical venue in venues.json
    if venue_id and venue_id in _VENUES:
        venue_layer = _VENUES[venue_id].get("layer", "review")
        if venue_layer in ("surface", "under"):
            # Known venue → always approved regardless of interest count
            return _result(venue_layer, _CONF["venue_canonical_match"],
                           force_status="approved")

    # 2. Scraped from a venue site
    if source_type == "venue_site":
        if source_name in _VENUES:
            venue_layer = _VENUES[source_name].get("layer", "review")
            return _result(venue_layer, _CONF["venue_canonical_match"],
                           force_status="approved")

    # 3. Collective site
    if source_type == "collective_site":
        for cid, c in _COLLECTIVES.items():
            if cid in source_name or c["name"].lower() in source_name:
                return _result(c.get("layer", "under"),
                               _CONF["collective_match"],
                               force_status="approved")
        return _result("under", _CONF["collective_match"],
                       force_status="approved")

    # 4. Keyword scan
    under_hits   = sum(1 for kw in _UNDER_KW   if kw in text)
    surface_hits = sum(1 for kw in _SURFACE_KW if kw in text)

    if under_hits > surface_hits and under_hits > 0:
        layer, conf = "under", _CONF["keyword_match"]
    elif surface_hits > under_hits and surface_hits > 0:
        layer, conf = "surface", _CONF["keyword_match"]
    else:
        src_defaults = _LAYER_RULES.get("source_type_defaults", {})
        layer = src_defaults.get(source_type, "review")
        conf  = _CONF.get("source_type_default", 0.50) if source_type in src_defaults \
                else _CONF["no_signal"]

    # ── Interest gate for unknown venues ─────────────────────
    # venue_id is empty → venue not in our confirmed list
    if not venue_id:
        if total_buzz >= MIN_INTEREST:
            # Enough buzz → pending (human approves in sheet)
            return _result(layer, conf, force_status="pending")
        else:
            # Too quiet → low_interest (hidden from map)
            return _result(layer, conf, force_status="low_interest")

    # venue_id present but not in _VENUES (runtime DB match)
    # Treat same as known venue → approved
    return _result(layer, conf, force_status="approved")


def _result(layer: str, confidence: float, force_status: str = None) -> dict:
    if force_status:
        status = force_status
    else:
        auto_approve = _STATUS_RULES["auto_approve_threshold"]
        auto_review  = _STATUS_RULES["auto_review_threshold"]
        if confidence >= auto_approve:
            status = "approved"
        elif confidence >= auto_review:
            status = "pending"
        else:
            status = "review"

    return {
        "layer":            layer,
        "confidence_score": round(confidence, 2),
        "status":           status,
    }
