import 'dotenv/config'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { log, logError } from '../lib/logger.js'
import { pullOverridesFromSheet } from '../lib/pull-overrides-from-sheet.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const configDir = resolve(__dirname, '../../config')

// NOTE: the old pull-geo command read SPREADSHEET_ID, which is not a key in
// .env (it defines GOOGLE_SPREADSHEET_ID) — so it silently skipped on every
// run. This command uses the same env vars as export.
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS
  ? resolve(process.env.GOOGLE_SHEETS_CREDENTIALS)
  : resolve(configDir, 'credentials.json')
const worksheetName = process.env.GOOGLE_WORKSHEET_NAME ?? 'Events'

if (!spreadsheetId) {
  log('PULL-OVERRIDES', 'GOOGLE_SPREADSHEET_ID not set, skipping')
  process.exit(0)
}

if (!existsSync(credentialsPath)) {
  log('PULL-OVERRIDES', `credentials not found at ${credentialsPath}, skipping`)
  process.exit(0)
}

const storage = new JsonStorageAdapter(dataDir)

try {
  const touched = await pullOverridesFromSheet(storage, {
    credentialsPath,
    spreadsheetId,
    worksheetNames: [worksheetName, 'GeoFail'],
  })
  log('PULL-OVERRIDES', `${touched} events updated with human overrides from sheet`)
} catch (err) {
  logError('PULL-OVERRIDES', err)
  process.exit(1)
}
