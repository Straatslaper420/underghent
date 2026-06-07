import { fetchHtml } from '../../lib/http.js'
import { parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'broei'
const VENUE_ID   = 'broei'
const VENUE_NAME = 'BROEI'
const BASE_URL   = 'https://www.broei.be'
const SCRAPE_URL = `${BASE_URL}/agenda`

function parseDateFromHref(href: string): string | null {
  // href like "  https://www.broei.be/agenda/event/12032/2026/05/20\n"
  const m = href.trim().match(/(\d{4})\/(\d{2})\/(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html = await fetchHtml(SCRAPE_URL)
  const $    = parseCheerio(html)
  const events: RawVenueEvent[] = []
  const now  = new Date().toISOString()

  $('div.event.event--sequence').each((_i, el) => {
    const $el = $(el)

    const nameEl   = $el.find('a.event__name').first()
    const title    = nameEl.text().trim()
    if (!title) return

    const href       = nameEl.attr('href')?.trim() ?? ''
    const date_start = parseDateFromHref(href)
    if (!date_start) return

    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`

    let hour_start: string | null = null
    $el.find('div.event__description p').each((_j, p) => {
      const t = parseTime($(p).text())
      if (t) { hour_start = t; return false as unknown as void }
    })

    const room = $el.find('p.event__description').first().text().trim() || null

    events.push({
      _source:     'broei',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start,
      room,
      description: null,
      price:       null,
      ticket_url:  null,
      artists_raw: null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
