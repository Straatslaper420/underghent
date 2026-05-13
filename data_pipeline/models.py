"""
models.py
Canonical event data model.

Sheet columns (order matches to_sheets_row):
ID | Title | Date_Start | Hour_Start | Date_End | Hour_End |
Venue | Room | Address | City | Lat | Lng |
Genre | Price | Source_url | Tickets_url |
Status | Description | Interested | Going | Geo_guess_address | Venue_url |
Source_type | Layer
"""

from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Event:
    # Identity
    id:                 str   = ""
    raw_id:             str   = ""
    normalized_hash:    str   = ""

    # Content
    title:              str   = ""
    description:        str   = ""

    # Time (ISO 8601)
    start_datetime:     str   = ""
    end_datetime:       str   = ""

    # Location
    venue:              str   = ""
    venue_id:           str   = ""
    room:               str   = ""
    address:            str   = ""
    city:               str   = "Gent"
    lat:                Optional[float] = None
    lng:                Optional[float] = None

    # Geo audit — filled when coordinate_source == venue_name_geocode
    # This is the human-readable address Nominatim returned for the guess
    geo_guess_address:  str   = ""

    # Classification
    layer:              str   = "review"
    confidence_score:   float = 0.0
    genre:              str   = ""
    price:              str   = ""

    # Source
    source_type:        str   = ""
    source_name:        str   = ""
    source_url:         str   = ""
    venue_url:          str   = ""   # set when FB+venue merged: holds the venue website link
    tickets_url:        str   = ""

    # Pipeline
    # status values:
    #   pending      → has good coords, awaiting editorial approval
    #   approved     → shows on map
    #   geo_review   → needs human to confirm/correct location in geo_review_tool
    #   rejected     → don't show
    #   duplicate    → merged into another event
    status:             str   = "pending"

    interested:         str   = ""
    going:              str   = ""
    duplicate_of:       str   = ""

    # GMaps enrichment
    lat_precise:        Optional[float] = None
    lng_precise:        Optional[float] = None
    gmaps_place_id:     str   = ""
    coord_source:       str   = ""
    coord_confidence:   str   = ""

    def to_dict(self):
        return asdict(self)

    def to_sheets_row(self):
        def _fmt(v):
            if v is None: return ""
            return str(v).replace(".", ",")

        def _date(iso):
            if not iso or len(iso) < 10: return ""
            y, m, d = iso[:4], iso[5:7], iso[8:10]
            return f"{d}.{m}.{y}"

        def _time(iso):
            if not iso or len(iso) < 16: return "?"
            return iso[11:16]

        return [
            self.id,
            self.title,
            _date(self.start_datetime),
            _time(self.start_datetime),
            _date(self.end_datetime),
            _time(self.end_datetime),
            self.venue,
            self.room,
            self.address,
            self.city,
            _fmt(self.lat),
            _fmt(self.lng),
            self.genre,
            self.price,
            self.source_url,
            self.tickets_url,
            self.status,
            self.description,
            self.interested,
            self.going,
            self.geo_guess_address,
            self.venue_url,
            self.source_type,
            self.layer,
        ]

    @staticmethod
    def sheets_headers():
        return [
            "ID","Title","Date_Start","Hour_Start","Date_End","Hour_End",
            "Venue","Room","Address","City","Lat","Lng",
            "Genre","Price","Source_url","Tickets_url",
            "Status","Description","Interested","Going",
            "Geo_guess_address","Venue_url","Source_type","Layer",
        ]
