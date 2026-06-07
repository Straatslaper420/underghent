import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawGoabaseEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'goabase'

const BASE_URL = 'https://www.goabase.net'
const LIST_URL = `${BASE_URL}/party/list/?country=be&n=100`

async function scrapeDetailPage(url: string): Promise<Partial<RawGoabaseEvent>> {
  try {
    const html = await fetchHtml(url)
    const $ = parseCheerio(html)
    const description = $('.partyDesc, .party-description, [itemprop="description"]').text().trim() || null
    const artists_raw = $('.lineup, .partyLineup, .artist-list').text().trim() || null
    const ticket_url  = $('a[href*="ticket"], a[href*="tickets"]').first().attr('href') ?? null
    const price       = $('.price, .partyPrice').first().text().trim() || null
    return { description, artists_raw, ticket_url, price }
  } catch {
    return {}
  }
}

async function scrapeList(): Promise<ScraperResult<RawGoabaseEvent>> {
  const html = await fetchHtml(LIST_URL)
  const $    = parseCheerio(html)
  const events: RawGoabaseEvent[] = []
  const now  = new Date().toISOString()

  for (const el of $('article.partyElem').toArray()) {
    const $el      = $(el)
    const linkEl   = $el.find('a.lh14').first()
    const href     = linkEl.attr('href') ?? ''
    if (!href) continue

    const detailUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
    const title     = $el.find('h3').first().text().trim()
    if (!title) continue

    const idMatch  = href.match(/\/(\d+)$/)
    const event_id = idMatch ? idMatch[1] : href

    // Date/time from body text: "Sat, 23 May 2026, 22:00"
    const bodyText  = $el.text()
    const dateMatch = bodyText.match(/(\d{1,2}\s+\w+\s+\d{4}),?\s+(\d{2}:\d{2})/)
    const date_start = dateMatch ? parseNlDate(dateMatch[1]) : null
    if (!date_start) continue

    const hour_start = dateMatch ? parseTime(dateMatch[2]) : null
    const cityEl     = $el.find('a[href*="geoloc="]').first()
    const cityRaw    = cityEl.text().trim()

    // Throttle detail page fetches
    await new Promise(r => setTimeout(r, 1500))
    const detail = await scrapeDetailPage(detailUrl)

    events.push({
      _source:     'goabase',
      _scraped_at: now,
      event_id,
      title,
      date_start,
      hour_start,
      source_url:  detailUrl,
      venue_name:  null,
      city:        cityRaw || null,
      country:     'Belgium',
      genre_raw:   null,
      artists_raw: detail.artists_raw ?? null,
      description: detail.description ?? null,
      ticket_url:  detail.ticket_url ?? null,
      price:       detail.price ?? null,
      organizer:   null,
    })
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawGoabaseEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
