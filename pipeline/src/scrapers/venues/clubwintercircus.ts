/**
 * Club Wintercircus scraper (WordPress)
 * Listing: https://www.clubwintercircus.be/
 * Event detail: https://www.clubwintercircus.be/<slug>/
 *
 * Listing structure per event:
 *   <h2><a href="/slug/">Title</a></h2>
 *   <a href="/slug/">DD mon</a>          ← short date on listing page
 *   <a href="/slug/">details: Title</a>
 *
 * Detail page:
 *   "DD mon YYYY"                         ← full date near top
 *   [Tickets](url)  Doors: HH:MM | price  ← practical info
 */
import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'clubwintercircus'
const VENUE_ID   = 'clubwintercircus'
const VENUE_NAME = 'Club Wintercircus'
const BASE_URL   = 'https://www.clubwintercircus.be'

// Event slugs look like /against-the-war/ or /collegium-vocale-listening-session.../
// They are direct children of the domain root (not /category/ or /page/).
// Exclude known non-event paths:
const NON_EVENT_PATHS = new Set([
  '/', '/praktisch/', '/360-2/', '/contact/', '/privacy-policy/',
  '/category/', '/vacature-freelance-communications/',
])
const NON_EVENT_RE = /^\/(category|tag|author|page|feed|wp-|praktisch|360|contact|privacy|vacature)/i

// "DD mon" on listing (e.g. "19 jun", "22 sep", "02 okt")
const SHORT_DATE_RE = /^(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)$/i
// "DD mon YYYY" on detail page (e.g. "22 sep 2026")
const FULL_DATE_RE  = /\b(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\s+(\d{4})\b/i
// "Doors: HH:MM" or "HH:MM"
const DOORS_RE      = /\bdoors?\s*[:\-]?\s*(\d{1,2}:\d{2})/i
const TIME_RE       = /\b(\d{1,2}:\d{2})\b/
// "| XX euro" or "XX euro" or "€ XX"
const PRICE_RE      = /[|]\s*(\d+[\d,.]*\s*euro)|€\s*(\d+[\d,.]*)/i

// �€�€ detail page �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

interface Detail {
  date_start:  string | null
  hour_start:  string | null
  price:       string | null
  ticket_url:  string | null
  description: string | null
  image_url:   string | null
}

async function fetchDetail(url: string): Promise<Detail> {
  try {
    const html = await fetchHtml(url)
    const $    = parseCheerio(html)

    // Full date near top (published date or meta)
    let date_start: string | null = null
    const bodyText = $('body').text()
    const fullM    = bodyText.match(FULL_DATE_RE)
    if (fullM) {
      date_start = parseNlDate(`${fullM[1]} ${fullM[2]} ${fullM[3]}`)
    }

    // Time �€� prefer "Doors: HH:MM", fallback to first HH:MM on page
    let hour_start: string | null = null
    const doorsM = bodyText.match(DOORS_RE)
    if (doorsM) {
      hour_start = parseTime(doorsM[1])
    } else {
      const timeM = bodyText.match(TIME_RE)
      if (timeM) hour_start = parseTime(timeM[1])
    }

    // Price �€� "| XX euro" or "€ XX"
    let price: string | null = null
    const priceM = bodyText.match(PRICE_RE)
    if (priceM) {
      const raw = (priceM[1] ?? priceM[2] ?? '').trim()
      price = raw.startsWith('€') ? raw : `€ ${raw}`
    }

    // External ticket link
    let ticket_url: string | null = null
    $('a[href]').each((_i, el) => {
      if (ticket_url) return
      const href = $(el).attr('href') ?? ''
      if (href.startsWith('http') && !href.includes('clubwintercircus.be')) {
        const text = $(el).text().toLowerCase()
        if (/ticket|bestel|koop|buy|reserv/i.test(text) || /ticket/i.test(href)) {
          ticket_url = href
        }
      }
    })

    // Description: first substantial paragraph inside the post content
    let description: string | null = null
    $('article p, .entry-content p, .post-content p, .wp-block-paragraph').each((_i, el) => {
      if (description) return
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (text.length > 40 && !/^(doors?|tickets?|organisatie|€|\d{1,2}\s)/i.test(text)) {
        description = text.slice(0, 600)
      }
    })

    const image_url = $('meta[property="og:image"]').attr('content')
      ?? $('article img[src], .entry-content img[src]').first().attr('src')
      ?? null

    return { date_start, hour_start, price, ticket_url, description, image_url }
  } catch {
    return { date_start: null, hour_start: null, price: null, ticket_url: null, description: null, image_url: null }
  }
}

// �€�€ listing page �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html = await fetchHtml(BASE_URL)
  const $    = parseCheerio(html)
  const now  = new Date().toISOString()

  // Collect event stubs: { slug_url, title, shortDate }
  const stubs: Array<{ url: string; title: string; shortDate: string | null }> = []
  const seen  = new Set<string>()

  // Each event block has an <h2> containing an anchor to the event slug
  $('h2').each((_i, el) => {
    const $h2   = $(el)
    const $a    = $h2.find('a[href]').first()
    if (!$a.length) return

    const href  = ($a.attr('href') ?? '').trim()
    const title = $a.text().trim()
    if (!href || !title) return

    // Parse URL: must be from same domain, not a non-event path
    let path: string
    try {
      const u = new URL(href, BASE_URL)
      if (!u.hostname.includes('clubwintercircus.be')) return
      path = u.pathname
    } catch {
      path = href
    }

    if (NON_EVENT_RE.test(path)) return
    if (NON_EVENT_PATHS.has(path)) return

    const slug_url = `${BASE_URL}${path.endsWith('/') ? path : path + '/'}`
    if (seen.has(slug_url)) return
    seen.add(slug_url)

    // Find short date �€� it's in a sibling/cousin anchor with text like "19 jun"
    let shortDate: string | null = null
    const $parent  = $h2.parent()
    $parent.find('a[href]').each((_j, linkEl) => {
      if (shortDate) return
      const linkHref = $(linkEl).attr('href') ?? ''
      if (!linkHref.includes(path.replace(/\/$/, ''))) return
      const linkText = $(linkEl).text().trim()
      if (SHORT_DATE_RE.test(linkText)) shortDate = linkText
    })

    stubs.push({ url: slug_url, title, shortDate })
  })

  if (stubs.length === 0) return makeScraperResult(SOURCE_ID, [])

  // Fetch detail pages in batches of 4
  const events: RawVenueEvent[] = []
  const BATCH = 4
  for (let i = 0; i < stubs.length; i += BATCH) {
    const batch = stubs.slice(i, i + BATCH)
    const details = await Promise.all(batch.map(s => fetchDetail(s.url)))

    for (let j = 0; j < batch.length; j++) {
      const { url, title, shortDate } = batch[j]
      const d = details[j]

      // Prefer detail-page date; fall back to shortDate from listing
      let date_start = d.date_start
      if (!date_start && shortDate) {
        const m = shortDate.match(SHORT_DATE_RE)
        if (m) date_start = parseNlDate(`${m[1]} ${m[2]}`)
      }
      if (!date_start) continue

      events.push({
        _source:     'clubwintercircus',
        _scraped_at: now,
        venue_id:    VENUE_ID,
        venue_name:  VENUE_NAME,
        title,
        date_start,
        source_url:  url,
        hour_start:  d.hour_start,
        room:        null,
        description: d.description,
        price:       d.price,
        ticket_url:  d.ticket_url ?? url,
        image_url:   d.image_url,
        artists_raw: null,
      })
    }
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
