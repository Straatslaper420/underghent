import 'dotenv/config'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { loadRegistries } from '../lib/registry.js'
import { log, logError } from '../lib/logger.js'
import { pullFacebookFromSheet, MissingApprovedColumnError } from '../lib/pull-facebook-from-sheet.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const configDir = resolve(__dirname, '../../config')

// FB data uses the GOOGLE_* env convention (not pull-geo's SPREADSHEET_ID).
const spreadsheetId   = process.env.GOOGLE_SPREADSHEET_ID
const credentialsPath = process.env.GOOGLE_SHEETS_CREDENTIALS
const worksheetName   = 'fb_events_raw'

if (!spreadsheetId || !credentialsPath) {
  log('PULL-FB', 'GOOGLE_SPREADSHEET_ID and GOOGLE_SHEETS_CREDENTIALS must be set, skipping')
  process.exit(0)
}

const resolvedCreds = resolve(credentialsPath)
if (!existsSync(resolvedCreds)) {
  log('PULL-FB', `credentials not found at ${resolvedCreds}, skipping`)
  process.exit(0)
}

const storage    = new JsonStorageAdapter(dataDir)
const registries = loadRegistries(configDir)

try {
  const r = await pullFacebookFromSheet(storage, registries, {
    credentialsPath: resolvedCreds,
    spreadsheetId,
    worksheetName,
  })
  log('PULL-FB',
    `rows=${r.rowsInTab} approved=${r.approved} pulled=${r.pulled} ` +
    `venue-resolved=${r.venueResolved} venue-unresolved=${r.venueUnresolved} ` +
    `intra-fb-updated=${r.intraFbUpdated}`)
} catch (err) {
  if (err instanceof MissingApprovedColumnError) {
    log('PULL-FB', err.message)
    process.exit(1)
  }
  logError('PULL-FB', err)
  process.exit(1)
}
