import { readFileSync } from 'fs'
import { join } from 'path'
import { google } from 'googleapis'
import type { CanonicalEvent } from '../types/canonical.js'
import type { StorageAdapter } from '../types/storage.js'
import { log } from './logger.js'

export interface SheetsSyncConfig {
  credentialsPath: string
  spreadsheetId:   string
  worksheetName:   string
}

const REQUIRED_COLUMNS = ['event_id', 'latitude', 'longitude', 'address', 'status'] as const

export async function pullGeoFromSheet(
  storage: StorageAdapter,
  config: SheetsSyncConfig,
): Promise<number> {
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range:         `${config.worksheetName}!A1:AH`,
  })
  const rows = (res.data.values ?? []) as string[][]
  if (rows.length === 0) {
    log('PULL-GEO', 'sheet is empty')
    return 0
  }

  const headers = rows[0]
  const headerIndex: Record<string, number> = {}
  headers.forEach((h, i) => { headerIndex[h] = i })

  for (const col of REQUIRED_COLUMNS) {
    if (!(col in headerIndex)) {
      throw new Error(`missing required column "${col}" in worksheet "${config.worksheetName}"`)
    }
  }

  const idIdx      = headerIndex['event_id']
  const latIdx     = headerIndex['latitude']
  const lngIdx     = headerIndex['longitude']
  const addrIdx    = headerIndex['address']
  const statusIdx  = headerIndex['status']

  const events = await storage.readCanonical()
  const map = new Map<string, CanonicalEvent>()
  for (const e of events) map.set(e.event_id, e)

  let updatedCount = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const eventId = (row[idIdx] ?? '').trim()
    if (!eventId) continue
    const event = map.get(eventId)
    if (!event) continue

    const latStr    = (row[latIdx] ?? '').trim()
    const lngStr    = (row[lngIdx] ?? '').trim()
    const addrStr   = (row[addrIdx] ?? '').trim()
    const statusStr = (row[statusIdx] ?? '').trim()

    let dirty = false

    if (latStr !== '' && lngStr !== '') {
      const lat = parseFloat(latStr)
      const lng = parseFloat(lngStr)
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        if (event.latitude === null || event.longitude === null) {
          event.latitude  = lat
          event.longitude = lng
          dirty = true
        }
      }
    }

    if (addrStr !== '' && event.address === null) {
      event.address = addrStr
      dirty = true
    }

    if ((statusStr === 'approved' || statusStr === 'rejected') && event.status !== statusStr) {
      event.status = statusStr
      dirty = true
    }

    if (dirty) {
      updatedCount++
      map.set(eventId, event)
    }
  }

  await storage.writeCanonical(Array.from(map.values()))
  return updatedCount
}
