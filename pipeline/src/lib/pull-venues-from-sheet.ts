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
  updated: number  // existing venues whose fields changed
  added:   number  // sheet rows with an id not present locally
  removed: number  // local venues absent from the sheet (deleted �€� full mirror)
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

// Build a VenueRecord straight from a sheet row. Full mirror: the sheet is the
// source of truth, so blank/unparseable cells overwrite (no fallback to local).
function rowToVenue(row: string[], idx: Record<string, number>): VenueRecord {
  const cell = (name: string): string => (row[idx[name]] ?? '')
  const scrapeTypeRaw = cell('scrape_type').trim()
  const scrape_type = SCRAPE_TYPES.has(scrapeTypeRaw)
    ? (scrapeTypeRaw as VenueRecord['scrape_type'])
    : null
  return {
    id:                 cell('id').trim(),
    canonical_name:     cell('canonical_name').trim(),
    initials:           orNull(cell('initials')),
    aliases:            splitList(cell('aliases')),
    address:            orNull(cell('address')),
    lat:                numOrNull(cell('lat')),
    lng:                numOrNull(cell('lng')),
    underground_weight: numOrNull(cell('underground_weight')) ?? 0,
    genres:             splitList(cell('genres')),
    area:               orNull(cell('area')),
    website:            orNull(cell('website')),
    scrape_url:         orNull(cell('scrape_url')),
    scrape_type,
    hide:               /^(true|1|yes|x|ja)$/i.test(cell('hide').trim()),
  }
}

// Pull the Sheets "Venues" tab into config/venues.json as a full mirror.
// The sheet is the source of truth: it decides which venues exist and the exact
// value of every field. Blank cells overwrite local values (no fallback).
// Rows missing from the sheet are deleted locally. An empty or header-only sheet
// is refused as a safety guard to prevent accidental wipeout.
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
    range:         `${config.worksheetName}!A1:Z`,
  })
  const rows = (res.data.values ?? []) as string[][]
  if (rows.length < 2) {
    log('PULL-VENUES', `worksheet "${config.worksheetName}" empty or header-only �€� refusing to overwrite venues.json (full-mirror safety guard)`)
    return { updated: 0, added: 0, removed: 0 }
  }
  const headers = rows[0]
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => { idx[h.trim()] = i })
  if (!('id' in idx)) {
    throw new Error(`missing required column "id" in worksheet "${config.worksheetName}"`)
  }
  if (!('canonical_name' in idx)) {
    throw new Error(`missing required column "canonical_name" in worksheet "${config.worksheetName}" �€� refusing full-mirror overwrite`)
  }
  const venuesPath = join(configDir, 'venues.json')
  const file = JSON.parse(readFileSync(venuesPath, 'utf-8')) as { venues: VenueRecord[] }
  const oldById = new Map<string, VenueRecord>()
  file.venues.forEach(v => oldById.set(v.id, v))
  const next: VenueRecord[] = []
  const seen = new Set<string>()
  let updated = 0
  let added   = 0
  for (let r = 1; r < rows.length; r++) {
    const id = (rows[r][idx['id']] ?? '').trim()
    if (!id) continue
    if (seen.has(id)) {
      log('PULL-VENUES', `duplicate id "${id}" in sheet �€� keeping first occurrence`)
      continue
    }
    seen.add(id)
    const v = rowToVenue(rows[r], idx)
    next.push(v)
    const prev = oldById.get(id)
    if (prev === undefined) added++
    else if (JSON.stringify(v) !== JSON.stringify(prev)) updated++
  }
  const removed = file.venues.filter(v => !seen.has(v.id)).length
  if (JSON.stringify(file.venues) !== JSON.stringify(next)) {
    writeFileSync(venuesPath, JSON.stringify({ venues: next }, null, 2) + '\n', 'utf-8')
  }
  return { updated, added, removed }
}
