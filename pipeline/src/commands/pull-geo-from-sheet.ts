import 'dotenv/config'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { log, logError } from '../lib/logger.js'
import { pullGeoFromSheet } from '../lib/pull-geo-from-sheet.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const configDir = resolve(__dirname, '../../config')

const spreadsheetId   = process.env.SPREADSHEET_ID
const credentialsPath = resolve(configDir, 'credentials.json')
const worksheetName   = 'Events'

if (!spreadsheetId) {
  log('PULL-GEO', 'SPREADSHEET_ID not set, skipping')
  process.exit(0)
}

if (!existsSync(credentialsPath)) {
  log('PULL-GEO', `credentials not found at ${credentialsPath}, skipping`)
  process.exit(0)
}

const storage = new JsonStorageAdapter(dataDir)

try {
  const updated = await pullGeoFromSheet(storage, {
    credentialsPath,
    spreadsheetId,
    worksheetName,
  })
  log('PULL-GEO', `${updated} events updated from sheet`)
} catch (err) {
  logError('PULL-GEO', err)
  process.exit(1)
}
