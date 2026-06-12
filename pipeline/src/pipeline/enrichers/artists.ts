import type { Enricher, EnricherResult, PipelineContext } from '../../types/enricher.js'
import type { CanonicalEvent } from '../../types/canonical.js'

const SPLIT_PATTERN = /\s+(?:feat\.?|b2b|vs\.?|presents?|&|\+|×|x)\s+/i
const DELIMITER_PATTERN = /[\u2022|\/\n]+/
const NOISE_WORDS = new Set([
  'live', 'dj set', 'dj', 'all night long', 'doors open', 'presents',
  'b2b', 'feat', 'featuring', 'tickets', 'more', '+more', 'and more',
  'tba', 'tbc', 'special guest', 'guests',
])

function extractArtists(text: string): string[] {
  const parts = text
    .split(SPLIT_PATTERN)
    .flatMap(s => s.split(DELIMITER_PATTERN))
    .map(s => s.trim())
    .filter(s => {
      if (!s || s.length < 2 || s.length > 60) return false
      if (NOISE_WORDS.has(s.toLowerCase())) return false
      // Must start with a letter or digit
      if (!/^[a-zA-Z\u00c0-\u00ff0-9]/.test(s)) return false
      return true
    })

  // Deduplicate case-insensitively, keep first occurrence
  const seen = new Set<string>()
  const result: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(p)
    }
  }
  return result
}

export const artistEnricher: Enricher = {
  name: 'ARTISTS',
  async enrich(event: CanonicalEvent, _ctx: PipelineContext): Promise<EnricherResult> {
    const combined = [
      event.title,
      event.description ?? '',
      event.details ?? '',
    ].join('\n')

    const artists = extractArtists(combined)
    return { artists }
  },
}
