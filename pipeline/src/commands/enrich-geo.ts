import 'dotenv/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { loadRegistries } from '../lib/registry.js'
import { makeGeoEnricher } from '../pipeline/enrichers/geo.js'
import { log } from '../lib/logger.js'
import type { PipelineContext } from '../types/enricher.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const configDir = resolve(__dirname, '../../config')

const storage    = new JsonStorageAdapter(dataDir)
const registries = loadRegistries(configDir)
const ctx: PipelineContext = { registries, dataDir }
const geoEnricher = makeGeoEnricher(storage)

const events = await storage.readCanonical()
const active  = events.filter(e => e.status !== 'duplicate')
let geocoded  = 0

for (const event of active) {
  const result = await geoEnricher.enrich(event, ctx)
  Object.assign(event, result)
  if (event.latitude !== null) geocoded++
}

await storage.writeCanonical(events)
log('GEO', `${geocoded} events geocoded`)
