"""
deduplicate.py
Detects duplicate events across sources using normalized_hash.
When a duplicate is found, keeps the highest-confidence version
and marks others with duplicate_of.

Also provides fuzzy title+date dedup for near-matches.
"""

from difflib import SequenceMatcher
from typing import List
from models import Event


def deduplicate(events: List[Event]) -> List[Event]:
    """
    Takes a flat list of Event objects (from all sources combined).
    Returns deduplicated list. Duplicates get status='duplicate' and
    duplicate_of=canonical_id.

    Dedup logic (in order):
      1. Exact normalized_hash match → definite duplicate
      2. Fuzzy: same date + SequenceMatcher title similarity > 0.85 → likely duplicate
    """
    seen_hashes = {}    # hash → Event (canonical)
    canonical = []

    for ev in events:
        h = ev.normalized_hash

        if h and h in seen_hashes:
            canonical_ev = seen_hashes[h]
            _merge_into(canonical_ev, ev)
            ev.duplicate_of = canonical_ev.id
            ev.status = "duplicate"
            canonical.append(ev)
            continue

        if h:
            seen_hashes[h] = ev

        canonical.append(ev)

    # Fuzzy pass: same date, similar title
    _fuzzy_pass(canonical)

    return canonical


def _merge_into(canonical: "Event", other: "Event"):
    """
    Pull the best fields from `other` into `canonical` in-place.
    Facebook contributes: interested, going.
    Venue/collective contributes: coords, genre, price, tickets_url, description.
    """
    fb_event    = other    if other.source_type    == "facebook" else None
    venue_event = other    if other.source_type    != "facebook" else None

    # Social proof — always take from whichever has it
    if other.interested and not canonical.interested:
        canonical.interested = other.interested
    if other.going and not canonical.going:
        canonical.going = other.going

    # If canonical is Facebook and other is a venue event, pull venue fields
    if canonical.source_type == "facebook" and venue_event:
        if venue_event.lat is not None and canonical.lat is None:
            canonical.lat     = venue_event.lat
            canonical.lng     = venue_event.lng
            canonical.address = venue_event.address
        if not canonical.genre and venue_event.genre:
            canonical.genre = venue_event.genre
        if not canonical.price and venue_event.price:
            canonical.price = venue_event.price
        if not canonical.tickets_url and venue_event.tickets_url:
            canonical.tickets_url = venue_event.tickets_url
        if venue_event.source_url and not canonical.venue_url:
            canonical.venue_url = venue_event.source_url

    # Fallback: any source — prefer non-empty for these fields
    if not canonical.tickets_url and other.tickets_url:
        canonical.tickets_url = other.tickets_url
    if not canonical.genre and other.genre:
        canonical.genre = other.genre
    if not canonical.price and other.price:
        canonical.price = other.price

    # Description — prefer the longer one
    if len(other.description) > len(canonical.description):
        canonical.description = other.description


def _fuzzy_pass(events: List[Event]):
    """
    In-place: mark events as duplicate if they share the same start date
    and have very similar titles (ratio > 0.85).
    Skips events already marked as duplicates.
    """
    active = [e for e in events if e.status != "duplicate"]

    for i, a in enumerate(active):
        for b in active[i+1:]:
            if b.status == "duplicate":
                continue
            if a.start_datetime[:10] != b.start_datetime[:10]:
                continue
            ratio = SequenceMatcher(None,
                                    a.title.lower().strip(),
                                    b.title.lower().strip()).ratio()
            if ratio > 0.85:
                if a.confidence_score >= b.confidence_score:
                    _merge_into(a, b)
                    b.duplicate_of = a.id
                    b.status = "duplicate"
                else:
                    _merge_into(b, a)
                    a.duplicate_of = b.id
                    a.status = "duplicate"


def split_by_status(events: List[Event]):
    """
    Returns (approved, geo_review, pending, duplicates, geofail)
    geo_review = has a location guess that needs human confirmation
    geofail    = completely unresolved, no coords at all
    """
    approved   = [e for e in events if e.status == "approved"   and e.lat is not None]
    geo_review = [e for e in events if e.status == "geo_review"]
    pending    = [e for e in events if e.status in ("pending", "review")]
    dups       = [e for e in events if e.status == "duplicate"]
    geofail    = [e for e in events if e.lat is None and e.status not in ("duplicate", "geo_review")]
    return approved, geo_review, pending, dups, geofail
