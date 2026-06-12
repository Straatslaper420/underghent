import { createHash } from 'crypto'
import { readdirSync } from 'fs'
import { join } from 'path'
import { normalizeText } from '../lib/text.js'
import { CanonicalEventSchema } from '../types/canonical.js'
import { log } from '../lib/logger.js'
import type { CanonicalEvent } from '../types/canonical.js'
import type { Registries } from '../types/registry.js'
import type { StorageAdapter } from '../types/storage.js'
import type {
  RawGoabaseEvent, RawBeldubEvent, RawReggaebeEvent,
  RawVenueEvent, RawAgendaEvent, RawEventBase,
} from '../types/raw.js'
import type { RawFacebookEvent } from '../scrapers/aggregators/facebook.js'

export function makeEventId(source: string, title: string, date: string): string {
  return createHash('sha1')
    .update(`${source}|${normalizeText(title)}|${date}`)
    .digest('hex')
    .slice(0, 16)
}

export function resolveVenue(
  venueName: string | null,
  registries: Registries,
): Pick<CanonicalEvent, 'venue_id' | 'venue' | 'address' | 'latitude' | 'longitude' | 'area'> {
  if (!venueName) return { venue_id: null, venue: null, address: null, latitude: null, longitude: null, area: null }

  const key = normalizeText(venueName)
  const id  = registries.venueAlias.get(key)
  if (id) {
    const v = registries.venues.get(id)!
    return {
      venue_id:  v.id,
      venue:     v.canonical_name,
      address:   v.address,
      latitude:  v.lat,
      longitude: v.lng,
      area:      v.area,
    }
  }
  return { venue_id: null, venue: venueName, address: null, latitude: null, longitude: null, area: null }
}

function defaults(): Omit<CanonicalEvent,
  'event_id' | 'title' | 'date_start' | 'source_url' |
  'venue_id' | 'venue' | 'address' | 'latitude' | 'longitude' | 'area'> {
  return {
    facebook_id:       null,
    aggregator_id:     null,
    hour_start:        null,
    hour_end:          null,
    room:              null,
    genre:             null,
    subgenre:          null,
    genre_raw:         null,
    artists:           [],
    support_acts:      [],
    image_url:         null,
    source:            null,
    ticket_url:        null,
    price:             null,
    details:           null,
    description:       null,
    interested:        null,
    going:             null,
    city:              null,
    country:           null,
    organizers:        [],
    social_links:      [],
    collective:        null,
    status:            'pending',
  }
}

function splitNames(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/,|\n|\s\+\s/).map(s => s.trim()).filter(Boolean)
}

function normalizeGoabase(raw: RawGoabaseEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    const date_start = r.date_start
    if (!date_start) return []
    const venueFields = resolveVenue(r.venue_name, registries)
    // Goabase publishes per-party coordinates — use them when the venue isn't
    // in our registry, so these parties don't all land in GeoFail.
    if (venueFields.latitude === null && r.latitude != null && r.longitude != null) {
      venueFields.latitude  = r.latitude
      venueFields.longitude = r.longitude
    }
    const event: CanonicalEvent = {
      ...defaults(),
      ...venueFields,
      event_id:      makeEventId('goabase', r.title, date_start),
      aggregator_id: r.event_id ? `gb_${r.event_id}` : null,
      source:        'goabase',
      title:         r.title,
      date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      hour_end:      r.hour_end ?? null,
      artists:       splitNames(r.artists_raw),
      description:   r.description ?? null,
      genre_raw:     r.genre_raw ?? null,
      image_url:     r.image_url ?? null,
      ticket_url:    r.ticket_url ?? null,
      price:         r.price ?? null,
      city:          r.city ?? null,
      country:       r.country ?? null,
      organizers:    r.organizer ? [r.organizer] : [],
    }
    return [event]
  })
}

function normalizeBeldub(raw: RawBeldubEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const venueFields = resolveVenue(r.venue_name, registries)
    const fbMatch = r.event_id?.match(/\/events\/(\d+)/)
    const aggId   = fbMatch ? fbMatch[1] : r.event_id
    const event: CanonicalEvent = {
      ...defaults(),
      ...venueFields,
      event_id:      makeEventId('beldub', r.title, r.date_start),
      aggregator_id: aggId ? `bd_${aggId}` : null,
      source:        'beldub',
      title:         r.title,
      date_start:    r.date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      description:   r.description ?? null,
      genre_raw:     r.genre_raw ?? null,
      image_url:     r.image_url ?? null,
      ticket_url:    r.ticket_url ?? null,
      city:          r.city ?? null,
      country:       'Belgium',
    }
    return [event]
  })
}

