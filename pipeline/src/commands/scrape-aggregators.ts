import 'dotenv/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { log } from '../lib/logger.js'
import { safeRun } from '../scrapers/base.js'
import * as goabase  from '../scrapers/aggregators/goabase.js'
import * as beldub   from '../scrapers/aggregators/beldub.js'
import * as reggaebe from '../scrapers/aggregators/reggaebe.js'
import type { RawEventBase } from '../types/raw.js'
import type { ScraperResult } from '../types/enricher.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const storage   = new JsonStorageAdapter(dataDir)

const scrapers: Array<{ SOURCE_ID: string; scrape: () => Promise<ScraperResult<RawEventBase>> }> = [
  goabase, beldub, reggaebe,
]

for (const scraper of scrapers) {
  const result = await safeRun(() => scraper.scrape(), scraper.SOURCE_ID)
  await storage.writeRaw(result.source, result.events)
  log(result.source, `${result.events.length} events scraped`)
}
