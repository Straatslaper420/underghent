import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'charlatan'
const VENUE_ID   = 'charlatan'
const VENUE_NAME = 'Charlatan'
const BASE_URL   = 'https://www.charlatan.be'
const SCRAPE_URL = `${BASE_URL}/agenda`

// Slugs that are category/filter pages, not events
const CATEGORY_SLUGS = new Set([
  'concert', 'nightlife', 'comedy', 'hitjes',
])

// NL weekday + day + month — matches e.g. "do 11 jun" or "za 13 jun"
const NL_DATE_RE = /(ma|di|wo|do|vr|za|zo)\s+(\d{1,2}\s+(?:jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec))/i

// Room names used by Charlatan
const ROOM_RE = /\b(Zaal(?:\s*&\s*Belgica)?|Café|Café|Belgica)\b/i

function extractEvents(html: string, now: string): RawVenueEvent[] {
  const $      = parseCheerio(html)
  const events: RawVenueEvent[] = []
  const seen   = new Set<string>()

  // Map slug → the first <li> that links to that event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slugToEl = new Map<string, any>()

  $('a[href]').each((_i, a) => {
    const href = $( a).attr('href') ?? ''
    // Match /agenda/<slug> at end of path (no trailing segments)
    const m = href.match(/\/agenda\/([a-z0-9_-]+)(?:[?#].*)?$/)
    if (!m) return
    const slug = m[1]
    if (CATEGORY_SLUGS.has(slug) || slugToEl.has(slug)) return

    // Walk up to find the nearest <li> ancestor
    const li = $(a).closest('li').get(0)
    if (!li) return

    slugToEl.set(slug, li)
  })

  slugToEl.forEach((li, slug) => {
    if (seen.has(slug)) return
    seen.add(slug)

    const $li = $(li)
    const fullText = $li.text().replace(/\s+/g, ' ').trim()

    // --- Title: prefer h2/h3 inside the li ---
    let title = $li.find('h2, h3').first().text().trim()

    // Fallback: the first <a> child/descendant with substantial non-numeric text
    if (!title) {
      $li.find('a[href*="/agenda/"]').each((_j, a) => {
        const t = $(a).text().trim()
        if (t.length > 3 && !/^\d/.test(t) && !CATEGORY_SLUGS.has(t.toLowerCase())) {
          title = t
          return false as unknown as void
        }
      })
    }

    if (!title) return

    // --- Date: find NL weekday+day+month in the full text ---
    const dateMatch = fullText.match(NL_DATE_RE)
    if (!dateMatch) return
    // dateMatch[2] is e.g. "11 jun" — parseNlDate handles "D MMM" format
    const date_start = parseNlDate(dateMatch[2].trim())
    if (!date_start) return

    // --- Source URL ---
    const rawHref = $li.find(`a[href*="/agenda/${slug}"]`).first().attr('href') ?? ''
    const source_url = rawHref.startsWith('http') ? rawHref : `${BASE_URL}${rawHref}`

    // --- Time: first HH:MM after the date pattern ---
    const afterDate = fullText.slice(fullText.search(NL_DATE_RE) + dateMatch[0].length)
    const hour_start = parseTime(afterDate) ?? parseTime(fullText)

    // --- Room ---
    const roomMatch = fullText.match(ROOM_RE)
    const room = roomMatch ? roomMatch[1] : null

    // --- Ticket URL ---
    let ticket_url: string | null = null
    $li.find('a[href]').each((_j, a) => {
      const h = $(a).attr('href') ?? ''
      if (h.includes('stager') || (h.includes('ticket') && !h.includes('/agenda/'))) {
        ticket_url = h.startsWith('http') ? h : `${BASE_URL}${h}`
        return false as unknown as void
      }
    })

    // --- Price ---
    const priceMatch = fullText.match(/€\s*[\d,.]+(?:\s*[–\-]\s*€?\s*[\d,.]+)?/)
    const price = priceMatch ? priceMatch[0].trim() : null

    events.push({
      _source:     'charlatan',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start,
      room,
      description: null,
      price,
      ticket_url,
      artists_raw: null,
    })
  })

  return events
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const now    = new Date().toISOString()
  const events: RawVenueEvent[] = []
  const seen   = new Set<string>() // de-dupe across pages

  let pageUrl: string | null = SCRAPE_URL

  while (pageUrl) {
    const html     = await fetchHtml(pageUrl)
    const pageEvts = extractEvents(html, now)

    for (const ev of pageEvts) {
      const key = ev.source_url ?? ev.title + ev.date_start
      if (!seen.has(key)) {
        seen.add(key)
        events.push(ev)
      }
    }

    // Check for a "Volgende" / next-page link
    const $    = parseCheerio(html)
    const next = $('a[href*="page="]')
      .filter((_i, a) => {
        const txt = $(a).text().trim().toLowerCase()
        return txt === 'volgende' || txt === 'next' || txt === '>'
      })
      .first()
      .attr('href')

    if (next) {
      pageUrl = next.startsWith('http') ? next : `${BASE_URL}${next}`
    } else {
      pageUrl = null
    }
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
