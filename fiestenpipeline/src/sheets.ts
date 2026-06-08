/**
 * Push events to the `feesten` tab in the UnderGhent Google Sheet.
 *
 * SCHEMA STRATEGY
 *  1. Read the HEADER ROW of the existing `fb_events` tab.
 *  2. Write those SHARED columns FIRST, in the same order/names, mapping
 *     FeestenEvent fields onto them BY HEADER NAME. FB-only columns
 *     (facebook_id, interested, going, …) are left blank.
 *  3. Append the Gentse-Feesten-only columns AFTER, as gf_* headers, so the
 *     row is lossless for in-sheet review without disturbing the front, which
 *     only reads the leading shared columns.
 *  4. Guarantee a `source` column whose value is "feesten".
 *
 * If `fb_events` has no readable header, fall back to FALLBACK_SHARED.
 *
 * WRITE MODE: full refresh — clear the tab, write header + all rows. Re-runs
 * are idempotent; no duplicate rows accumulate.
 */

import { readFileSync, existsSync } from 'fs'
import type { FeestenEvent } from './types.js'

export interface SheetsConfig {
  credentialsPath: string
  spreadsheetId: string
  worksheetName: string // target: "feesten"
  sourceTabName?: string // header source: "fb_events"
}

// Fallback shared layout when fb_events has no readable header (per spec).
const FALLBACK_SHARED = [
  'title', 'venue', 'address', 'date', 'time', 'lat', 'lng', 'desc',
  'url', 'categories', 'organizer', 'price', 'image', 'source',
]

// Gentse-Feesten-only trailing columns. Lossless dump of every FeestenEvent
// field, gf_-prefixed so names never collide with shared fb_events headers.
const GF_EXTRA: Array<[string, (e: FeestenEvent) => string]> = [
  ['gf_node_id',            e => e.nodeId],
  ['gf_detail_url',         e => e.detailUrl],
  ['gf_ics_url',            e => s(e.icsUrl)],
  ['gf_scraped_at',         e => e.scrapedAt],
  ['gf_title',              e => e.title],
  ['gf_venue',              e => s(e.venue)],
  ['gf_address',            e => s(e.address)],
  ['gf_date_start',         e => e.dateStart],
  ['gf_end_date_start',     e => s(e.endDateStart)],
  ['gf_time_start',         e => s(e.timeStart)],
  ['gf_time_end',           e => s(e.timeEnd)],
  ['gf_all_times',          e => e.allTimes.join(', ')],
  ['gf_lat',                e => s(e.lat)],
  ['gf_lng',                e => s(e.lng)],
  ['gf_categories',         e => e.categories.join(', ')],
  ['gf_raw_categories',     e => e.rawCategories.join(', ')],
  ['gf_genre',              e => s(e.genre)],
  ['gf_price',              e => s(e.price)],
  ['gf_price_detail',       e => s(e.priceDetail)],
  ['gf_reduction_groups',   e => e.reductionGroups.join(' | ')],
  ['gf_accessibility',      e => e.accessibilityFlags.join(', ')],
  ['gf_organizer',          e => s(e.organizer)],
  ['gf_organizer_url',      e => s(e.organizerUrl)],
  ['gf_organizer_address',  e => s(e.organizerAddress)],
  ['gf_organizer_phone',    e => s(e.organizerPhone)],
  ['gf_organizer_email',    e => s(e.organizerEmail)],
  ['gf_venue_phone',        e => s(e.venuePhone)],
  ['gf_venue_email',        e => s(e.venueEmail)],
  ['gf_venue_url',          e => s(e.venueUrl)],
  ['gf_website',            e => s(e.website)],
  ['gf_ticket_url',         e => s(e.ticketUrl)],
  ['gf_readspeaker_url',    e => s(e.readSpeakerUrl)],
  ['gf_image_url',          e => s(e.imageUrl)],
  ['gf_gallery',            e => e.gallery.join('\n')],
  ['gf_description',        e => s(e.description)],
]

