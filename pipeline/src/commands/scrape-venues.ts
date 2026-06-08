import 'dotenv/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { log } from '../lib/logger.js'
import { safeRun } from '../scrapers/base.js'
import * as funke       from '../scrapers/venues/funke.js'
import * as chinastraat from '../scrapers/venues/chinastraat.js'
import * as asgaard     from '../scrapers/venues/asgaard.js'
import * as kinkystar   from '../scrapers/venues/kinkystar.js'
import * as broei       from '../scrapers/venues/broei.js'
import * as crossover   from '../scrapers/venues/crossover.js'
import * as charlatan   from '../scrapers/venues/charlatan.js'
import * as clubsauvage from '../scrapers/venues/clubsauvage.js'
import type { RawEventBase } from '../types/raw.js'
import type { ScraperResult } from '../types/enricher.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const storage   = new JsonStorageAdapter(dataDir)

const allScrapers: Array<{ SOURCE_ID: string; scrape: () => Promise<ScraperResult<RawEventBase>> }> = [
  funke, chinastraat, asgaard, kinkystar, broei, crossover, charlatan, clubsauvage,
]

// Optional CLI args select a subset by SOURCE_ID, e.g. `npm run scrape:venues -- asgaard`.
// With no args, every venue scraper runs.
const wanted = process.argv.slice(2).map(a => a.toLowerCase())
const scrapers = wanted.length === 0
  ? allScrapers
  : allScrapers.filter(s => wanted.includes(s.SOURCE_ID.toLowerCase()))

if (wanted.length > 0) {
  const unknown = wanted.filter(w => !allScrapers.some(s => s.SOURCE_ID.toLowerCase() === w))
  if (unknown.length > 0) {
    log('SCRAPE-VENUES', `unknown venue(s): ${unknown.join(', ')}`)
  }
  if (scrapers.length === 0) {
    log('SCRAPE-VENUES', `no matching venues. available: ${allScrapers.map(s => s.SOURCE_ID).join(', ')}`)
    process.exit(1)
  }
}

for (const scraper of scrapers) {
  const result = await safeRun(() => scraper.scrape(), scraper.SOURCE_ID)
  await storage.writeRaw(result.source, result.events)
  log(result.source.toUpperCase(), `${result.events.length} events scraped`)
}
