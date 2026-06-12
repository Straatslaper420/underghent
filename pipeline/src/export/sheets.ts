import { readFileSync, existsSync } from 'fs'
import type { CanonicalEvent } from '../types/canonical.js'
import { effectiveLat, effectiveLng } from '../types/canonical.js'
import type { VenueRecord } from '../types/registry.js'

export interface SheetsConfig {
  credentialsPath: string
  spreadsheetId:   string
  worksheetName:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-COLUMN OWNERSHIP MODEL (v5)
//
// The pipeline owns the AUTO columns below and rewrites them freely on every
// run, addressed BY HEADER NAME (never by position). The OVERRIDE columns are
// human-owned: the pipeline ensures they exist, but NEVER writes a value into
// them — every write request is built from AUTO_COLUMNS only, so clobbering an
// override is structurally impossible. Unknown human-added columns are
// likewise untouched (they're simply absent from the write map).
// ─────────────────────────────────────────────────────────────────────────────

// Auto columns in append order for brand-new sheets. Existing sheets keep
// whatever order they have; missing columns get appended on the right.
const AUTO_COLUMNS = [
  'event_id', 'facebook_id', 'venue_id', 'aggregator_id',
  'title', 'date_start', 'hour_start',
  'venue', 'room', 'address', 'area', 'latitude', 'longitude',
  'genre', 'subgenre', 'artists',
  'source_url', 'ticket_url', 'price', 'details', 'description',
  'interested', 'going', 'city', 'country',
  'organizers', 'social_links', 'collective', 'status',
  // v5 additions:
  'source', 'hour_end', 'support_acts', 'image_url', 'genre_raw', 'last_seen',
] as const

// Human-owned columns: ensured to exist, never written.
export const OVERRIDE_COLUMNS = [
  'venue_override', 'address_override',
  'latitude_override', 'longitude_override',
  'genre_override', 'hide', 'approved', 'notes',
] as const

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// Value of one auto column for one event. '' clears a stale cell; only auto
// cells are ever part of a write.
function autoValue(event: CanonicalEvent, column: string): string {
  const n = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
  switch (column) {
    case 'event_id':      return n(event.event_id)
    case 'facebook_id':   return n(event.facebook_id)
    case 'venue_id':      return n(event.venue_id)
    case 'aggregator_id': return n(event.aggregator_id)
    case 'title':         return n(event.title)
    case 'date_start':    return n(event.date_start)
    case 'hour_start':    return n(event.hour_start)
    case 'hour_end':      return n(event.hour_end)
    case 'venue':         return n(event.venue)
    case 'room':          return n(event.room)
    case 'address':       return n(event.address)
    case 'area':          return n(event.area)
    case 'latitude':      return n(event.latitude)
    case 'longitude':     return n(event.longitude)
    case 'genre':         return n(event.genre)
    case 'subgenre':      return n(event.subgenre)
    case 'genre_raw':     return n(event.genre_raw)
    case 'artists':       return Array.isArray(event.artists) ? event.artists.join(', ') : n(event.artists)
    case 'support_acts':  return Array.isArray(event.support_acts) ? event.support_acts.join(', ') : n(event.support_acts)
    case 'image_url':     return n(event.image_url)
    case 'source':        return n(event.source)
    case 'source_url':    return n(event.source_url)
    case 'ticket_url':    return n(event.ticket_url)
    case 'price':         return n(event.price)
    case 'details':       return n(event.details)
    case 'description':   return n(event.description)
    case 'interested':    return n(event.interested)
    case 'going':         return n(event.going)
    case 'city':          return n(event.city)
    case 'country':       return n(event.country)
    case 'organizers':    return Array.isArray(event.organizers) ? event.organizers.join(', ') : n(event.organizers)
    case 'social_links':  return Array.isArray(event.social_links) ? event.social_links.join('\n') : n(event.social_links)
    case 'collective':    return n(event.collective)
    case 'status':        return n(event.status)
    case 'last_seen':     return todayIso()
    default:              return ''
  }
}

function isGeoMissing(event: CanonicalEvent): boolean {
  const empty = (v: unknown) =>
    v === null || v === undefined || v === '' || v === 0 || v === '0'
  // Effective coords: a human latitude_override/longitude_override rescues an
  // event from GeoFail on the next run.
  return empty(effectiveLat(event)) || empty(effectiveLng(event))
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 429 && attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

type SheetsApi = Awaited<ReturnType<typeof import('googleapis')['google']['sheets']>>

async function getSheetsClient(config: SheetsConfig): Promise<SheetsApi> {
  if (!existsSync(config.credentialsPath)) {
    throw new Error(`Google Sheets credentials not found at ${config.credentialsPath}`)
  }
  const { google } = await import('googleapis')
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

async function ensureSheetExists(
  sheets: SheetsApi,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === sheetTitle)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
    })
  }
}

function colLetter(i: number): string {
  let s = ''
  let x = i
  while (x >= 0) {
    s = String.fromCharCode((x % 26) + 65) + s
    x = Math.floor(x / 26) - 1
  }
  return s
}