function s(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

// Resolve a FeestenEvent value for a shared fb_events column, matched by the
// (normalized) header name. Unknown / FB-only columns return '' (blank).
function sharedValue(header: string, e: FeestenEvent): string {
  const h = header.trim().toLowerCase()
  switch (h) {
    case 'title': return e.title
    case 'venue': return s(e.venue)
    case 'room': return ''
    case 'address': return s(e.address)
    case 'area': return ''
    case 'date': case 'date_start': case 'datestart': case 'start_date':
      return e.dateStart
    case 'time': case 'hour_start': case 'hourstart': case 'time_start':
      return s(e.timeStart)
    case 'lat': case 'latitude': return s(e.lat)
    case 'lng': case 'lon': case 'longitude': return s(e.lng)
    case 'desc': case 'description': return s(e.description)
    case 'details': return s(e.priceDetail)
    case 'url': case 'source_url': case 'sourceurl': case 'link':
      return e.detailUrl
    case 'ticket_url': case 'ticketurl': return s(e.ticketUrl)
    case 'website': return s(e.website)
    case 'categories': case 'category': return e.categories.join(', ')
    case 'genre': return s(e.genre)
    case 'subgenre': return ''
    case 'artists': return ''
    case 'organizer': case 'organizers': return s(e.organizer)
    case 'price': return s(e.price)
    case 'image': case 'image_url': case 'imageurl': case 'cover':
      return s(e.imageUrl)
    case 'city': return 'Gent'
    case 'country': return 'BE'
    case 'source': return 'feesten'
    case 'status': return ''
    default:
      // FB-only (facebook_id, interested, going, social_links, collective,
      // event_id, venue_id, aggregator_id, …) or anything unrecognized.
      return ''
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 429 && attempt < retries - 1) {
        const wait = 2000 * Math.pow(2, attempt)
        console.warn(`  [sheets] 429 — retrying in ${wait}ms`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureSheetExists(sheets: any, spreadsheetId: string, title: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exists = meta.data.sheets?.some((s: any) => s.properties?.title === title)
  if (!exists) {
    console.log(`  [sheets] Creating tab "${title}"`)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    })
  }
}

// Read the header row of a tab (row 1). Returns [] if missing/empty.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readHeaderRow(sheets: any, spreadsheetId: string, tab: string): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await withRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` })
    )
    const row = (res.data.values?.[0] ?? []) as string[]
    return row.map(c => (c ?? '').toString())
  } catch {
    return []
  }
}

// Build the full header + the row-builder from the shared + extra layout.
function buildLayout(sharedHeader: string[]): {
  header: string[]
  toRow: (e: FeestenEvent) => string[]
} {
  // Ensure a `source` column exists somewhere in the shared block.
  const hasSource = sharedHeader.some(h => h.trim().toLowerCase() === 'source')
  const shared = hasSource ? sharedHeader : [...sharedHeader, 'source']

  const header = [...shared, ...GF_EXTRA.map(([name]) => name)]
  const toRow = (e: FeestenEvent): string[] => [
    ...shared.map(h => sharedValue(h, e)),
    ...GF_EXTRA.map(([, get]) => get(e)),
  ]
  return { header, toRow }
}

/**
 * Full refresh of the `feesten` tab. Reads fb_events' header for the shared
 * column layout, then clears + rewrites all rows. Returns rows written.
 */
export async function fullRefreshToTab(
  events: FeestenEvent[],
  config: SheetsConfig,
): Promise<number> {
  if (!existsSync(config.credentialsPath)) {
    throw new Error(`Credentials not found at ${config.credentialsPath}`)
  }

  const { google } = await import('googleapis')
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  // 1. Derive shared layout from fb_events header (or fall back).
  const sourceTab = config.sourceTabName ?? 'fb_events'
  const fbHeader = await readHeaderRow(sheets, config.spreadsheetId, sourceTab)
  const sharedHeader = fbHeader.length > 0 ? fbHeader : FALLBACK_SHARED
  if (fbHeader.length > 0) {
    console.log(`  [sheets] Mirroring ${fbHeader.length} shared columns from "${sourceTab}"`)
  } else {
    console.log(`  [sheets] "${sourceTab}" header unreadable — using fallback layout`)
  }

  const { header, toRow } = buildLayout(sharedHeader)

  // 2. Ensure target tab, clear, rewrite.
  await ensureSheetExists(sheets, config.spreadsheetId, config.worksheetName)
  await withRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId: config.spreadsheetId,
      range: config.worksheetName,
    })
  )
  console.log(`  [sheets] Cleared "${config.worksheetName}"`)

  const values = [header, ...events.map(toRow)]
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: `${config.worksheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    })
  )

  console.log(`  [sheets] Wrote ${events.length} rows × ${header.length} cols to "${config.worksheetName}"`)
  return events.length
}
