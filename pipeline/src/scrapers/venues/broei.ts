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

const DETAIL_BATCH = 5

interface BroeiDetail {
  description: string | null
  price:       string | null
  ticket_url:  string | null
  image_url:   string | null
  hour_end:    string | null
}

// Extracts the numeric event ID from a broei event URL
function eventId(url: string): string {
  const m = url.match(/\/event\/(\d+)/)
  return m ? m[1] : url
}

function parseDateFromHref(href: string): string | null {
  const m = href.trim().match(/(\d{4})\/(\d{2})\/(\d{2})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

async function fetchDetail(url: string): Promise<BroeiDetail> {
  try {
    const html = await fetchHtml(url)
    const $    = parseCheerio(html)

    // Ticket URL: first <a> whose text is "Tickets" or contains "ticket"
    let ticket_url: string | null = null
    $('a[href]').each((_i, a) => {
      if (ticket_url) return
      const text = $(a).text().trim().toLowerCase()
      const href = $(a).attr('href') ?? ''
      if ((text === 'tickets' || text.includes('ticket') || text.includes('reserv'))
          && href.startsWith('http') && !href.includes('broei.be')) {
        ticket_url = href
      }
    })

    // Price: list items that mention "prijs" with a euro amount
    let price: string | null = null
    $('li, p').each((_i, el) => {
      if (price) return
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (!/prijs|uitpas|kansentarief/i.test(text)) return
      const pm = text.match(/€\s*[\d,.]+/)
      if (pm) price = pm[0].replace(/€/, '€').trim()
    })

    // Description: paragraphs with substantial text after h1 (skip metadata lines)
    const SKIP_RE = /^(terug|ruimte|prijs|uitpas|tickets|\d{1,2}[:h]\d{2}|ma |di |wo |do |vr |za |zo |mon|tue|wed|thu|fri|sat|sun|jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)/i
    const parts: string[] = []
    let pastH1 = false
    $('*').each((_i, el) => {
      const tag = ((el as { tagName?: string }).tagName ?? '').toLowerCase()
      if (tag === 'h1') { pastH1 = true; return }
      if (!pastH1) return
      if (!['p'].includes(tag)) return
      if ($(el).closest('nav, footer, header').length) return
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (text.length < 25) return
      if (SKIP_RE.test(text)) return
      if (/^broei\b/i.test(text) && text.length < 40) return
      parts.push(text)
      if (parts.join(' ').length > 600) return false as unknown as void
    })
    const description = parts.length ? parts.join(' ').slice(0, 600) : null

    const image_url = $('meta[property="og:image"]').attr('content')
      ?? $('main img[src], article img[src]').first().attr('src')
      ?? null

    // End time: "20:00 - 23:00" style ranges anywhere in the practical info
    let hour_end: string | null = null
    const rangeM = $('body').text().match(/\b\d{1,2}[:h]\d{2}\s*[-–>]+\s*(\d{1,2})[:h](\d{2})\b/)
    if (rangeM) hour_end = `${rangeM[1].padStart(2, '0')}:${rangeM[2]}`

    return { description, price, ticket_url, image_url, hour_end }
  } catch {
    return { description: null, price: null, ticket_url: null, image_url: null, hour_end: null }
  }
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html = await fetchHtml(SCRAPE_URL)
  const $    = parseCheerio(html)
  const stubs: RawVenueEvent[] = []
  const now  = new Date().toISOString()

  $('div.event.event--sequence').each((_i, el) => {
    const $el = $(el)

    const nameEl = $el.find('a.event__name').first()
    const title  = nameEl.text().trim()
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

    // Room: look for "Locatie - X" pattern, strip the prefix
    let room: string | null = null
    $el.find('p, div, span').each((_j, p) => {
      if (room) return
      const text = $(p).text().replace(/\s+/g, ' ').trim()
      const m = text.match(/^Locatie\s*-\s*(.+)$/i)
      if (m) room = m[1].trim()
    })

    // Organizer: text in the card that isn't title, time, or location
    let organizer: string | null = null
    $el.find('p, div, span').each((_j, p) => {
      if (organizer) return
      // Skip elements that contain child elements (only leaf text nodes)
      if ($(p).children().length > 0) return
      const text = $(p).text().replace(/\s+/g, ' ').trim()
      if (!text || text.length < 2 || text.length > 80) return
      if (/\d{1,2}:\d{2}/.test(text)) return          // skip time
      if (/^Locatie\s*-/i.test(text)) return           // skip location
      if (/meer\s*info/i.test(text)) return            // skip "meer info"
      if (text === title) return                       // skip title repeat
      organizer = text
    })

    stubs.push({
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
      artists_raw: organizer,   // store organizer in artists_raw for now
    })
  })

  // Deduplicate detail fetches by event ID (recurring events share the same page)
  const detailCache = new Map<string, BroeiDetail>()
  const uniqueIds   = [...new Set(stubs.map(ev => eventId(ev.source_url ?? '')))]

  for (let i = 0; i < uniqueIds.length; i += DETAIL_BATCH) {
    const batch = uniqueIds.slice(i, i + DETAIL_BATCH)
    const details = await Promise.all(batch.map(id => {
      // Use the canonical event URL (without date suffix) for the detail fetch
      const canonicalUrl = `${BASE_URL}/agenda/event/${id}/`
      return fetchDetail(canonicalUrl)
    }))
    batch.forEach((id, j) => detailCache.set(id, details[j]))
  }

  // Merge detail data back into stubs
  const events: RawVenueEvent[] = stubs.map(ev => {
    const id = eventId(ev.source_url ?? '')
    const d  = detailCache.get(id)
    return {
      ...ev,
      description: d?.description ?? null,
      price:       d?.price       ?? null,
      ticket_url:  d?.ticket_url  ?? null,
      image_url:   d?.image_url   ?? null,
      hour_end:    d?.hour_end    ?? null,
    }
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
