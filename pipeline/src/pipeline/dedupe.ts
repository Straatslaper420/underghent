import { createHash } from 'crypto'
import { normalizeText, diceCoefficient } from '../lib/text.js'
import type { CanonicalEvent } from '../types/canonical.js'
import type { StorageAdapter } from '../types/storage.js'

// Higher = preferred source when merging duplicates
const SOURCE_PRIORITY: Record<string, number> = {
  facebook:    0,
  goabase:     1,
  beldub:      1,
  reggaebe:    1,
  funke:       2,
  chinastraat: 2,
  asgaard:     2,
  kinkystar:   2,
  broei:       2,
  thecrossover:2,
  molotov:     2,
  vierdeZaal:  2,
  minusOne:    2,
  // newer venue scrapers — same top priority as the other venue sites
  charlatan:        2,
  clubsauvage:      2,
  trefpunt:         2,
  decentrale:       2,
  haconcerts:       2,
  viernulvier:      2,
  bijloke:          2,
  wintercircus:     2,
  clubwintercircus: 2,
  kompass:          2,
}

function sourceOf(event: CanonicalEvent): string {
  if (event.facebook_id) return 'facebook'
  if (event.aggregator_id) return event.aggregator_id.split('-')[0] ?? 'aggregator'
  return event.venue_id ?? 'unknown'
}

function priority(event: CanonicalEvent): number {
  return SOURCE_PRIORITY[sourceOf(event)] ?? 1
}

function dedupeKey(event: CanonicalEvent): string {
  return createHash('sha1')
    .update(`${normalizeText(event.title)}|${event.date_start}`)
    .digest('hex')
    .slice(0, 12)
}

function mergeAggregatorIds(a: CanonicalEvent, b: CanonicalEvent): string | null {
  const ids = [
    ...(a.aggregator_id ?? '').split(',').map(s => s.trim()).filter(Boolean),
    ...(b.aggregator_id ?? '').split(',').map(s => s.trim()).filter(Boolean),
  ]
  const unique = [...new Set(ids)]
  return unique.length ? unique.join(', ') : null
}

function merge(winner: CanonicalEvent, loser: CanonicalEvent): CanonicalEvent {
  return {
    ...winner,
    // Accumulate all source IDs so the merged event stays traceable
    aggregator_id: mergeAggregatorIds(winner, loser),
    // Pull social counts from Facebook source
    interested:  winner.interested ?? loser.interested,
    going:       winner.going ?? loser.going,
    // Pull missing fields from loser
    ticket_url:  winner.ticket_url ?? loser.ticket_url,
    description: winner.description ?? loser.description,
    price:       winner.price ?? loser.price,
    hour_start:  winner.hour_start ?? loser.hour_start,
    hour_end:    winner.hour_end ?? loser.hour_end,
    image_url:   winner.image_url ?? loser.image_url,
    genre_raw:   winner.genre_raw ?? loser.genre_raw,
    facebook_id: winner.facebook_id ?? loser.facebook_id,
    artists:     winner.artists.length ? winner.artists : loser.artists,
    support_acts: (winner.support_acts?.length ? winner.support_acts : loser.support_acts) ?? [],
    organizers:  winner.organizers.length ? winner.organizers : loser.organizers,
    overrides:   winner.overrides ?? loser.overrides,
  }
}

function countFields(e: CanonicalEvent): number {
  return Object.values(e).filter(v => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== '')).length
}

export async function deduplicateAll(storage: StorageAdapter): Promise<number> {
  const events    = await storage.readCanonical()
  const active    = events.filter(e => e.status !== 'duplicate')
  const canonical = new Map<string, CanonicalEvent>()
  let mergeCount  = 0

  // �€�€�€ Exact pass �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€
  const byKey = new Map<string, CanonicalEvent[]>()
  for (const e of active) {
    const key = dedupeKey(e)
    const bucket = byKey.get(key) ?? []
    bucket.push(e)
    byKey.set(key, bucket)
  }

  for (const [key, group] of byKey) {
    if (group.length === 1) {
      canonical.set(key, group[0])
      continue
    }
    // Pick winner: highest source priority, then most non-null fields
    const sorted = [...group].sort((a, b) => {
      const pd = priority(b) - priority(a)
      return pd !== 0 ? pd : countFields(b) - countFields(a)
    })
    let winner = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      winner = merge(winner, sorted[i])
      sorted[i] = { ...sorted[i], status: 'duplicate' }
      mergeCount++
    }
    canonical.set(key, winner)
  }

  // �€�€�€ Fuzzy pass (same date, title similarity > 0.85) �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€
  const byDate = new Map<string, CanonicalEvent[]>()
  for (const e of canonical.values()) {
    const bucket = byDate.get(e.date_start) ?? []
    bucket.push(e)
    byDate.set(e.date_start, bucket)
  }

  const toMark = new Set<string>()
  for (const group of byDate.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (toMark.has(a.event_id) || toMark.has(b.event_id)) continue

        const sim = diceCoefficient(normalizeText(a.title), normalizeText(b.title))
        if (sim < 0.85) continue

        const winner = priority(a) >= priority(b) ? a : b
        const loser  = winner === a ? b : a

        const merged = merge(winner, loser)
        canonical.set(dedupeKey(winner), merged)
        toMark.add(loser.event_id)
        mergeCount++
      }
    }
  }

  // Assemble final list: canonical winners + all original duplicates marked
  const duplicateIds = new Set<string>()
  for (const e of active) {
    if (toMark.has(e.event_id)) duplicateIds.add(e.event_id)
  }

  const result: CanonicalEvent[] = [
    ...canonical.values(),
    ...events.filter(e => e.status === 'duplicate'),
    ...active.filter(e => duplicateIds.has(e.event_id)).map(e => ({ ...e, status: 'duplicate' as const })),
  ]

  // Deduplicate the result list itself by event_id
  const seen = new Set<string>()
  const final: CanonicalEvent[] = []
  for (const e of result) {
    if (!seen.has(e.event_id)) {
      seen.add(e.event_id)
      final.push(e)
    }
  }

  await storage.writeCanonical(final)
  return mergeCount
}