// Read the header row; append any missing auto/override columns on the RIGHT
// (existing order/positions are preserved so human layouts survive).
// Returns name → 0-based column index.
async function ensureHeaders(
  sheets: SheetsApi,
  spreadsheetId: string,
  tab: string,
): Promise<Record<string, number>> {
  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` })
  )
  const existing = ((res.data.values?.[0] ?? []) as string[]).map(h => String(h).trim())
  const have = new Set(existing.filter(Boolean))
  const wanted = [...AUTO_COLUMNS, ...OVERRIDE_COLUMNS]
  const missing = wanted.filter(c => !have.has(c))

  const header = existing.length ? [...existing, ...missing] : [...wanted]
  if (missing.length || !existing.length) {
    await withRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [header] },
      })
    )
  }

  const map: Record<string, number> = {}
  header.forEach((h, i) => { if (h) map[h] = i })
  return map
}

// One full-width row for a values write: AUTO cells get their value, every
// other cell is null. The Sheets API SKIPS null cells on update, so override
// and human-added columns are physically left alone.
function buildAutoRow(
  event: CanonicalEvent,
  headerMap: Record<string, number>,
  width: number,
): (string | null)[] {
  const row: (string | null)[] = new Array(width).fill(null)
  for (const col of AUTO_COLUMNS) {
    const idx = headerMap[col]
    if (idx === undefined) continue
    row[idx] = autoValue(event, col)
  }
  return row
}

interface UpsertResult { updated: number; appended: number; gone: number }

// Generic named-column upsert. keyColumn identifies rows ('event_id' for
// Events/GeoFail, 'facebook_id' for fb tabs).
async function upsertByName(
  sheets: SheetsApi,
  spreadsheetId: string,
  tab: string,
  events: CanonicalEvent[],
  keyColumn: 'event_id' | 'facebook_id',
  opts: { markGone?: boolean; movedKeys?: Set<string> } = {},
): Promise<UpsertResult> {
  await ensureSheetExists(sheets, spreadsheetId, tab)
  const headerMap = await ensureHeaders(sheets, spreadsheetId, tab)
  const width = Math.max(...Object.values(headerMap)) + 1

  const keyIdx    = headerMap[keyColumn]
  const dateIdx   = headerMap['date_start']
  const statusIdx = headerMap['status']

  // Existing rows: key → 1-based sheet row number (+ date/status for gone-marking)
  const gridRes = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A2:${colLetter(width - 1)}`,
    })
  )
  const grid = (gridRes.data.values ?? []) as string[][]
  const keyToRow = new Map<string, number>()
  const rowMeta  = new Map<number, { date: string; status: string }>()
  grid.forEach((row, i) => {
    const key = String(row[keyIdx] ?? '').trim()
    if (!key || keyToRow.has(key)) return
    keyToRow.set(key, i + 2)
    rowMeta.set(i + 2, {
      date:   String(row[dateIdx] ?? '').trim(),
      status: String(row[statusIdx] ?? '').trim(),
    })
  })

  const data: Array<{ range: string; values: (string | null)[][] }> = []
  const toAppend: CanonicalEvent[] = []
  const currentKeys = new Set<string>()

  for (const event of events) {
    const key = keyColumn === 'event_id' ? event.event_id : event.facebook_id
    if (!key) { toAppend.push(event); continue }
    currentKeys.add(key)
    const rowNum = keyToRow.get(key)
    if (rowNum !== undefined) {
      data.push({ range: `${tab}!A${rowNum}`, values: [buildAutoRow(event, headerMap, width)] })
    } else {
      toAppend.push(event)
    }
  }

  // Rows that vanished from the current future set → status 'gone' (kept, so
  // any human overrides on them survive). Only future-dated rows qualify;
  // past rows are history, not "gone".
  let gone = 0
  if (opts.markGone && statusIdx !== undefined) {
    const today = todayIso()
    for (const [key, rowNum] of keyToRow) {
      if (currentKeys.has(key)) continue
      const meta = rowMeta.get(rowNum)
      if (!meta || meta.date < today) continue
      const newStatus = opts.movedKeys?.has(key) ? 'moved' : 'gone'
      if (meta.status === newStatus) continue
      data.push({
        range: `${tab}!${colLetter(statusIdx)}${rowNum}`,
        values: [[newStatus]],
      })
      gone++
    }
  }

  if (data.length > 0) {
    // Chunk batch updates to stay under request-size limits
    const CHUNK = 200
    for (let i = 0; i < data.length; i += CHUNK) {
      await withRetry(() =>
        sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data: data.slice(i, i + CHUNK) },
        })
      )
    }
  }

  if (toAppend.length > 0) {
    const rows = toAppend.map(e => buildAutoRow(e, headerMap, width).map(v => v ?? ''))
    await withRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      })
    )
  }

  return { updated: data.length - gone, appended: toAppend.length, gone }
}