function normalizeReggaebe(raw: RawReggaebeEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const venueFields = resolveVenue(r.venue_name, registries)
    // The reggae.be payload carries per-event coordinates — use them when the
    // venue isn't in our registry (most non-Ghent venues), so fewer events
    // land in GeoFail.
    if (venueFields.latitude === null && r.latitude != null && r.longitude != null) {
      venueFields.latitude  = r.latitude
      venueFields.longitude = r.longitude
    }
    const event: CanonicalEvent = {
      ...defaults(),
      ...venueFields,
      event_id:      makeEventId('reggaebe', r.title, r.date_start),
      aggregator_id: r.event_id ? `rg_${r.event_id}` : null,
      source:        'reggaebe',
      title:         r.title,
      date_start:    r.date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      description:   r.description ?? null,
      genre_raw:     r.genre_raw ?? null,
      image_url:     r.image_url ?? null,
      artists:       splitNames(r.artists_raw),
      price:         r.price ?? null,
      city:          r.city ?? null,
      country:       'Belgium',
    }
    return [event]
  })
}

function normalizeVenue(raw: RawVenueEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const reg = registries.venues.get(r.venue_id)
    const event: CanonicalEvent = {
      ...defaults(),
      event_id:      makeEventId(r.venue_id, r.title, r.date_start),
      venue_id:      r.venue_id,
      venue:         r.venue_name,
      source:        r._source,
      address:       reg?.address ?? null,
      latitude:      reg?.lat ?? null,
      longitude:     reg?.lng ?? null,
      area:          reg?.area ?? null,
      title:         r.title,
      date_start:    r.date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      hour_end:      r.hour_end ?? null,
      room:          r.room ?? null,
      description:   r.description ?? null,
      genre_raw:     r.genre_raw ?? null,
      image_url:     r.image_url ?? null,
      support_acts:  splitNames(r.support_raw),
      price:         r.price ?? null,
      ticket_url:    r.ticket_url ?? null,
      city:          'Gent',
      country:       'Belgium',
    }
    return [event]
  })
}

function normalizeAgenda(raw: RawAgendaEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const reg = registries.venues.get(r.venue_id)
    const event: CanonicalEvent = {
      ...defaults(),
      event_id:    makeEventId(r.venue_id, r.title, r.date_start),
      venue_id:    r.venue_id,
      venue:       r.venue_name,
      source:      r._source,
      address:     reg?.address ?? null,
      latitude:    reg?.lat ?? null,
      longitude:   reg?.lng ?? null,
      area:        reg?.area ?? null,
      title:       r.title,
      date_start:  r.date_start,
      source_url:  r.source_url,
      hour_start:  r.hour_start ?? null,
      hour_end:    r.hour_end ?? null,
      image_url:   r.image_url ?? null,
      description: r.description ?? null,
      city:        'Gent',
      country:     'Belgium',
    }
    return [event]
  })
}

