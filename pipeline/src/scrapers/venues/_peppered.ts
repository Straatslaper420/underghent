import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'

type PepperedSource = RawVenueEvent['_source']

export async function scrapePeppered(
  url: string,
  venueId: string,
  venueName: string,
  source: PepperedSource,
): Promise<RawVenueEvent[]> {
  const html   = await fetchHtml(url)
  const $      = parseCheerio(html)
  const events: RawVenueEvent[] = []
  const now    = new Date().toISOString()

  // Peppered CMS event cards
  $('li.eventCard, .event-card, article.event').each((_i, el) => {
    const $el = $(el)

    const titleEl = $el.find('h3.title, h2.title, .event-title, h3').first()
    const title   = titleEl.text().trim()
    if (!title) return

    const dateEl    = $el.find('.top-date span.start, time, .date, .event-date').first()
    const dateRaw   = dateEl.attr('datetime') ?? dateEl.text().trim()
    const date_start = parseNlDate(dateRaw)
    if (!date_start) return

    const linkEl    = $el.find('a').first()
    const href      = linkEl.attr('href') ?? ''
    const source_url = href ? (href.startsWith('http') ? href : new URL(href, url).toString()) : null

    const descEl    = $el.find('.description, p').first()
    const ticketEl  = $el.find('a[href*="ticket"], a[href*="tickets"]').first()

    events.push({
      _source:     source,
      _scraped_at: now,
      venue_id:    venueId,
      venue_name:  venueName,
      title,
      date_start,
      source_url,
      hour_start:  parseTime(dateRaw) ?? parseTime(dateEl.attr('datetime') ?? ''),
      room:        $el.find('.room, .stage').first().text().trim() || null,
      description: descEl.text().trim() || null,
      price:       $el.find('.price').first().text().trim() || null,
      ticket_url:  ticketEl.attr('href') ?? null,
      artists_raw: $el.find('.lineup, .artists, .performers').first().text().trim() || null,
    })
  })

  return events
}
