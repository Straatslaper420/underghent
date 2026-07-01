// Backfill coordinates for events that have an address but no lat/lng.
//
// The detail scraper only reads coords from the Google Maps "daddr" link on a
// page; events without that link land off-map even though their street address
// was captured. This stage geocodes those addresses with OpenStreetMap
// Nominatim (max 1 req/sec per their usage policy), caches every lookup to
// disk so re-runs are instant and polite, and only accepts a result that falls
// inside the greater-Gent bounding box — so a bad match can never drop a pin in
// another city.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { FeestenEvent } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'data')
// v2: address-cleaning + multi-candidate lookups. Bumped filename so the old
// cache (which recorded single-query misses) doesn't block the smarter retries.
const CACHE_OUT = resolve(DATA_DIR, 'geocache.v2.json')

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const UA = 'UnderGhent-fiestenpipeline/1.0 (https://underghent.be; contact: info@underghent.be)'
const RATE_MS = 1100 // Nominatim policy: at most 1 request per second.

// Greater Gent, incl. Gentbrugge, Ledeberg, Sint-Amandsberg, Mariakerke, etc.
const GENT_BOX = { lat: [50.95, 51.15] as const, lng: [3.55, 3.90] as const }
function inGent(lat: number, lng: number): boolean {
  return lat >= GENT_BOX.lat[0] && lat <= GENT_BOX.lat[1]
      && lng >= GENT_BOX.lng[0] && lng <= GENT_BOX.lng[1]
}

type Coord = { lat: number; lng: number }
type Cache = Record<string, Coord | null> // null = looked up, no usable result

function loadCache(): Cache {
  if (!existsSync(CACHE_OUT)) return {}
  try { return JSON.parse(readFileSync(CACHE_OUT, 'utf-8')) as Cache } catch { return {} }
}
function saveCache(c: Cache): void {
  writeFileSync(CACHE_OUT, JSON.stringify(c, null, 2), 'utf-8')
}
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

// Many GF addresses are descriptive rather than postal: "Tegenover Bijlokekaai
// 7", "rechtover WEBA", "Hal 16, Dok Noord 4B", "Kerkstraat (naast de kerk)".
// Build progressively looser query candidates so Nominatim can still place them.
function cleanAddress(a: string): string {
  return a.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}
function stripPrefix(a: string): string {
  return a
    .replace(/^(tegenover|recht\s?over|rechtover|t\.?o\.?v\.?|naast|aan|langs|hal\s*\d+\s*,?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function withGent(q: string): string {
  return /\bgent/i.test(q) ? q : `${q}, Gent, Belgium`
}
export function addressCandidates(address: string): string[] {
  const out: string[] = []
  const add = (q: string) => {
    const t = q.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim()
    if (t && !out.includes(t)) out.push(t)
  }
  const base = cleanAddress(address)
  add(withGent(base))
  const noPrefix = stripPrefix(base)
  if (noPrefix && noPrefix !== base) add(withGent(noPrefix))
  // Street centroid: drop the house number from the first segment so a missing
  // house number still resolves to the street (good enough for a festival pin).
  const parts = noPrefix.split(',')
  const street0 = parts[0].replace(/\s+\d+\s*[a-z]?$/i, '').trim()
  if (street0 && street0 !== parts[0].trim()) {
    const rest = parts.slice(1).join(', ').trim()
    add(withGent(rest ? `${street0}, ${rest}` : street0))
  }
  return out
}

async function nominatim(query: string): Promise<Coord | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=be`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8' },
    })
    if (!res.ok) { console.warn(`  [geo] HTTP ${res.status} for "${query}"`); return null }
    const rows = (await res.json()) as Array<{ lat: string; lon: string }>
    if (!rows.length) return null
    const lat = parseFloat(rows[0].lat), lng = parseFloat(rows[0].lon)
    if (!isFinite(lat) || !isFinite(lng)) return null
    return { lat, lng }
  } catch (err) {
    console.warn(`  [geo] fetch failed for "${query}":`, (err as Error).message)
    return null
  }
}

/**
 * Mutates `events` in place: fills lat/lng for any event that is off-map but
 * has an address Nominatim can resolve inside Gent. Returns the same array.
 */
export async function geocodeMissing(events: FeestenEvent[]): Promise<FeestenEvent[]> {
  const cache = loadCache()

  const hasAddr = (e: FeestenEvent) => !!(e.address && e.address.trim())
  const located = events.filter(e => e.lat != null && e.lng != null).length
  const todo = events.filter(e => (e.lat == null || e.lng == null) && hasAddr(e))
  const noAddr = events.filter(e => (e.lat == null || e.lng == null) && !hasAddr(e)).length

  console.log(
    `\n[geo] ${located} already located · ${todo.length} to geocode · ` +
    `${noAddr} without an address (stay off-map)`,
  )

  let filled = 0, unresolved = 0, fromCache = 0, calls = 0
  for (let i = 0; i < todo.length; i++) {
    const e = todo[i]
    const key = e.address!.trim()
    let hit = cache[key]

    if (hit === undefined) {
      // Try each candidate query in turn; accept the first hit inside Gent.
      hit = null
      for (const q of addressCandidates(key)) {
        if (calls > 0) await sleep(RATE_MS)
        calls++
        const r = await nominatim(q)
        if (r && inGent(r.lat, r.lng)) { hit = r; break }
      }
      cache[key] = hit
      saveCache(cache) // persist incrementally — safe to interrupt
      if ((i + 1) % 20 === 0) console.log(`  geocoded ${i + 1}/${todo.length}…`)
    } else {
      fromCache++
    }

    if (hit && inGent(hit.lat, hit.lng)) {
      e.lat = hit.lat
      e.lng = hit.lng
      filled++
    } else {
      unresolved++
    }
  }

  console.log(
    `\n[geo] ✓ filled ${filled} · ${unresolved} unresolved · ` +
    `${fromCache} from cache · ${calls} network calls`,
  )
  console.log(`      cache → ${CACHE_OUT}`)
  return events
}