// DST-aware UTC -> Europe/Brussels conversion via Intl
function toBrussels(utc: string): { date: string; time: string } | null {
  if (!utc) return null
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Brussels',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  let hour = get('hour')
  if (hour === '24') hour = '00' // some ICU builds emit 24 for midnight
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` }
}

export function normalizeFacebook(raw: RawFacebookEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    const local = toBrussels(r.utcStartDate)
    if (!local) return []
    const venue = r.location?.name ?? r.location?.contextualName ?? null
    const event: CanonicalEvent = {
      ...defaults(),
      facebook_id:   r.id,
      aggregator_id: `fb_${r.id}`,
      event_id:      makeEventId('facebook', r.name, local.date),
      source:        'facebook',
      image_url:     r.imageUrl ?? null,
      title:         r.name,
      date_start:    local.date,
      hour_start:    local.time,
      venue,
      venue_id:      resolveVenue(venue, registries).venue_id ?? null,
      address:       r.location?.streetAddress ?? null,
      latitude:      r.location?.latitude ?? null,
      longitude:     r.location?.longitude ?? null,
      area:          null,
      city:          r.location?.city ?? null,
      country:       r.location?.countryCode ?? null,
      description:   r.description ?? null,
      going:         r.usersGoing ?? null,
      interested:    r.usersInterested ?? null,
      ticket_url:    r.ticketsInfo?.buyUrl ?? null,
      price:         r.ticketsInfo?.price ?? r.ticketsInfo?.title ?? null,
      organizers:    r.organizators?.map(o => o.name).filter(Boolean) ?? [],
      source_url:    r.url,
      social_links:  r.externalLinks ?? [],
    }
    return [event]
  })
}

function validateEvent(event: CanonicalEvent, source: string): CanonicalEvent | null {
  const result = CanonicalEventSchema.safeParse(event)
  if (!result.success) {
    log('NORMALIZE', `WARN skipped invalid event from ${source}: "${event.title}" �€� ${result.error.errors[0]?.message}`)
    return null
  }
  return result.data as CanonicalEvent
}

export async function normalizeAll(
  storage: StorageAdapter,
  registries: Registries,
  dataDir: string,
): Promise<number> {
  const rawDir   = join(dataDir, 'raw')
  const allEvents: CanonicalEvent[] = []

  let files: string[] = []
  try {
    files = readdirSync(rawDir).filter(f => f.endsWith('.json'))
  } catch {
    log('NORMALIZE', 'No raw data directory found �€� nothing to normalize')
    return 0
  }

  for (const file of files) {
    const source = file.replace('.json', '')
    const raw    = await storage.readRaw<RawEventBase>(source)
    if (!raw.length) continue

    let normalized: CanonicalEvent[] = []

    if (source === 'goabase') {
      normalized = normalizeGoabase(raw as RawGoabaseEvent[], registries)
    } else if (source === 'beldub') {
      normalized = normalizeBeldub(raw as RawBeldubEvent[], registries)
    } else if (source === 'reggaebe') {
      normalized = normalizeReggaebe(raw as RawReggaebeEvent[], registries)
    } else if (source === 'facebook') {
      normalized = normalizeFacebook(raw as unknown as RawFacebookEvent[], registries)
    } else if (['vierdeZaal', 'minusOne'].includes(source)) {
      normalized = normalizeAgenda(raw as RawAgendaEvent[], registries)
    } else {
      // All venue scrapers
      normalized = normalizeVenue(raw as RawVenueEvent[], registries)
    }

    const valid = normalized.map(e => validateEvent(e, source)).filter((e): e is CanonicalEvent => e !== null)
    allEvents.push(...valid)
  }

  // Merge with any existing canonical events (preserve enriched data)
  const existing    = await storage.readCanonical()
  const existingMap = new Map(existing.map(e => [e.event_id, e]))

  for (const event of allEvents) {
    if (!existingMap.has(event.event_id)) {
      existingMap.set(event.event_id, event)
    } else {
      // Preserve enriched fields (genre, subgenre, artists, status) and any
      // pulled overrides, but let the FRESH SCRAPE win on scraper-owned fields.
      // Old value only survives when the new scrape came back empty (partial
      // scrape) — the machine side refreshes freely; human truth lives in
      // `overrides` and is never touched here.
      const prev = existingMap.get(event.event_id)!
      existingMap.set(event.event_id, {
        ...prev,
        description:  event.description  ?? prev.description,
        price:        event.price        ?? prev.price,
        ticket_url:   event.ticket_url   ?? prev.ticket_url,
        room:         event.room         ?? prev.room,
        hour_start:   event.hour_start   ?? prev.hour_start,
        hour_end:     event.hour_end     ?? prev.hour_end,
        source_url:   event.source_url   ?? prev.source_url,
        image_url:    event.image_url    ?? prev.image_url,
        genre_raw:    event.genre_raw    ?? prev.genre_raw,
        source:       event.source       ?? prev.source,
        support_acts: event.support_acts?.length ? event.support_acts : (prev.support_acts ?? []),
      })
    }
  }

  const merged = Array.from(existingMap.values())
  await storage.writeCanonical(merged)
  return allEvents.length
}
