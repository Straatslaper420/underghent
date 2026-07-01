// Manual coordinate corrections for venues where the Gentse Feesten detail page
// publishes a WRONG Google Maps coordinate.
//
// Why this exists: detail.ts copies each event's coordinate straight from the
// page's Google Maps "daddr" link. For Boomtown's "Kouter - Kiosk" stage that
// link points at a street called "Kouter" in LOCHRISTI (51.1051, 3.8291), not
// the Kouter square in central Gent — so all those pins land in the wrong town.
// The greater-Gent bounding box in geocode.ts can't save us: that guard only
// runs on coord-less (geocoded) events, and Lochristi's edge sits just inside
// the box anyway. So we correct by venue name after scraping.
//
// Add new entries here as bad source coordinates are spotted. Keyed by the
// normalized venue name (lowercased, whitespace collapsed).

import type { FeestenEvent } from './types.js'

type Fix = { lat: number; lng: number; address?: string }

const VENUE_COORD_FIXES: Record<string, Fix> = {
  'kouter - kiosk': {
    // Kiosk (bandstand) in the middle of the Kouter square, beside HA Concerts.
    lat: 51.05018,
    lng: 3.7233,
    address: 'Kouter, 9000 Gent',
  },
}

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Overwrite coordinates (and optionally address) for any event whose venue has
 * a known fix. Mutates `events` in place and returns the same array.
 */
export function applyVenueCoordFixes(events: FeestenEvent[]): FeestenEvent[] {
  let fixed = 0
  for (const e of events) {
    const fix = VENUE_COORD_FIXES[norm(e.venue)]
    if (!fix) continue
    e.lat = fix.lat
    e.lng = fix.lng
    if (fix.address) e.address = fix.address
    fixed++
  }
  if (fixed) {
    console.log(`[fix] applied venue coordinate corrections to ${fixed} event(s)`)
  }
  return events
}
