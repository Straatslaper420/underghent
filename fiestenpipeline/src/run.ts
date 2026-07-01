/**
 * fiestenpipeline entry point — Gentse Feesten 2026 scraper.
 *
 * Subcommands (see package.json scripts):
 *   scrape   crawl day pages + detail pages → write data/feesten.json
 *   geocode  read data/feesten.json → backfill coords for off-map events
 *            that have an address (Nominatim, cached) → write it back
 *   export   read data/feesten.json → full-refresh the `feesten` tab
 *   run      scrape, geocode, then export
 *   dev      alias of scrape
 *
 * Env (.env):
 *   GOOGLE_SHEETS_CREDENTIALS  path to service-account JSON (relative to this folder)
 *   GOOGLE_SPREADSHEET_ID      target spreadsheet ID
 *   FEESTEN_WORKSHEET_NAME     target tab name (default: "feesten")
 *   FB_SOURCE_TAB_NAME         header-source tab name (default: "fb_events")
 *
 * NOTE: standalone. Never wired into the main `npm run pipeline` chain.
 */

import 'dotenv/config'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { scrapeListings } from './scrape.js'
import { fetchDetail } from './detail.js'
import { concurrentMap } from './http.js'
import { geocodeMissing } from './geocode.js'
import { applyVenueCoordFixes } from './corrections.js'
import { fullRefreshToTab } from './sheets.js'
import type { FeestenEvent } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'data')
const JSON_OUT = resolve(DATA_DIR, 'feesten.json')

const CONCURRENCY = 4

async function scrape(): Promise<FeestenEvent[]> {
  console.log('\n[1/2] Crawling day listings (days 17–26)…')
  const nodes = await scrapeListings()
  const refs = [...nodes.values()]
  console.log(`  → ${refs.length} unique events to fetch`)

  console.log('\n[2/2] Fetching detail pages…')
  let done = 0
  const events = await concurrentMap(
    refs,
    async ref => {
      const ev = await fetchDetail(ref.detailUrl, [...ref.days])
      done++
      if (done % 25 === 0 || done === refs.length) {
        console.log(`  parsed ${done}/${refs.length}`)
      }
      return ev
    },
    CONCURRENCY,
  )

  applyVenueCoordFixes(events)

  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(JSON_OUT, JSON.stringify(events, null, 2), 'utf-8')
  console.log(`\n✓ Wrote ${events.length} events → ${JSON_OUT}`)
  return events
}

async function geocodeStage(events?: FeestenEvent[]): Promise<FeestenEvent[]> {
  let evs = events
  if (!evs) {
    if (!existsSync(JSON_OUT)) {
      console.error(`\n✗ ${JSON_OUT} not found — run "npm run scrape" first.`)
      process.exit(1)
    }
    evs = JSON.parse(readFileSync(JSON_OUT, 'utf-8')) as FeestenEvent[]
  }
  console.log('\n[geo] Backfilling coordinates for off-map events with an address…')
  await geocodeMissing(evs)
  applyVenueCoordFixes(evs) // re-assert known-good coords in case a scrape wrote a bad one
  writeFileSync(JSON_OUT, JSON.stringify(evs, null, 2), 'utf-8')
  console.log(`✓ Wrote geocoded events → ${JSON_OUT}`)
  return evs
}

async function exportToSheet(): Promise<void> {
  if (!existsSync(JSON_OUT)) {
    console.error(`\n✗ ${JSON_OUT} not found — run "npm run scrape" first.`)
    process.exit(1)
  }
  const events = JSON.parse(readFileSync(JSON_OUT, 'utf-8')) as FeestenEvent[]
  console.log(`\nExporting ${events.length} events from ${JSON_OUT}`)

  const credPath = process.env.GOOGLE_SHEETS_CREDENTIALS
  const sheetId = process.env.GOOGLE_SPREADSHEET_ID
  const tabName = process.env.FEESTEN_WORKSHEET_NAME ?? 'feesten'
  const sourceTab = process.env.FB_SOURCE_TAB_NAME ?? 'fb_events'

  if (!credPath || !sheetId) {
    console.error('\n✗ GOOGLE_SHEETS_CREDENTIALS and GOOGLE_SPREADSHEET_ID must be set.')
    console.error('  Copy .env.example → .env and fill in values.')
    process.exit(1)
  }
  const credPathAbs = resolve(__dirname, '..', credPath)

  console.log(`Pushing to spreadsheet "${sheetId}" → tab "${tabName}"`)
  await fullRefreshToTab(events, {
    credentialsPath: credPathAbs,
    spreadsheetId: sheetId,
    worksheetName: tabName,
    sourceTabName: sourceTab,
  })
  console.log('\n🎉 Done. Eyeball the feesten tab before publishing.')
  console.log(`   https://docs.google.com/spreadsheets/d/${sheetId}`)
}

async function main() {
  const cmd = process.argv[2] ?? 'run'
  console.log('🎪 fiestenpipeline — Gentse Feesten 2026')

  switch (cmd) {
    case 'scrape':
    case 'dev': {
      const events = await scrape()
      if (events.length === 0) {
        console.error('\n✗ No events scraped — aborting.')
        process.exit(1)
      }
      console.log('\n⏭  Inspect data/feesten.json, then run: npm run geocode (optional) → npm run export')
      break
    }
    case 'geocode':
      await geocodeStage()
      console.log('\n⏭  Inspect data/feesten.json, then run: npm run export')
      break
    case 'export':
      await exportToSheet()
      break
    case 'run': {
      const events = await scrape()
      if (events.length === 0) {
        console.error('\n✗ No events scraped — aborting.')
        process.exit(1)
      }
      await geocodeStage(events)
      await exportToSheet()
      break
    }
    default:
      console.error(`Unknown command "${cmd}". Use: scrape | geocode | export | run | dev`)
      process.exit(1)
  }
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err)
  process.exit(1)
})
