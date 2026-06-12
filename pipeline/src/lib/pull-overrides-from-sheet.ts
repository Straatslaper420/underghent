import { readFileSync } from 'fs'
import { google } from 'googleapis'
import type { CanonicalEvent, EventOverrides } from '../types/canonical.js'
import type { StorageAdapter } from '../types/storage.js'
import { log } from './logger.js'

export interface OverridesSyncConfig {
  credentialsPath: string
  spreadsheetId:   string
  worksheetNames:  string[]   // typically ['Events', 'GeoFail']
}

// Human-owned columns read back into canonical.json each run. The pipeline
// NEVER writes these columns (see export/sheets.ts OVERRIDE_COLUMNS) — this is
// the only direction they travel: sheet → pipeline.
const OVERRIDE_READ_COLUMNS = [
  'venue_override', 'address_override',
  'latitude_override', 'longitude_override',
  'genre_override', 'hide', 'approved',
] as const

const truthy = (s: string): boolean => /^(true|1|yes|x|ja)$/i.test(s.trim())

function parseOverrides(
  row: string[],
  idx: Record<string, number>,
): EventOverrides | null {
  const cell = (name: string): string => {
    const i = idx[name]
    return i === undefined ? '' : String(row[i] ?? '').trim()
  }

  const o: EventOverrides = {}

  const venue = cell('venue_override')
  if (venue) o.venue = venue

  const address = cell('address_override')
  if (address) o.address = address

  const latStr = cell('latitude_override')
  const lngStr = cell('longitude_override')
  if (latStr !== '' && lngStr !== '') {
    const lat = parseFloat(latStr.replace(',', '.'))
    const lng = parseFloat(lngStr.replace(',', '.'))
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      o.latitude  = lat
      o.longitude = lng
    }
  }

  const genre = cell('genre_override')
  if (genre) o.genre = genre

  const hide = cell('hide')
  if (hide) o.hide = truthy(hide)

  const approved = cell('approved')
  if (approved) o.approved = truthy(approved)

  return Object.keys(o).length ? o : null
}

// Pull all human override columns from the given tabs back into canonical.json.
// Override values ALWAYS win downstream (effective* helpers) — unlike the old
// pull-geo, a correction of a WRONG value sticks, not just a fill of a blank.
export async function pullOverridesFromSheet(
  storage: StorageAdapter,
  config: OverridesSyncConfig,
): Promise<number> {
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const events = await storage.readCanonical()
  const map = new Map<string, CanonicalEvent>()
  for (const e of events) map.set(e.event_id, e)

  let touched = 0

  for (const tab of config.worksheetNames) {
    let rows: string[][] = []
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range:         `${tab}!A1:ZZ`,
      })
      rows = (res.data.values ?? []) as string[][]
    } catch {
      log('PULL-OVERRIDES', `tab "${tab}" unreadable/missing — skipping`)
      continue
    }
    if (rows.length < 2) continue

    const idx: Record<string, number> = {}
    rows[0].forEach((h, i) => { idx[String(h).trim()] = i })

    if (!('event_id' in idx)) {
      log('PULL-OVERRIDES', `tab "${tab}" has no event_id column — skipping`)
      continue
    }
    const hasAnyOverrideCol = OVERRIDE_READ_COLUMNS.some(c => c in idx)
    if (!hasAnyOverrideCol) {
      log('PULL-OVERRIDES', `tab "${tab}" has no override columns yet — skipping`)
      continue
    }

    for (let r = 1; r < rows.length; r++) {
      const eventId = String(rows[r][idx['event_id']] ?? '').trim()
      if (!eventId) continue
      const event = map.get(eventId)
      if (!event) continue

      const overrides = parseOverrides(rows[r], idx)
      const before = JSON.stringify(event.overrides ?? null)
      const after  = JSON.stringify(overrides)
      if (before !== after) {
        event.overrides = overrides
        touched++
      }
    }
  }

  await storage.writeCanonical(Array.from(map.values()))
  return touched
}
