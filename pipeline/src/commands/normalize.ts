import 'dotenv/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { JsonStorageAdapter } from '../lib/storage/json.js'
import { loadRegistries } from '../lib/registry.js'
import { normalizeAll } from '../pipeline/normalize.js'
import { log } from '../lib/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir   = resolve(__dirname, '../../data')
const configDir = resolve(__dirname, '../../config')

const storage    = new JsonStorageAdapter(dataDir)
const registries = loadRegistries(configDir)

const count = await normalizeAll(storage, registries, dataDir)
log('NORMALIZE', `${count} events normalized`)
