import { rateLimitedFetch } from '../../lib/http.js'
import { normalizeText } from '../../lib/text.js'
import type { Enricher, EnricherResult, PipelineContext } from '../../types/enricher.js'
import type { CanonicalEvent } from '../../types/canonical.js'
import type { StorageAdapter } from '../../types/storage.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const UA = process.env.NOMINATIM_USER_AGENT ?? 'UnderGhent-Pipeline/2.0 (contact@underghent.be)'

// Area bounding boxes [latMin, latMax, lngMin, lngMax]
const AREA_BOXES: Array<{ name: string; lat: [number, number]; lng: [number, number] }> = [
  { name: 'Dampoort',     lat: [51.055, 51.070], lng: [3.740, 3.770] },
  { name: 'Brugse Poort', lat: [51.055, 51.075], lng: [3.700, 3.730] },
  { name: 'Muide',        lat: [51.060, 51.075], lng: [3.720, 3.740] },
  { name: 'City Centre',  lat: [51.040, 51.060], lng: [3.715, 3.740] },
]

function inferArea(lat: number, lng: number): string | null {
  for (const box of AREA_BOXES) {
    if (lat >= box.lat[0] && lat <= box.lat[1] && lng >= box.lng[0] && lng <= box.lng[1]) {
      return box.name
    }
  }
  return null
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=be`
  try {
    const text = await rateLimitedFetch(url, 1100, UA)
    const results = JSON.parse(text) as NominatimResult[]
    if (!results.length) return null
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
  } catch {
    return null
  }
}

export function makeGeoEnricher(storage: StorageAdapter): Enricher {
  const reviewQueue: CanonicalEvent[] = []

  return {
    name: 'GEO',
    async enrich(event: CanonicalEvent, ctx: PipelineContext): Promise<EnricherResult> {
      // Already has coordinates
      if (event.latitude !== null && event.longitude !== null) {
        const area = event.area ?? inferArea(event.latitude, event.longitude)
        return { area }
      }

      // Priority 1: venue_id registry lookup
      if (event.venue_id) {
        const v = ctx.registries.venues.get(event.venue_id)
        if (v?.lat !== null && v?.lat !== undefined) {
          return {
            latitude:  v.lat,
            longitude: v.lng,
            address:   v.address ?? event.address,
            area:      v.area ?? (v.lat ? inferArea(v.lat, v.lng!) : null),
          }
        }
      }

      // Priority 2: fuzzy alias match on venue string
      if (event.venue) {
        const key = normalizeText(event.venue)
        const id  = ctx.registries.venueAlias.get(key)
        if (id) {
          const v = ctx.registries.venues.get(id)
          if (v?.lat !== null && v?.lat !== undefined) {
            return {
              venue_id:  v.id,
              latitude:  v.lat,
              longitude: v.lng,
              address:   v.address ?? event.address,
              area:      v.area ?? (v.lat ? inferArea(v.lat, v.lng!) : null),
            }
          }
        }
      }

      // Priority 3: Nominatim geocode
      const query = event.address
        ? `${event.address}, Gent, Belgium`
        : event.venue
          ? `${event.venue}, Gent, Belgium`
          : null

      if (query) {
        const coords = await nominatimGeocode(query)
        if (coords) {
          return {
            latitude:  coords.lat,
            longitude: coords.lng,
            area:      inferArea(coords.lat, coords.lng),
          }
        }
      }

      // Priority 4: push to review queue
      reviewQueue.push(event)
      await storage.appendReviewQueue([event])
      return {}
    },
  }
}
