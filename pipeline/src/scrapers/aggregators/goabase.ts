/**
 * Goabase scraper — REWRITTEN 2026-06 to use Goabase's official JSON API
 * instead of scraping the HTML list (whose detail-page selectors had rotted:
 * artists/description/ticket/price filled 0/4 in the last runs).
 *
 * List:   https://www.goabase.net/api/party/json?country=be&limit=100
 *         → { partylist: [{ id, nameParty, dateStart/dateEnd (ISO+TZ),
 *              nameTown, geoLat/geoLon, nameOrganizer, urlImage*, … }] }
 * Detail: https://www.goabase.net/api/party/json/<id>
 *         → { party: { textLineUp, textMore (entry fee!), textLocation,
 *              textOrganizer, urlImageFull, … } }
 */
import { fetchJson } from '../../lib/http.js'
import { makeScraperResult, safeRun } from '../base.js'
import type { RawGoabaseEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'goabase'

const LIST_URL   = 'https://www.goabase.net/api/party/json?country=be&limit=100'
const DETAIL_URL = (id: string | number) => `https://www.goabase.net/api/party/json/${id}`

/* eslint-disable @typescript-eslint/no-explicit-any */

function isoDate(raw: unknown): string | null {
  const m = String(raw ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}
function isoTime(raw: unknown): string | null {
  const m = String(raw ?? '').match(/T(\d{2}:\d{2})/)
  return m ? m[1] : null
}

// Pull artist names out of Goabase's free-text line-up. Lines like
// "🐸~🎶 GLOBOX ....._..... Goa Trance" → "GLOBOX".
function artistsFromLineup(text: string | null | undefined): string | null {
  if (!text) return null
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^[^\w]*[~\s]*🎶?\s*([A-Z][A-Za-z0-9' .&-]{1,30}?)\s*(?:\.{2,}|_{2,}|—|–| - )/u)
    if (m) {
      const name = m[1].trim()
      if (name && !names.includes(name)) names.push(name)
    }
  }
  return names.length ? names.join(', ') : null
}

function priceFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const m = String(text).match(/(?:vvk|presale|entr[ée]e?|deur|door|entry)\s*:?\s*€?\s*[\d,.]+|€\s*[\d,.]+/i)
  return m ? m[0].trim() : null
}

async function scrapeList(): Promise<ScraperResult<RawGoabaseEvent>> {
  const data = await fetchJson<any>(LIST_URL)
  const list: any[] = data?.partylist ?? []
  const now = new Date().toISOString()
  const events: RawGoabaseEvent[] = []

  for (const p of list) {
    const date_start = isoDate(p.dateStart)
    const title = String(p.nameParty ?? '').trim()
    if (!date_start || !title) continue
    if (String(p.nameStatus ?? '').toLowerCase() === 'cancelled') continue

    // Detail fetch (polite 1.2s spacing) for line-up / entry fee / description
    let detail: any = {}
    try {
      await new Promise(r => setTimeout(r, 1200))
      const d = await fetchJson<any>(DETAIL_URL(p.id))
      detail = d?.party ?? {}
    } catch { /* list data alone is still useful */ }

    const lineup  = detail.textLineUp ?? null
    const more    = detail.textMore ?? null
    const descPieces = [lineup, more].filter(Boolean).map(String)

    events.push({
      _source:     'goabase',
      _scraped_at: now,
      event_id:    String(p.id),
      title,
      date_start,
      hour_start:  isoTime(p.dateStart),
      source_url:  p.urlPartyHtml ?? null,
      venue_name:  detail.textLocation?.trim() || null,
      city:        p.nameTown ?? null,
      country:     p.nameCountry ?? 'Belgium',
      genre_raw:   p.nameType ? `psytrance, ${String(p.nameType).toLowerCase()}` : 'psytrance',
      artists_raw: artistsFromLineup(lineup),
      description: descPieces.length ? descPieces.join('\n\n').slice(0, 800) : null,
      ticket_url:  null,
      price:       priceFromText(more) ?? priceFromText(lineup),
      organizer:   p.nameOrganizer ?? detail.textOrganizer ?? null,
      image_url:   p.urlImageLarge || p.urlImageFull || p.urlImageMedium || null,
      latitude:    Number.isFinite(p.geoLat) && p.geoLat !== 0 ? p.geoLat : null,
      longitude:   Number.isFinite(p.geoLon) && p.geoLon !== 0 ? p.geoLon : null,
      hour_end:    isoTime(p.dateEnd),
      date_end:    isoDate(p.dateEnd),
    })
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawGoabaseEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
