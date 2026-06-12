import { fetchHtml } from '../../lib/http.js'
import { parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'haconcerts'
const VENUE_ID   = 'ha_concerts'
const VENUE_NAME = 'Ha Concerts'
const BASE_URL   = 'https://www.haconcerts.be'
const SCRAPE_URL = `${BASE_URL}/nl/concertagenda`
const MAX_PAGES  = 8

// Ha Concerts (Creem CMS) event URLs: /nl/concertagenda/concerten/<slug>
// Slug always ends with the date: e.g. "de-kortste-nacht-20-06-26" → 2026-06-20
const CONCERT_HREF_RE = /\/nl\/concertagenda\/concerten\/[a-z0-9-]+$/
const SLUG_DATE_RE    = /-(\d{2})-(\d{2})-(\d{2})$/  // DD-MM-YY at end

// Time in link text: "22:03" or "09:30"
const TIME_RE = /\b(\d{2}):(\d{2})\b/

function parseDateFromSlug(href: string): string | null {
  const slug  = href.split('/').pop() ?? ''
  const match = slug.match(SLUG_DATE_RE)
  if (!match) return null
  const [, dd, mm, yy] = match
  const year = 2000 + parseInt(yy, 10)
  return `${year}-${mm}-${dd}`
}

// Extract h3/h2 title from inside the anchor, falling back to slug → title-case
function titleFromSlug(href: string): string {
  const slug   = href.split('/').pop() ?? ''
  const noDate = slug.replace(SLUG_DATE_RE, '')
  return noDate
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function scrapePage(url: string, now: string): Promise<RawVenueEvent[]> {
  const html = await fetchHtml(url)
  const $    = parseCheerio(html)
  const events: RawVenueEvent[] = []

  $('a[href]').each((_i, el) => {
    const $el  = $(el)
    const href = ($el.attr('href') ?? '').trim()
    if (!CONCERT_HREF_RE.test(href)) return

    const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`
    const date_start = parseDateFromSlug(href)
    if (!date_start) return

    // Prefer <h3> or <h2> inside the anchor for the title
    let title = $el.find('h3, h2, h4').first().text().trim()
    if (!title) {
      // Fall back to slug-derived title
      title = titleFromSlug(href)
    }
    if (!title) return

    // Time from anchor text
    const anchorText = $el.text().replace(/\s+/g, ' ').trim()
    const timeMatch  = anchorText.match(TIME_RE)
    const hour_start = timeMatch ? parseTime(`${timeMatch[1]}:${timeMatch[2]}`) : null

    // Description: anchor text after removing the heading and stripping time/CTA
    let description: string | null = null
    const headingText = $el.find('h3, h2, h4').first().text().replace(/\s+/g, ' ').trim()
    if (headingText) {
      const afterHeading = anchorText.slice(anchorText.indexOf(headingText) + headingText.length).trim()
      // Strip trailing time (HH:MM) and CTA words
      const cleaned = afterHeading
        .replace(/\s*\d{1,2}:\d{2}\b.*$/, '')
        .replace(/\s*Tickets?\s*kopen?\s*$/i, '')
        .replace(/\s*Tickets?\s*$/i, '')
        .trim()
      if (cleaned.length > 15) description = cleaned
    }

    // Price hint: look for "€" in a sibling element near the anchor
    let price: string | null = null
    const $parent = $el.closest('li, article, .concert-item, div').first()
    const priceM  = $parent.text().match(/€\s*[\d,.]+/)
    if (priceM) price = priceM[0].trim()

    events.push({
      _source:     'haconcerts',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start,
      room:        null,
      description,
      price,
      ticket_url:  source_url,
      artists_raw: null,
    })
  })

  return events
}

// Detail page (Creem CMS): poster image, real price, fuller description
interface HaDetail {
  image_url:   string | null
  price:       string | null
  description: string | null
}

async function fetchDetail(url: string): Promise<HaDetail> {
  try {
    const html = await fetchHtml(url)
    const $    = parseCheerio(html)

    const image_url = $('meta[property="og:image"]').attr('content')
      ?? $('main img[src], article img[src]').first().attr('src')
      ?? null

    const bodyText = $('body').text()
    let price: string | null = null
    const priceM = bodyText.match(/€\s*[\d,.]+/)
    if (priceM) price = priceM[0].trim()
    else if (/\bgratis\b/i.test(bodyText)) price = 'gratis'

    const parts: string[] = []
    $('h1').first().nextAll('p').each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (!text || text.length < 25) return
      if ($(el).closest('nav, footer, header').length) return
      parts.push(text)
      if (parts.join(' ').length > 600) return false as unknown as void
    })
    const description = parts.length ? parts.join(' ').slice(0, 600) : null

    return { image_url, price, description }
  } catch {
    return { image_url: null, price: null, description: null }
  }
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const now    = new Date().toISOString()
  const events: RawVenueEvent[] = []
  const seen   = new Set<string>()

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url      = page === 1 ? SCRAPE_URL : `${SCRAPE_URL}?p=${page}`
    const pageEvts = await scrapePage(url, now)

    if (pageEvts.length === 0 && page > 1) break  // no more pages

    for (const ev of pageEvts) {
      const key = ev.source_url ?? `${ev.title}|${ev.date_start}`
      if (!seen.has(key)) {
        seen.add(key)
        events.push(ev)
      }
    }
  }

  // Detail enrich: image + price + description (price filled 0/50 from the
  // listing alone — it lives on the detail page)
  const BATCH = 5
  for (let i = 0; i < events.length; i += BATCH) {
    const batch   = events.slice(i, i + BATCH)
    const details = await Promise.all(batch.map(ev => fetchDetail(ev.source_url ?? '')))
    batch.forEach((ev, j) => {
      const d = details[j]
      ev.image_url   = d.image_url
      ev.price       = ev.price ?? d.price
      ev.description = d.description ?? ev.description
    })
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
