import 'dotenv/config'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadRegistries } from '../lib/registry.js'
import { exportVenuesToSheet } from '../export/sheets.js'
import { log, logError } from '../lib/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configDir = resolve(__dirname, '../../config')

const credPath  = process.env.GOOGLE_SHEETS_CREDENTIALS
const sheetId   = process.env.GOOGLE_SPREADSHEET_ID
const sheetName = process.env.GOOGLE_VENUES_WORKSHEET_NAME ?? 'Venues'

if (!credPath || !sheetId) {
  log('EXPORT-VENUES', 'GOOGLE_SHEETS_CREDENTIALS and GOOGLE_SPREADSHEET_ID must be set, skipping')
  process.exit(0)
}

const resolvedCreds = resolve(credPath)
if (!existsSync(resolvedCreds)) {
  log('EXPORT-VENUES', `credentials not found at ${resolvedCreds}, skipping`)
  process.exit(0)
}

try {
  const registries = loadRegistries(configDir)
  const venues = [...registries.venues.values()]
  const count = await exportVenuesToSheet(venues, {
    credentialsPath: resolvedCreds,
    spreadsheetId:   sheetId,
    worksheetName:   sheetName,
  })
  log('EXPORT-VENUES', `${count} venues exported to "${sheetName}" tab`)
} catch (err) {
  logError('EXPORT-VENUES', err)
  process.exit(1)
}
