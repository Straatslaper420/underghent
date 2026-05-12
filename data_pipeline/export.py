"""
export.py
Export the master event list into split JSON files consumed by the frontend.

Output files:
  /output/events_master.json    → all non-duplicate events
  /output/events_surface.json   → layer=surface + status=approved
  /output/events_under.json     → layer=under + status=approved
  /output/events_review.json    → status=pending or review
  /output/events_geofail.json   → lat/lng missing
"""

import json
import os
from typing import List
from models import Event


def export_all(events: List[Event], output_dir: str = "output"):
    os.makedirs(output_dir, exist_ok=True)

    active = [e for e in events if e.status != "duplicate"]

    master  = [e.to_dict() for e in active]
    surface = [e.to_dict() for e in active
               if e.layer == "surface" and e.status == "approved" and e.lat]
    under   = [e.to_dict() for e in active
               if e.layer == "under" and e.status == "approved" and e.lat]
    review       = [e.to_dict() for e in active
                    if e.status in ("pending", "review", "geo_review")]
    low_interest = [e.to_dict() for e in active
                    if e.status == "low_interest"]
    geofail = [e.to_dict() for e in active if not e.lat]

    _write(os.path.join(output_dir, "events_master.json"), master)
    _write(os.path.join(output_dir, "events_surface.json"), surface)
    _write(os.path.join(output_dir, "events_under.json"), under)
    _write(os.path.join(output_dir, "events_review.json"), review)
    _write(os.path.join(output_dir, "events_low_interest.json"), low_interest)
    _write(os.path.join(output_dir, "events_geofail.json"), geofail)

    print(f"\n  [export] master={len(master)}  surface={len(surface)}  "
          f"under={len(under)}  review={len(review)}  "
          f"low_interest={len(low_interest)}  geofail={len(geofail)}")

    return {
        "master": len(master),
        "surface": len(surface),
        "under": len(under),
        "review": len(review),
        "geofail": len(geofail),
    }


def _write(path: str, data: list):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Wrote {len(data):>4} events → {path}")