// ── Main export: Events + GeoFail, both upserted by event_id ────────────────
export async function exportSheets(
  events: CanonicalEvent[],
  config: SheetsConfig,
): Promise<number> {
  const sheets = await getSheetsClient(config)

  const geoOk   = events.filter(e => !isGeoMissing(e))
  const geoFail = events.filter(isGeoMissing)

  console.log(`→ ${geoOk.length} with coords → "${config.worksheetName}" (upsert)`)
  console.log(`→ ${geoFail.length} missing coords → "GeoFail" (upsert)`)

  const evRes = await upsertByName(
    sheets, config.spreadsheetId, config.worksheetName, geoOk, 'event_id',
    { markGone: true },
  )
  console.log(`✓ "${config.worksheetName}": ${evRes.updated} updated, ${evRes.appended} appended, ${evRes.gone} marked gone/moved`)

  // Events that gained coords (e.g. via latitude_override) move out of
  // GeoFail: their old GeoFail rows get status 'moved'.
  const movedKeys = new Set(geoOk.map(e => e.event_id))
  const gfRes = await upsertByName(
    sheets, config.spreadsheetId, 'GeoFail', geoFail, 'event_id',
    { markGone: true, movedKeys },
  )
  console.log(`✓ "GeoFail": ${gfRes.updated} updated, ${gfRes.appended} appended, ${gfRes.gone} marked gone/moved`)

  return events.length
}

// ── Read-only helper: collect event_ids already present in a worksheet ──────
export async function readExistingEventIds(worksheetName = 'Events'): Promise<Set<string>> {
  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS
  const spreadsheetId   = process.env.GOOGLE_SPREADSHEET_ID
  if (!credentialsPath || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CREDENTIALS and GOOGLE_SPREADSHEET_ID must be set to read existing event ids')
  }
  const sheets = await getSheetsClient({ credentialsPath, spreadsheetId, worksheetName })
  const ids = new Set<string>()
  try {
    const res = await withRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${worksheetName}!A2:A` })
    )
    for (const row of res.data.values ?? []) {
      const id = row[0]
      if (id) ids.add(String(id))
    }
  } catch {
    // Worksheet may not exist yet — treat as no existing ids
  }
  return ids
}

// ── FB tabs ──────────────────────────────────────────────────────────────────
// Upsert keyed on facebook_id; same ownership rules as the Events tab.
export async function upsertEventsToTab(
  events: CanonicalEvent[],
  config: SheetsConfig,
): Promise<{ updated: number; appended: number }> {
  const sheets = await getSheetsClient(config)
  const res = await upsertByName(
    sheets, config.spreadsheetId, config.worksheetName, events, 'facebook_id',
  )
  return { updated: res.updated, appended: res.appended }
}

// Append-only staging path (fb_events_raw): keeps every scrape visible for
// the human approval gate. Header is name-ensured like everywhere else.
export async function appendEventsToTab(
  events: CanonicalEvent[],
  config: SheetsConfig,
): Promise<number> {
  const sheets = await getSheetsClient(config)
  await ensureSheetExists(sheets, config.spreadsheetId, config.worksheetName)
  const headerMap = await ensureHeaders(sheets, config.spreadsheetId, config.worksheetName)
  const width = Math.max(...Object.values(headerMap)) + 1
  const rows = events.map(e => buildAutoRow(e, headerMap, width).map(v => v ?? ''))
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${config.worksheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })
  )
  return events.length
}

// ── Venue registry export ────────────────────────────────────────────────────
// One row per venue from config/venues.json, every field a column.
// Full refresh (clear + rewrite): the Venues tab round-trips BOTH ways via
// pull-venues, so unlike the Events tab there is no machine/human column split
// — the whole tab is the shared source of truth.

const VENUE_HEADERS = [
  'id', 'canonical_name', 'initials', 'aliases', 'address', 'lat', 'lng',
  'underground_weight', 'genres', 'area', 'website', 'scrape_url', 'scrape_type',
  'hide',
]

function flattenVenue(v: VenueRecord): string[] {
  const n = (val: unknown): string => (val === null || val === undefined ? '' : String(val))
  return [
    n(v.id), n(v.canonical_name), n(v.initials),
    v.aliases.join(', '),
    n(v.address), n(v.lat), n(v.lng),
    n(v.underground_weight),
    v.genres.join(', '),
    n(v.area), n(v.website), n(v.scrape_url), n(v.scrape_type),
    v.hide ? 'TRUE' : '',
  ]
}

export async function exportVenuesToSheet(
  venues: VenueRecord[],
  config: SheetsConfig,
): Promise<number> {
  const sheets = await getSheetsClient(config)
  await ensureSheetExists(sheets, config.spreadsheetId, config.worksheetName)

  const values = [VENUE_HEADERS, ...venues.map(flattenVenue)]

  await withRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId: config.spreadsheetId,
      range:         config.worksheetName,
    })
  )
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId:    config.spreadsheetId,
      range:            `${config.worksheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody:      { values },
    })
  )

  return venues.length
}
