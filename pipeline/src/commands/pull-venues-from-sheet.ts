import 'dotenv/config'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { log, logError } from '../lib/logger.js'
import { pullVenuesFromSheet } from '../lib/pull-venues-from-sheet.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configDir = resolve(__dirname, '../../config')

const credPath  = process.env.GOOGLE_SHEETS_CREDENTIALS
const sheetId   = process.env.GOOGLE_SPREADSHEET_ID
const sheetName = process.env.GOOGLE_VENUES_WORKSHEET_NAME ?? 'Venues'

if (!credPath || !sheetId) {
  log('PULL-VENUES', 'GOOGLE_SHEETS_CREDENTIALS and GOOGLE_SPREADSHEET_ID must be set, skipping')
  process.exit(0)
}

const resolvedCreds = resolve(credPath)
if (!existsSync(resolvedCreds)) {
  log('PULL-VENUES', `credentials not found at ${resolvedCreds}, skipping`)
  process.exit(0)
}

try {
  const r = await pullVenuesFromSheet(configDir, {
    credentialsPath: resolvedCreds,
    spreadsheetId:   sheetId,
    worksheetName:   sheetName,
  })
  log('PULL-VENUES', `updated=${r.updated} added=${r.added} removed=${r.removed}`)
} catch (err) {
  logError('PULL-VENUES', err)
  process.exit(1)
}
