import { readFileSync } from 'fs'
import { join } from 'path'
import { normalizeText } from './text.js'
import type { VenueRecord, GenreRecord, OrganizerRecord, Registries } from '../types/registry.js'

interface VenuesFile { venues: VenueRecord[] }
interface GenresFile  { genres: GenreRecord[]; stopwords?: string[] }
interface OrganizersFile { organizers: OrganizerRecord[] }

export function loadRegistries(configDir: string): Registries {
  const venuesRaw   = JSON.parse(readFileSync(join(configDir, 'venues.json'), 'utf-8')) as VenuesFile
  const genresRaw   = JSON.parse(readFileSync(join(configDir, 'genres.json'), 'utf-8')) as GenresFile
  const orgsRaw     = JSON.parse(readFileSync(join(configDir, 'organizers.json'), 'utf-8')) as OrganizersFile

  const venues    = new Map<string, VenueRecord>()
  const venueAlias = new Map<string, string>()
  const genres    = new Map<string, GenreRecord>()
  const genreStopwords = new Set<string>((genresRaw.stopwords ?? []).map(normalizeText))
  const organizers = new Map<string, OrganizerRecord>()

  for (const v of venuesRaw.venues) {
    venues.set(v.id, v)
    for (const alias of v.aliases) {
      venueAlias.set(normalizeText(alias), v.id)
    }
    // Also index by canonical name
    venueAlias.set(normalizeText(v.canonical_name), v.id)
  }

  for (const g of genresRaw.genres) {
    genres.set(g.id, g)
  }

  for (const o of orgsRaw.organizers) {
    organizers.set(o.id, o)
  }

  return Object.freeze({ venues, venueAlias, genres, genreStopwords, organizers })
}
