import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'asgaard'
const VENUE_ID   = 'asgaard'
const VENUE_NAME = 'Asgaard'
const SCRAPE_URL = 'https://asgaard.be/programma'

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html = await fetchHtml(SCRAPE_URL)
  const $    = parseCheerio(html)
  const events: RawVenueEvent[] = []
  const now  = new Date().toISOString()

  $('article, .event, .show, li.event-item').each((_i, el) => {
    const $el   = $(el)
    const title = $el.find('h2, h3, .title, .show-title').first().text().trim()
    if (!title) return

    const dateEl  = $el.find('time, .date').first()
    const dateRaw = dateEl.attr('datetime') ?? dateEl.text().trim()
    const date_start = parseNlDate(dateRaw)
    if (!date_start) return

    const linkEl = $el.find('a').first()
    const href   = linkEl.attr('href') ?? ''
    const source_url = href ? (href.startsWith('http') ? href : `https://asgaard.be${href}`) : SCRAPE_URL

    events.push({
      _source:     'asgaard',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start:  parseTime(dateRaw) ?? parseTime($el.find('.time').first().text()),
      room:        null,
      description: $el.find('p, .description').first().text().trim() || null,
      price:       $el.find('.price, .entry').first().text().trim() || null,
      ticket_url:  $el.find('a[href*="ticket"]').first().attr('href') ?? null,
      artists_raw: $el.find('.bands, .lineup, .artists').first().text().trim() || null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
