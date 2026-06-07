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
import * as molotov     from '../scrapers/venues/molotov.js'
import type { RawEventBase } from '../types/raw.js'
import type { ScraperResult } from '../types/enricher.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const storage   = new JsonStorageAdapter(dataDir)

const scrapers: Array<{ SOURCE_ID: string; scrape: () => Promise<ScraperResult<RawEventBase>> }> = [
  funke, chinastraat, asgaard, kinkystar, broei, crossover, molotov,
]

for (const scraper of scrapers) {
  const result = await safeRun(() => scraper.scrape(), scraper.SOURCE_ID)
  await storage.writeRaw(result.source, result.events)
  log(result.source.toUpperCase(), `${result.events.length} events scraped`)
}
