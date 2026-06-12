import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'decentrale'
const VENUE_ID   = 'decentrale'
const VENUE_NAME = 'De Centrale'
const BASE_URL   = 'https://www.decentrale.be'

// De Centrale (Creem CMS): events on category listing pages.
// URL shape: /nl/agenda/<category>/<slug>
// Slugs can contain dots (leerlingenfeest-.-on-stage-26) and uppercase (zeynep-bakSI-karataG).
// Anchor text ends with " weekday.DD.mon" (e.g. " vr.12.jun").
const DATE_SUFFIX_RE = /\s+(ma|di|wo|do|vr|za|zo)\.(\d{1,2})\.(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)$/i
// Category pattern is lowercase letters + hyphens; slug allows any non-separator chars
const EVENT_HREF_RE  = /\/nl\/agenda\/[a-z-]+\/[^\s?#/]+$/

// Category pages to scrape
const CATEGORIES = [
  'muziek', 'literair', 'te-gast', 'festivals',
]

// �€�€ Detail page parsing �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

const DETAIL_TIME_RE   = /\b(\d{1,2}:\d{2})\b/
const DETAIL_PRICE_RE  = /€\s*(\d+[,.]?\d*)/
const TICKET_HREF_RE   = /uitbureau|ticketmaster|eventbrite|koop|ticket/i

interface EventDetail {
  hour_start:  string | null
  price:       string | null
  description: string | null
  ticket_url:  string | null
  room:        string | null
  image_url:   string | null
}

async function fetchDetail(url: string): Promise<EventDetail> {
  try {
    const html = await fetchHtml(url)
    const $    = parseCheerio(html)

    // Ticket link �€� external URL from the Praktisch section or anywhere on page
    let ticket_url: string | null = null
    $('a[href]').each((_i, el) => {
      if (ticket_url) return
      const href = $(el).attr('href') ?? ''
      if (TICKET_HREF_RE.test(href) && href.startsWith('http') && !href.includes('decentrale.be')) {
        ticket_url = href
      }
    })

    // "Praktisch" section text �€� contains times and prices
    let praktischText = ''
    $('h3, h4').each((_i, el) => {
      if ($(el).text().toLowerCase().includes('praktisch')) {
        // Get all following sibling text until next heading
        let node = $(el).next()
        while (node.length && !['H1','H2','H3','H4','H5'].includes(node.prop('tagName') ?? '')) {
          praktischText += ' ' + node.text()
          node = node.next()
        }
      }
    })
    // Fallback: look anywhere in page for time+price if no Praktisch section
    if (!praktischText) praktischText = $('body').text()

    const timeMatch  = praktischText.match(DETAIL_TIME_RE)
    const hour_start = timeMatch ? parseTime(timeMatch[1]) : null

    const priceMatch = praktischText.match(DETAIL_PRICE_RE)
    const price      = priceMatch ? `€ ${priceMatch[1]}` : null

    // Room: appears right after the "weekday.DD.mon" date tag at top of event content
    // Creem CMS renders it as adjacent text: <strong>vr.12.jun</strong>Turbinezaal
    let room: string | null = null
    const DATE_TAG_RE = /\b(?:ma|di|wo|do|vr|za|zo)\.\d{1,2}\.(?:jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\b/i
    $('p, div').each((_i, el) => {
      if (room) return
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      const m    = text.match(DATE_TAG_RE)
      if (m) {
        const after = text.slice(text.search(DATE_TAG_RE) + m[0].length).trim()
        if (after && after.length > 1 && after.length < 60 && !/^http/.test(after)) {
          room = after
        }
      }
    })

    // Description: collect paragraphs that follow the h1, stop at Praktisch heading
    let description: string | null = null
    const $h1 = $('h1').first()
    if ($h1.length) {
      const parts: string[] = []
      $h1.nextAll('p, h2, h3').each((_i, el) => {
        const tag  = (el as { tagName?: string }).tagName?.toLowerCase() ?? ''
        const text = $(el).text().replace(/\s+/g, ' ').trim()
        // Stop at the Praktisch section heading
        if ((tag === 'h2' || tag === 'h3') && /praktisch/i.test(text)) return false as unknown as void
        if (!text || text.length < 10) return
        if (/^(vvk|adk|€|http|©)/i.test(text)) return
        if ($(el).closest('nav, footer, header').length) return
        parts.push(text)
        if (parts.join(' ').length > 600) return false as unknown as void
      })
      if (parts.length) description = parts.join(' ').slice(0, 600)
    }

    const image_url = $('meta[property="og:image"]').attr('content')
      ?? $('main img[src], article img[src]').first().attr('src')
      ?? null

    return { hour_start, price, description, ticket_url, room, image_url }
  } catch {
    return { hour_start: null, price: null, description: null, ticket_url: null, room: null, image_url: null }
  }
}

// �€�€ List page parsing �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

async function scrapeCategory(url: string, now: string, seen: Set<string>): Promise<RawVenueEvent[]> {
  const html = await fetchHtml(url)
  const $    = parseCheerio(html)
  const stubs: Array<{ source_url: string; title: string; date_start: string }> = []

  $('a[href]').each((_i, el) => {
    const $el  = $(el)
    const href = ($el.attr('href') ?? '').trim()
    if (!EVENT_HREF_RE.test(href)) return

    const rawText = $el.text().replace(/\s+/g, ' ').trim()
    const match   = rawText.match(DATE_SUFFIX_RE)
    if (!match) return

    const date_start = parseNlDate(`${match[2]} ${match[3]}`)
    if (!date_start) return

    const title      = rawText.slice(0, rawText.length - match[0].length).trim()
    if (!title) return

    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`
    if (!seen.has(source_url)) stubs.push({ source_url, title, date_start })
  })

  // Fetch detail pages concurrently (max 5 at a time) for time/price/description
  const events: RawVenueEvent[] = []
  const BATCH = 5
  for (let i = 0; i < stubs.length; i += BATCH) {
    const batch = stubs.slice(i, i + BATCH)
    const details = await Promise.all(batch.map(s => fetchDetail(s.source_url)))
    for (let j = 0; j < batch.length; j++) {
      const { source_url, title, date_start } = batch[j]
      if (seen.has(source_url)) continue
      seen.add(source_url)
      const d = details[j]
      events.push({
        _source:     'decentrale',
        _scraped_at: now,
        venue_id:    VENUE_ID,
        venue_name:  VENUE_NAME,
        title,
        date_start,
        source_url,
        hour_start:  d.hour_start,
        room:        d.room,
        description: d.description,
        price:       d.price,
        ticket_url:  d.ticket_url ?? source_url,
        image_url:   d.image_url,
        artists_raw: null,
      })
    }
  }
  return events
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const now    = new Date().toISOString()
  const seen   = new Set<string>()
  const events: RawVenueEvent[] = []

  for (const cat of CATEGORIES) {
    const url    = `${BASE_URL}/nl/agenda/${cat}`
    const catEvs = await scrapeCategory(url, now, seen)
    events.push(...catEvs)
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
