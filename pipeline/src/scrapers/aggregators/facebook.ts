import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ApifyClient } from 'apify-client'
import { log } from '../../lib/logger.js'
import type { GenreRecord } from '../../types/registry.js'

export const SOURCE_ID = 'facebook'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = resolve(__dirname, '../../../config')

const URL_PLACEHOLDER_PREFIX = 'PASTE_'

export interface FacebookProxyConfig {
  useApifyProxy:     boolean
  apifyProxyGroups?: string[]
}

export interface FacebookConfig {
  actorId:            string
  discoveryMode:      'discovery' | 'venues' | 'both'
  maxEventsPerSource: number
  skipPastEvents:     boolean
  lookaheadDays:      number
  musicOnly:          boolean
  proxy:              FacebookProxyConfig
  discovery:          { searchQueries: string[]; startUrls: string[] }
  venues:             { startUrls: string[] }
  ghentBounds:        { latMin: number; latMax: number; lngMin: number; lngMax: number }
}

export interface RawFacebookEvent {
  id:                string
  url:               string
  name:              string
  utcStartDate:      string
  dateTimeSentence:  string | null
  description:       string | null
  usersGoing:        number | null
  usersInterested:   number | null
  usersResponded:    number | null
  imageUrl:          string | null
  location: {
    name:           string | null
    contextualName: string | null
    streetAddress:  string | null
    city:           string | null
    countryCode:    string | null
    latitude:       number | null
    longitude:      number | null
  } | null
  ticketsInfo: {
    buyUrl:         string | null
    price:          string | null
    title:          string | null
    ticketProvider: string | null
  } | null
  organizedBy:    string | null
  organizators:   Array<{ name: string; url: string; id: string }>
  eventType:      string
  isPast:         boolean
  isOnline:       boolean
  externalLinks:  string[]
}

interface ActorInput {
  startUrls:     string[]
  searchQueries: string[]
  maxEvents:     number
  proxy:         FacebookProxyConfig
}

function isPlaceholder(url: string): boolean {
  return url.trim().startsWith(URL_PLACEHOLDER_PREFIX)
}

function loadMusicKeywords(): string[] {
  const raw = JSON.parse(readFileSync(resolve(CONFIG_DIR, 'genres.json'), 'utf-8')) as { genres: GenreRecord[] }
  const terms = new Set<string>()
  for (const g of raw.genres) {
    for (const k of g.keywords) terms.add(k.toLowerCase())
    for (const a of g.aliases)  terms.add(a.toLowerCase())
  }
  return Array.from(terms)
}

export async function scrapeFacebook(config: FacebookConfig): Promise<RawFacebookEvent[]> {
  const token = process.env.APIFY_TOKEN
  if (!token) {
    throw new Error('APIFY_TOKEN is not set — add it to your environment (see .env.example)')
  }

  // 1. Assemble urls/queries by discoveryMode
  let urls:    string[] = []
  let queries: string[] = []
  if (config.discoveryMode === 'discovery') {
    urls    = config.discovery.startUrls
    queries = config.discovery.searchQueries
  } else if (config.discoveryMode === 'venues') {
    urls    = config.venues.startUrls
    queries = []
  } else if (config.discoveryMode === 'both') {
    urls    = [...config.discovery.startUrls, ...config.venues.startUrls]
    queries = config.discovery.searchQueries
  } else {
    throw new Error(`Unknown discoveryMode "${config.discoveryMode}" (expected discovery | venues | both)`)
  }

  urls = urls.filter(u => !isPlaceholder(u))

  if (urls.length === 0 && queries.length === 0) {
    throw new Error(
      `No start URLs or search queries for discoveryMode "${config.discoveryMode}" — ` +
      'paste a real Ghent explore URL into config/facebook.json (see config/facebook.README.md)',
    )
  }

  // 2. Build actor input
  const input: ActorInput = {
    startUrls:     urls,
    searchQueries: queries,
    maxEvents:     config.maxEventsPerSource,
    proxy:         config.proxy,
  }

  log(SOURCE_ID, `running ${config.actorId} (mode=${config.discoveryMode}, urls=${urls.length}, queries=${queries.length})`)

  // 3. Run the actor (call() polls to completion) and read its dataset
  const client = new ApifyClient({ token })
  const run    = await client.actor(config.actorId).call(input)
  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  const raw = items as unknown as RawFacebookEvent[]
  log(SOURCE_ID, `actor returned ${raw.length} items`)

  // 4. Source hygiene + project filters
  // a. PUBLIC only
  let kept = raw.filter(e => e.eventType === 'PUBLIC')
  log(SOURCE_ID, `dropped ${raw.length - kept.length} non-PUBLIC events`)

  // b. skip past events
  if (config.skipPastEvents) {
    const before = kept.length
    kept = kept.filter(e => e.isPast !== true)
    log(SOURCE_ID, `dropped ${before - kept.length} past events`)
  }

  // c. lookahead horizon
  {
    const before  = kept.length
    const horizon = Date.now() + config.lookaheadDays * 24 * 60 * 60 * 1000
    kept = kept.filter(e => {
      const t = Date.parse(e.utcStartDate)
      if (Number.isNaN(t)) return true
      return t <= horizon
    })
    log(SOURCE_ID, `dropped ${before - kept.length} events beyond ${config.lookaheadDays}-day lookahead`)
  }

  // c2. country reject — drop anything not in Belgium.
  //     Foreign events often arrive with null coords and would otherwise
  //     survive the bounding-box step (which only drops when coords exist).
  {
    const before = kept.length
    kept = kept.filter(e => {
      const cc = e.location?.countryCode
      if (cc == null) return true // unknown country — let bounds/geo enrichment decide
      return cc.toUpperCase() === 'BE'
    })
    log(SOURCE_ID, `dropped ${before - kept.length} non-BE events`)
  }

  // d. bounding box — drop only when coords present AND outside the box
  {
    const before = kept.length
    const b = config.ghentBounds
    kept = kept.filter(e => {
      const lat = e.location?.latitude
      const lng = e.location?.longitude
      if (lat == null || lng == null) return true // missing coords — keep, geo enrichment resolves later
      return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax
    })
    log(SOURCE_ID, `dropped ${before - kept.length} events outside Ghent bounds`)
  }

  // e. music-only gate (optional)
  if (config.musicOnly === true) {
    const before    = kept.length
    const keywords  = loadMusicKeywords()
    kept = kept.filter(e => {
      const hay = `${e.name ?? ''} ${e.description ?? ''}`.toLowerCase()
      return keywords.some(k => hay.includes(k))
    })
    log(SOURCE_ID, `dropped ${before - kept.length} non-music events (musicOnly)`)
  }

  // f. dedup by id
  {
    const before = kept.length
    const seen   = new Map<string, RawFacebookEvent>()
    for (const e of kept) {
      if (!seen.has(e.id)) seen.set(e.id, e)
    }
    kept = Array.from(seen.values())
    log(SOURCE_ID, `dropped ${before - kept.length} duplicate ids`)
  }

  log(SOURCE_ID, `${kept.length} events after filters`)
  return kept
}
