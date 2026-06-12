import { readFileSync } from 'fs'
import { google } from 'googleapis'
import { CanonicalEventSchema } from '../types/canonical.js'
import { makeEventId, resolveVenue } from '../pipeline/normalize.js'
import { log } from './logger.js'
import type { CanonicalEvent } from '../types/canonical.js'
import type { Registries } from '../types/registry.js'
import type { StorageAdapter } from '../types/storage.js'

export interface PullFacebookConfig {
  credentialsPath: string
  spreadsheetId:   string
  worksheetName:   string
}

export interface PullFacebookResult {
  rowsInTab:       number
  approved:        number
  pulled:          number
  venueResolved:   number
  venueUnresolved: number
  intraFbUpdated:  number
}

// Raised when the manually-added `approved` column is missing from the tab.
// The command catches this to print an actionable message and pull nothing.
export class MissingApprovedColumnError extends Error {
  constructor(worksheetName: string) {
    super(`no 'approved' column found in ${worksheetName} �€� add it and mark rows`)
    this.name = 'MissingApprovedColumnError'
  }
}

const APPROVED_VALUES = new Set(['yes', 'true', 'y', 'x', '1', 'approved'])

function isApproved(value: string): boolean {
  return APPROVED_VALUES.has(value.trim().toLowerCase())
}

function parseNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

function parseInt2(s: string): number | null {
  const n = parseNum(s)
  return n === null ? null : Math.trunc(n)
}

function parseList(s: string, sep: string): string[] {
  return s.split(sep).map(x => x.trim()).filter(Boolean)
}

export async function pullFacebookFromSheet(
  storage: StorageAdapter,
  registries: Registries,
  config: PullFacebookConfig,
): Promise<PullFacebookResult> {
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  // Wide range so the user's manually-added `approved` column (beyond AD) is read.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range:         `${config.worksheetName}!A1:AZ`,
  })
  const rows = (res.data.values ?? []) as string[][]
  if (rows.length === 0) {
    log('PULL-FB', 'sheet is empty')
    return { rowsInTab: 0, approved: 0, pulled: 0, venueResolved: 0, venueUnresolved: 0, intraFbUpdated: 0 }
  }

  // Build a case-insensitive, trimmed header index.
  const headers = rows[0]
  const headerIndex: Record<string, number> = {}
  headers.forEach((h, i) => { headerIndex[(h ?? '').trim().toLowerCase()] = i })

  if (!('approved' in headerIndex)) {
    throw new MissingApprovedColumnError(config.worksheetName)
  }
  const approvedIdx = headerIndex['approved']

  // Column accessor by header name (returns trimmed string, '' if column absent).
  const cell = (row: string[], name: string): string => {
    const idx = headerIndex[name]
    if (idx === undefined) return ''
    return (row[idx] ?? '').trim()
  }

  const existing = await storage.readCanonical()
  const byId = new Map<string, CanonicalEvent>()
  for (const e of existing) byId.set(e.event_id, e)

  const dataRows = rows.slice(1)
  let approved = 0
  let pulled = 0
  let venueResolved = 0
  let venueUnresolved = 0
  let intraFbUpdated = 0

  for (const row of dataRows) {
    if (!isApproved((row[approvedIdx] ?? ''))) continue
    approved++

    const title      = cell(row, 'title')
    const dateStart  = cell(row, 'date_start')
    if (!title || !dateStart) {
      log('PULL-FB', `WARN approved row missing title/date �€� skipped (title="${title}", date="${dateStart}")`)
      continue
    }

    // Re-mint id identically to the direct FB pipeline path: source = 'facebook'.
    const eventId = makeEventId('facebook', title, dateStart)

    // Prefer good values already on the row (FB enrich); fall back to registry resolve.
    const sheetVenue = cell(row, 'venue') || null
    const resolved   = resolveVenue(sheetVenue, registries)
    const sheetLat   = parseNum(cell(row, 'latitude'))
    const sheetLng   = parseNum(cell(row, 'longitude'))
    const sheetAddr  = cell(row, 'address') || null
    const sheetArea  = cell(row, 'area') || null
    const sheetVid   = cell(row, 'venue_id') || null

    const venue_id   = sheetVid  ?? resolved.venue_id
    const venue      = (sheetVenue ?? resolved.venue) ?? null
    const address    = sheetAddr  ?? resolved.address
    const latitude   = sheetLat   ?? resolved.latitude
    const longitude  = sheetLng   ?? resolved.longitude
    const area       = sheetArea  ?? resolved.area

    if (venue_id !== null) venueResolved++
    else venueUnresolved++

    const sheetStatus = cell(row, 'status')
    const status = sheetStatus !== '' ? sheetStatus : 'pending'

    const event: CanonicalEvent = {
      event_id:      eventId,
      facebook_id:   cell(row, 'facebook_id') || null,
      venue_id,
      aggregator_id: cell(row, 'aggregator_id') || null,
      title,
      date_start:    dateStart,
      hour_start:    cell(row, 'hour_start') || null,
      hour_end:      cell(row, 'hour_end') || null,
      venue,
      room:          cell(row, 'room') || null,
      address,
      area,
      latitude,
      longitude,
      genre:         cell(row, 'genre') || null,
      subgenre:      cell(row, 'subgenre') || null,
      genre_raw:     cell(row, 'genre_raw') || null,
      artists:       parseList(cell(row, 'artists'), ','),
      support_acts:  parseList(cell(row, 'support_acts'), ','),
      image_url:     cell(row, 'image_url') || null,
      source:        'facebook',
      source_url:    cell(row, 'source_url') || null,
      ticket_url:    cell(row, 'ticket_url') || null,
      price:         cell(row, 'price') || null,
      details:       cell(row, 'details') || null,
      description:   cell(row, 'description') || null,
      interested:    parseInt2(cell(row, 'interested')),
      going:         parseInt2(cell(row, 'going')),
      city:          cell(row, 'city') || null,
      country:       cell(row, 'country') || null,
      organizers:    parseList(cell(row, 'organizers'), ','),
      social_links:  parseList(cell(row, 'social_links'), '\n'),
      collective:    cell(row, 'collective') || null,
      status,
    }

    const parsed = CanonicalEventSchema.safeParse(event)
    if (!parsed.success) {
      log('PULL-FB', `WARN skipped invalid approved row: "${title}" �€� ${parsed.error.errors[0]?.message}`)
      continue
    }
    const valid = parsed.data as CanonicalEvent

    // Intra-FB: same FB event pulled before / direct-scraped �€� overwrite, don't duplicate.
    // (event_id includes source='facebook', so this can never collide with a venue row.)
    if (byId.has(valid.event_id)) intraFbUpdated++
    byId.set(valid.event_id, valid)
    pulled++
  }

  await storage.writeCanonical(Array.from(byId.values()))

  return {
    rowsInTab: dataRows.length,
    approved,
    pulled,
    venueResolved,
    venueUnresolved,
    intraFbUpdated,
  }
}
