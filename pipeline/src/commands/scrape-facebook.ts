import 'dotenv/config'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { loadRegistries } from '../lib/registry.js'
import { normalizeFacebook } from '../pipeline/normalize.js'
import { genreEnricher } from '../pipeline/enrichers/genre.js'
import { scrapeFacebook } from '../scrapers/aggregators/facebook.js'
import { log } from '../lib/logger.js'
import type { FacebookConfig } from '../scrapers/aggregators/facebook.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const configDir = resolve(__dirname, '../../config')

// Staging tab for raw, un-deduped Facebook rows
const FB_EVENTS_RAW_TAB = 'fb_events_raw'

// Heuristic: does a "venue" string actually look like a street address?
const STREET_WORDS = ['straat', 'laan', 'weg', 'plein', 'kaai', 'dijk', 'lei', 'steenweg', 'dreef']
function looksLikeAddress(venue: string): boolean {
  const v = venue.toLowerCase()
  const hasDigit        = /\d/.test(v)
  const hasStreetWord   = STREET_WORDS.some(w => v.includes(w))
  const hasPostcodeComma = /,\s*\d{4}/.test(v) // e.g. ", 9000" / ", 9050"
  return (hasDigit && hasStreetWord) || hasPostcodeComma
}

const toSheet = process.argv.includes('--to-sheet')

const config = JSON.parse(
  readFileSync(resolve(configDir, 'facebook.json'), 'utf-8'),
) as FacebookConfig

const storage = new JsonStorageAdapter(dataDir)
const raw     = await scrapeFacebook(config)

if (!toSheet) {
  // (A) pipeline mode ‚‚Ç¨î write raw items for normalize‚Üí‚‚Ç¨¶‚Üíexport to pick up
  await storage.writeRaw('facebook', raw)
  log('FACEBOOK', `${raw.length} raw events written to data/raw/facebook.json`)
} else {
  // (B) standalone ‚‚Ç¨î normalize, enrich genres, append ALL rows to the staging tab
  const registries = loadRegistries(configDir)
  const normalized = normalizeFacebook(raw, registries)

  for (const event of normalized) {
    // Genre/subgenre via keyword + alias matching only (no AI classifier).
    const res = await genreEnricher.enrich(event, { registries, dataDir })
    event.genre    = res.genre ?? null
    event.subgenre = res.subgenre ?? null

    // Venue vs address split (staging heuristic).
    if (event.venue && looksLikeAddress(event.venue)) {
      event.address = event.venue
      event.venue   = ''
    }

    // Staging tab leaves identity columns blank.
    event.event_id = ''
    event.venue_id = ''
  }

  const credPath = process.env.GOOGLE_SHEETS_CREDENTIALS
  const sheetId  = process.env.GOOGLE_SPREADSHEET_ID
  if (!credPath || !sheetId) {
    throw new Error('GOOGLE_SHEETS_CREDENTIALS and GOOGLE_SPREADSHEET_ID must be set for --to-sheet')
  }

  const { upsertEventsToTab } = await import('../export/sheets.js')
  const { updated, appended } = await upsertEventsToTab(normalized, {
    credentialsPath: resolve(credPath),
    spreadsheetId:   sheetId,
    worksheetName:   FB_EVENTS_RAW_TAB,
  })
  log('FACEBOOK', `${updated} updated, ${appended} appended in "${FB_EVENTS_RAW_TAB}"`)
}
