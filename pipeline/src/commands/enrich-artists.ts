import 'dotenv/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { loadRegistries } from '../lib/registry.js'
import { artistEnricher } from '../pipeline/enrichers/artists.js'
import { log } from '../lib/logger.js'
import type { PipelineContext } from '../types/enricher.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const configDir = resolve(__dirname, '../../config')

const storage    = new JsonStorageAdapter(dataDir)
const registries = loadRegistries(configDir)
const ctx: PipelineContext = { registries, dataDir }

const events = await storage.readCanonical()
const active  = events.filter(e => e.status !== 'duplicate')
let enriched  = 0

for (const event of active) {
  const result = await artistEnricher.enrich(event, ctx)
  Object.assign(event, result)
  if (result.artists && result.artists.length > 0) enriched++
}

await storage.writeCanonical(events)
log('ARTISTS', `${enriched} artist lists extracted`)
