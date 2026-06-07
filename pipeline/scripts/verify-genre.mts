// Verifies the shipped config via the REAL loadRegistries + genreEnricher.
// Run:  npx tsx pipeline/scripts/verify-genre.mts
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadRegistries } from '../src/lib/registry.js'
import { genreEnricher } from '../src/pipeline/enrichers/genre.js'
import type { CanonicalEvent } from '../src/types/canonical.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configDir = resolve(__dirname, '../config')
const dataDir   = resolve(__dirname, '../data')
const registries = loadRegistries(configDir)
const ctx = { registries, dataDir }

console.log('Loaded', registries.genres.size, 'genre records;', registries.genreStopwords.size, 'stopwords:', [...registries.genreStopwords].join(','))

const ev = (title: string): CanonicalEvent => ({ title, artists: [], organizers: [], social_links: [],
  collective: null, description: null, details: null, venue_id: null } as unknown as CanonicalEvent)

const cases = ['Warehouse Rave w/ Surgeon','Acid Techno All Nighter','Dub Reggae Soundsystem',
  'Liquid DnB & Jungle','Technology Conference afterparty','Schranz / Hardgroove','Trap & Drill',
  'Krautrock live set','House night','Deep House Party','Encore: live band','Entrapment screening']
console.log('\nTest cases:')
for (const c of cases) {
  const r = await genreEnricher.enrich(ev(c), ctx)
  console.log(`  "${c}"`.padEnd(38), '->', (r.genre ?? 'null') + ' / ' + (r.subgenre ?? 'null'))
}

// coverage over real canonical events (read-only; does NOT write)
const canon = JSON.parse(readFileSync(resolve(dataDir, 'canonical.json'), 'utf-8')) as CanonicalEvent[]
const active = canon.filter(e => (e as any).status !== 'duplicate')
let withGenre = 0, withSub = 0
for (const e of active) {
  const r = await genreEnricher.enrich(e, ctx)
  if (r.genre) withGenre++
  if (r.subgenre) withSub++
}
console.log(`\nCoverage (read-only) over ${active.length} active events: genre=${withGenre} (${(100*withGenre/active.length).toFixed(0)}%), subgenre=${withSub}`)
