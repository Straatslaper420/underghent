import { fetchHtml } from '../../lib/http.js'
import { parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'thecrossover'
const VENUE_ID   = 'thecrossover'
const VENUE_NAME = 'The Crossover'
const BASE_URL   = 'https://www.thecrossover.be'
const SCRAPE_URL = `${BASE_URL}/`

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html = await fetchHtml(SCRAPE_URL)
  const $    = parseCheerio(html)
  const events: RawVenueEvent[] = []
  const now  = new Date().toISOString()

  $('.eb-event-box').each((_i, el) => {
    const $el = $(el)

    const titleEl = $el.find('a.eb-event-title').first()
    const title   = ($el.find('span[itemprop="name"]').first().text().trim()
                  || titleEl.text().trim())
    if (!title) return

    // startDate meta: content="2026-10-30T20:30"
    const startDate  = $el.find('meta[itemprop="startDate"]').attr('content') ?? ''
    const date_start = startDate.slice(0, 10) || null
    if (!date_start?.match(/^\d{4}-\d{2}-\d{2}$/)) return

    const href       = titleEl.attr('href') ?? ''
    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`

    const hour_start = parseTime(startDate) ?? parseTime($el.find('.eb-time').first().text())

    const regHref = $el.find('a[href*="registration"]').first().attr('href') ?? ''
    const ticket_url = regHref ? (regHref.startsWith('http') ? regHref : `${BASE_URL}${regHref}`) : null

    events.push({
      _source:     'thecrossover',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start,
      room:        null,
      description: $el.find('.eb-event-short-description').first().text().trim() || null,
      price:       null,
      ticket_url,
      artists_raw: null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
