import { readFileSync, existsSync } from 'fs'
import type { CanonicalEvent } from '../types/canonical.js'

export interface SheetsConfig {
  credentialsPath: string
  spreadsheetId:   string
  worksheetName:   string
}

const HEADERS = [
  'event_id', 'facebook_id', 'venue_id', 'aggregator_id',
  'title', 'date_start', 'hour_start',
  'venue', 'room', 'address', 'area', 'latitude', 'longitude',
  'genre', 'subgenre', 'artists', '',
  'source_url', 'ticket_url', 'price', 'details', 'description',
  'interested', 'going', 'city', 'country',
  'organizers', 'social_links', 'collective', 'status',
]

function flatten(event: CanonicalEvent): string[] {
  const n = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return String(v)
    return String(v)
  }
  return [
    n(event.event_id), n(event.facebook_id), n(event.venue_id), n(event.aggregator_id),
    n(event.title), n(event.date_start), n(event.hour_start),
    n(event.venue), n(event.room), n(event.address), n(event.area),
    n(event.latitude), n(event.longitude),
    n(event.genre), n(event.subgenre),
    Array.isArray(event.artists) ? event.artists.join(', ') : n(event.artists),
    '',
    n(event.source_url), n(event.ticket_url), n(event.price),
    n(event.details), n(event.description),
    n(event.interested), n(event.going),
    n(event.city), n(event.country),
    Array.isArray(event.organizers) ? event.organizers.join(', ') : n(event.organizers),
    Array.isArray(event.social_links) ? event.social_links.join('\n') : n(event.social_links),
    n(event.collective), n(event.status),
  ]
}

function isGeoMissing(event: CanonicalEvent): boolean {
  const empty = (v: unknown) =>
    v === null || v === undefined || v === '' || v === 0 || v === '0'
  return empty(event.latitude) || empty(event.longitude)
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

async function ensureSheetExists(
  sheets: Awaited<ReturnType<typeof import('googleapis')['google']['sheets']>>,
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

async function appendRows(
  sheets: Awaited<ReturnType<typeof import('googleapis')['google']['sheets']>>,
  spreadsheetId: string,
  worksheetName: string,
  rows: string[][],
  headers: string[],
): Promise<void> {
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!A1`,
  })
  const hasHeader = check.data.values && check.data.values.length > 0
  const allRows = hasHeader ? rows : [headers, ...rows]
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${worksheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: allRows },
    })
  )
}

// Read-only helper: collect event_ids already present in a worksheet (column A).
// Reuses the same credentials/spreadsheet env vars and googleapis auth as exportSheets.
export async function readExistingEventIds(worksheetName = 'Events'): Promise<Set<string>> {
  const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS
  const spreadsheetId   = process.env.GOOGLE_SPREADSHEET_ID
  if (!credentialsPath || !spreadsheetId) {
    throw new Error('GOOGLE_SHEETS_CREDENTIALS and GOOGLE_SPREADSHEET_ID must be set to read existing event ids')
  }
  if (!existsSync(credentialsPath)) {
    throw new Error(`Google Sheets credentials not found at ${credentialsPath}`)
  }

  const { google } = await import('googleapis')
  const creds = JSON.parse(readFileSync(credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

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
    // Worksheet may not exist yet (e.g. empty fb_events) — treat as no existing ids
  }
  return ids
}

// Upsert events into a worksheet, keying on facebook_id (column B).
// Matched rows are overwritten in place; new rows are appended in one batch.
export async function upsertEventsToTab(
  events: CanonicalEvent[],
  config: SheetsConfig,
): Promise<{ updated: number; appended: number }> {
  if (!existsSync(config.credentialsPath)) {
    throw new Error(`Google Sheets credentials not found at ${config.credentialsPath}`)
  }

  const { google } = await import('googleapis')
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  await ensureSheetExists(sheets, config.spreadsheetId, config.worksheetName)

  // Read existing facebook_ids from column B (row 2 onwards, header is row 1)
  const existingRes = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.worksheetName}!B2:B`,
    })
  )
  const fbIdToRow = new Map<string, number>()
  for (const [i, row] of (existingRes.data.values ?? []).entries()) {
    const fbId = row[0]
    if (fbId) fbIdToRow.set(String(fbId), i + 2)
  }

  const updateRanges: Array<{ range: string; values: string[][] }> = []
  const toAppend: CanonicalEvent[] = []
  let noIdCount = 0

  for (const event of events) {
    const fbId = event.facebook_id
    if (!fbId) {
      noIdCount++
      toAppend.push(event)
      continue
    }
    const row = fbIdToRow.get(fbId)
    if (row != null) {
      updateRanges.push({ range: `${config.worksheetName}!A${row}`, values: [flatten(event)] })
    } else {
      toAppend.push(event)
    }
  }

  if (noIdCount > 0) {
    console.warn(`upsertEventsToTab: ${noIdCount} events have no facebook_id — appending as new`)
  }

  if (updateRanges.length > 0) {
    await withRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: { valueInputOption: 'RAW', data: updateRanges },
      })
    )
  }

  if (toAppend.length > 0) {
    await appendRows(sheets, config.spreadsheetId, config.worksheetName, toAppend.map(flatten), HEADERS)
  }

  return { updated: updateRanges.length, appended: toAppend.length }
}

// Append every event to a single worksheet — no geo split, no dedup.
// Used by the Facebook --to-sheet staging path. Reuses the same auth,
// header row, sheet-creation and append helpers as exportSheets.
export async function appendEventsToTab(
  events: CanonicalEvent[],
  config: SheetsConfig,
): Promise<number> {
  if (!existsSync(config.credentialsPath)) {
    throw new Error(`Google Sheets credentials not found at ${config.credentialsPath}`)
  }

  const { google } = await import('googleapis')
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  await ensureSheetExists(sheets, config.spreadsheetId, config.worksheetName)
  await appendRows(sheets, config.spreadsheetId, config.worksheetName, events.map(flatten), HEADERS)
  return events.length
}

export async function exportSheets(
  events: CanonicalEvent[],
  config: SheetsConfig,
): Promise<number> {
  if (!existsSync(config.credentialsPath)) {
    throw new Error(`Google Sheets credentials not found at ${config.credentialsPath}`)
  }

  const { google } = await import('googleapis')
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const geoOk   = events.filter(e => !isGeoMissing(e))
  const geoFail = events.filter(isGeoMissing)

  console.log(`→ ${geoOk.length} with coords → "${config.worksheetName}"`)
  console.log(`→ ${geoFail.length} missing coords → "GeoFail"`)

  // Events tab: only events WITH coords
  await appendRows(sheets, config.spreadsheetId, config.worksheetName, geoOk.map(flatten), HEADERS)
  console.log(`✓ Wrote ${geoOk.length} to "${config.worksheetName}"`)

  // GeoFail tab: only events WITHOUT coords
  if (geoFail.length > 0) {
    await ensureSheetExists(sheets, config.spreadsheetId, 'GeoFail')
    await appendRows(sheets, config.spreadsheetId, 'GeoFail', geoFail.map(flatten), HEADERS)
    console.log(`✓ Wrote ${geoFail.length} to "GeoFail"`)
  }

  return events.length
}