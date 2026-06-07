import 'dotenv/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { exportJson } from '../export/json.js'
import { log, logError } from '../lib/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const storage   = new JsonStorageAdapter(dataDir)

// JSON export (always)
const outputPath = resolve(dataDir, 'events.json')
const count      = await exportJson(storage, outputPath)
log('EXPORT', `${count} events exported to events.json`)

// Google Sheets export (optional — only if env vars are set)
const credPath  = process.env.GOOGLE_SHEETS_CREDENTIALS
const sheetId   = process.env.GOOGLE_SPREADSHEET_ID
const sheetName = process.env.GOOGLE_WORKSHEET_NAME ?? 'Events'

if (credPath && sheetId) {
  try {
    const { exportSheets } = await import('../export/sheets.js')
    const events = await storage.readCanonical()
    const active = events.filter(e => e.status !== 'duplicate')
    const todayStr = new Date().toISOString().slice(0, 10)
    const future = active.filter(e => !e.date_start || e.date_start >= todayStr)
    await exportSheets(future, {
      credentialsPath: resolve(credPath),
      spreadsheetId:   sheetId,
      worksheetName:   sheetName,
    })
    log('EXPORT', `${future.length} events exported to Google Sheets`)
  } catch (err) {
    logError('EXPORT', err)
  }
} else {
  log('EXPORT', 'Google Sheets skipped (GOOGLE_SPREADSHEET_ID not set)')
}
