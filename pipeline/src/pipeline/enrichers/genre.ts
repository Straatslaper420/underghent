import { normalizeText } from '../../lib/text.js'
import type { Enricher, EnricherResult, PipelineContext } from '../../types/enricher.js'
import type { CanonicalEvent } from '../../types/canonical.js'
import type { GenreRecord, Registries } from '../../types/registry.js'

function buildCombinedText(event: CanonicalEvent, venueGenres: string[]): string {
  return normalizeText([
    event.title,
    event.description ?? '',
    event.details ?? '',
    event.artists.join(' '),
    event.support_acts?.join(' ') ?? '',
    event.collective ?? '',
    venueGenres.join(' '),
  ].join(' '))
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Longest matching keyword/alias for a genre, measured in word count.
 * Whole-word, case-insensitive (text + keyword are pre-normalized).
 * Single-token keywords listed in `stopwords` never match (e.g. bare "dub", "house").
 * Returns 0 when nothing matches.
 */
function longestMatch(genre: GenreRecord, text: string, stopwords: Set<string>): number {
  let best = 0
  for (const term of [...genre.keywords, ...genre.aliases]) {
    const kn = normalizeText(term)
    if (!kn) continue
    const words = kn.split(' ')
    if (words.length === 1 && stopwords.has(kn)) continue // backstop: dangerous bare token
    const re = new RegExp(`\\b${escapeRe(kn)}\\b`)
    if (re.test(text) && words.length > best) best = words.length
  }
  return best
}

export const genreEnricher: Enricher = {
  name: 'GENRE',
  async enrich(event: CanonicalEvent, ctx: PipelineContext): Promise<EnricherResult> {
    const registries: Registries = ctx.registries
    const stopwords = registries.genreStopwords

    const venueRecord  = event.venue_id ? registries.venues.get(event.venue_id) : null
    const venueGenres  = venueRecord?.genres ?? []
    const combinedText = buildCombinedText(event, venueGenres)

    let bestGenre: GenreRecord | null = null
    let bestLen   = 0
    let bestWeight = -Infinity

    // 0) genre_raw — explicit genre tags the SOURCE itself published (v5).
    //    Strongest signal: matched first and alone, so an incidental word in a
    //    description can't outrank the venue's own tag.
    if (event.genre_raw) {
      const rawText = normalizeText(event.genre_raw)
      for (const genre of registries.genres.values()) {
        const len = longestMatch(genre, rawText, stopwords)
        if (len === 0) continue
        if (len > bestLen || (len === bestLen && genre.weight > bestWeight)) {
          bestGenre  = genre
          bestLen    = len
          bestWeight = genre.weight
        }
      }
    }

    // 1) Keyword / alias match over the full text — longest match wins, then
    //    highest weight on ties.
    if (!bestGenre) {
      for (const genre of registries.genres.values()) {
        const len = longestMatch(genre, combinedText, stopwords)
        if (len === 0) continue
        if (len > bestLen || (len === bestLen && genre.weight > bestWeight)) {
          bestGenre  = genre
          bestLen    = len
          bestWeight = genre.weight
        }
      }
    }

    // 2) No keyword match �€� fall back to venue genres (from venues.json `genres[]`).
    if (!bestGenre && venueGenres.length > 0) {
      const fallbackKey = normalizeText(venueGenres[0])
      for (const genre of registries.genres.values()) {
        if (normalizeText(genre.label) === fallbackKey || genre.aliases.some(a => normalizeText(a) === fallbackKey)) {
          bestGenre = genre
          break
        }
      }
    }

    // 3) Nothing matched �€� leave both null. (No AI/LLM fallback.)
    if (!bestGenre) return { genre: null, subgenre: null }

    // Subgenre (has a parent) → genre = parent label, subgenre = this label.
    if (bestGenre.parent) {
      const parentRecord = registries.genres.get(bestGenre.parent)
        ?? Array.from(registries.genres.values()).find(g => g.id === bestGenre!.parent)
      return {
        genre:    parentRecord?.label ?? bestGenre.parent,
        subgenre: bestGenre.label,
      }
    }

    // Super-genre keyword matched but no subgenre → genre only.
    return { genre: bestGenre.label, subgenre: null }
  },
}
