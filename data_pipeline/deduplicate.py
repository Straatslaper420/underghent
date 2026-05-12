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
            # Exact hash duplicate
            canonical_ev = seen_hashes[h]
            # Merge: prefer higher confidence, keep both source_urls
            if ev.confidence_score > canonical_ev.confidence_score:
                # Swap: new one becomes canonical
                canonical_ev.duplicate_of = ev.id
                canonical_ev.status = "duplicate"
                seen_hashes[h] = ev
                canonical.append(ev)
            else:
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
                # Keep the one with higher confidence
                if a.confidence_score >= b.confidence_score:
                    b.duplicate_of = a.id
                    b.status = "duplicate"
                else:
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
