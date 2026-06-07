import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawBeldubEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'beldub'

const BASE_URL   = 'https://beldub.be'
const AGENDA_URL = `${BASE_URL}/`

async function scrapeList(): Promise<ScraperResult<RawBeldubEvent>> {
  const html   = await fetchHtml(AGENDA_URL)
  const $      = parseCheerio(html)
  const events: RawBeldubEvent[] = []
  const now    = new Date().toISOString()

  // Elementor loop items for events: .e-loop-item.event
  $('.e-loop-item.event, [class*="e-loop-item"][class*="event"]').each((_i, item) => {
    const el = $(item)

    const title = el.find('h3.elementor-heading-title, h2.elementor-heading-title').first().text().trim()
    if (!title) return

    // Source URL is the wrapping <a> href (Facebook event link)
    const wrapLink = el.find('a[href]').first()
    const source_url = wrapLink.attr('href') ?? null

    // Text-editor divs: first = venue, second = date (DD/MM/YYYY)
    const textDivs = el.find('.elementor-widget-text-editor').toArray()
    const venueName = textDivs.length > 0 ? $(textDivs[0]).text().trim() : null
    const dateRaw   = textDivs.length > 1 ? $(textDivs[1]).text().trim() : ''

    const date_start = parseNlDate(dateRaw)
    if (!date_start) return

    events.push({
      _source:     'beldub',
      _scraped_at: now,
      event_id:    source_url ?? `beldub-${title}-${date_start}`,
      title,
      date_start,
      source_url,
      hour_start:  parseTime(dateRaw),
      venue_name:  venueName || null,
      city:        null,
      genre_raw:   null,
      description: null,
      ticket_url:  null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawBeldubEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
