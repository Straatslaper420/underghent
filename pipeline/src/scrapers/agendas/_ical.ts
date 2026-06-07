import { fetchHtml } from '../../lib/http.js'
import { parseIcalDatetime } from '../../lib/date.js'
import type { RawAgendaEvent } from '../../types/raw.js'

type AgendaSource = RawAgendaEvent['_source']

function unescapeIcal(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

function parseIcalBlock(block: string): Record<string, string> {
  const props: Record<string, string> = {}
  // Unfold continued lines (RFC 5545)
  const unfolded = block.replace(/\r?\n[ \t]/g, '')
  for (const line of unfolded.split(/\r?\n/)) {
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).replace(/;[^:]+/, '').trim().toUpperCase()
    const val = unescapeIcal(line.slice(sep + 1).trim())
    props[key] = val
  }
  return props
}

async function findCalendarId(pageUrl: string): Promise<string | null> {
  const html = await fetchHtml(pageUrl)
  // Match Google Calendar embed src
  const m = html.match(/calendar\.google\.com\/calendar\/embed\?src=([^&"'\s]+)/)
  if (!m) return null
  return decodeURIComponent(m[1])
}

export async function scrapeIcalDirect(
  calendarId: string,
  venueId: string,
  venueName: string,
  source: AgendaSource,
  options: { minDate?: string } = {},
): Promise<RawAgendaEvent[]> {
  const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`
  const ics    = await fetchHtml(icsUrl)
  return parseIcsContent(ics, venueId, venueName, source, options.minDate)
}

export async function scrapeIcal(
  pageUrl: string,
  venueId: string,
  venueName: string,
  source: AgendaSource,
): Promise<RawAgendaEvent[]> {
  const calId = await findCalendarId(pageUrl)
  if (!calId) {
    if (pageUrl.endsWith('.ics')) {
      return parseIcsContent(await fetchHtml(pageUrl), venueId, venueName, source)
    }
    return []
  }

  const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calId)}/public/basic.ics`
  const ics    = await fetchHtml(icsUrl)
  return parseIcsContent(ics, venueId, venueName, source)
}

function parseIcsContent(
  ics: string,
  venueId: string,
  venueName: string,
  source: AgendaSource,
  minDate?: string,
): RawAgendaEvent[] {
  const events: RawAgendaEvent[] = []
  const now    = new Date().toISOString()
  const blocks = ics.split('BEGIN:VEVENT').slice(1)

  for (const block of blocks) {
    const end = block.indexOf('END:VEVENT')
    const props = parseIcalBlock(end > 0 ? block.slice(0, end) : block)

    const dtstart = props['DTSTART'] ?? props['DTSTART;VALUE=DATE'] ?? ''
    const dtend   = props['DTEND']   ?? props['DTEND;VALUE=DATE']   ?? ''
    const title   = props['SUMMARY'] ?? ''
    if (!title || !dtstart) continue

    const start = parseIcalDatetime(dtstart)
    const end_  = parseIcalDatetime(dtend)
    if (!start) continue
    if (minDate && start.date < minDate) continue

    events.push({
      _source:      source,
      _scraped_at:  now,
      venue_id:     venueId,
      venue_name:   venueName,
      title:        title.trim(),
      date_start:   start.date,
      source_url:   props['URL'] ?? null,
      hour_start:   start.time,
      hour_end:     end_?.time ?? null,
      description:  props['DESCRIPTION']?.trim() || null,
      location_raw: props['LOCATION']?.trim() || null,
    })
  }

  return events
}
