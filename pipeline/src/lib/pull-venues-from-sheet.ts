import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { google } from 'googleapis'
import type { VenueRecord } from '../types/registry.js'
import { log } from './logger.js'

export interface VenuesSyncConfig {
  credentialsPath: string
  spreadsheetId:   string
  worksheetName:   string
}

export interface PullVenuesResult {
  updated: number  // existing venues whose fields changed from the sheet
  added:   number  // rows with an id not present locally
  missing: number  // local venues with no matching row in the sheet (kept as-is)
}

const SCRAPE_TYPES = new Set(['html', 'ical', 'json', 'playwright'])

const splitList = (s: string): string[] =>
  s.split(',').map(x => x.trim()).filter(x => x.length > 0)

const orNull = (s: string): string | null => {
  const t = s.trim()
  return t === '' ? null : t
}

const numOrNull = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = parseFloat(t)
  return Number.isNaN(n) ? null : n
}

// Build a VenueRecord from a sheet row, falling back to the existing record for
// any field the sheet leaves blank or can't parse (least-destructive merge).
function rowToVenue(
  row: string[],
  idx: Record<string, number>,
  existing: VenueRecord | undefined,
): VenueRecord {
  const cell = (name: string): string => (row[idx[name]] ?? '')

  const scrapeTypeRaw = cell('scrape_type').trim()
  const scrapeType = SCRAPE_TYPES.has(scrapeTypeRaw)
    ? (scrapeTypeRaw as VenueRecord['scrape_type'])
    : (scrapeTypeRaw === '' ? (existing?.scrape_type ?? null) : null)

  const aliases = splitList(cell('aliases'))
  const genres  = splitList(cell('genres'))
  const weight  = numOrNull(cell('underground_weight'))

  return {
    id:                 cell('id').trim() || existing?.id || '',
    canonical_name:     cell('canonical_name').trim() || existing?.canonical_name || '',
    aliases:            aliases.length > 0 ? aliases : (existing?.aliases ?? []),
    address:            orNull(cell('address')),
    lat:                numOrNull(cell('lat')),
    lng:                numOrNull(cell('lng')),
    underground_weight: weight ?? existing?.underground_weight ?? 0,
    genres:             genres.length > 0 ? genres : (existing?.genres ?? []),
    area:               orNull(cell('area')),
    website:            orNull(cell('website')),
    scrape_url:         orNull(cell('scrape_url')),
    scrape_type:        scrapeType,
  }
}

// Pull manual edits from the Venues tab back into config/venues.json.
// Merges by `id`: matching venues are updated in place (preserving file order),
// rows with a new id are appended, and local venues missing from the sheet are
// kept untouched (never deleted) so a stray blank row can't wipe data.
export async function pullVenuesFromSheet(
  configDir: string,
  config: VenuesSyncConfig,
): Promise<PullVenuesResult> {
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range:         `${config.worksheetName}!A1:L`,
  })
  const rows = (res.data.values ?? []) as string[][]
  if (rows.length < 2) {
    log('PULL-VENUES', `worksheet "${config.worksheetName}" empty or header-only — nothing to pull`)
    return { updated: 0, added: 0, missing: 0 }
  }

  const headers = rows[0]
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => { idx[h.trim()] = i })
  if (!('id' in idx)) {
    throw new Error(`missing required column "id" in worksheet "${config.worksheetName}"`)
  }

  const venuesPath = join(configDir, 'venues.json')
  const file = JSON.parse(readFileSync(venuesPath, 'utf-8')) as { venues: VenueRecord[] }
  const local = file.venues
  const byId = new Map<string, number>()
  local.forEach((v, i) => byId.set(v.id, i))

  const seen = new Set<string>()
  let updated = 0
  let added   = 0

  for (let r = 1; r < rows.length; r++) {
    const id = (rows[r][idx['id']] ?? '').trim()
    if (!id) continue
    seen.add(id)

    const pos = byId.get(id)
    if (pos === undefined) {
      local.push(rowToVenue(rows[r], idx, undefined))
      added++
    } else {
      const merged = rowToVenue(rows[r], idx, local[pos])
      if (JSON.stringify(merged) !== JSON.stringify(local[pos])) {
        local[pos] = merged
        updated++
      }
    }
  }

  const missing = local.filter(v => !seen.has(v.id)).length

  if (updated > 0 || added > 0) {
    writeFileSync(venuesPath, JSON.stringify({ venues: local }, null, 2) + '\n', 'utf-8')
  }

  return { updated, added, missing }
}
