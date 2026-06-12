/**
 * VIERNULVIER scraper (Peppered CMS) �€� uses Playwright for reliable rendering.
 * Events: https://www.viernulvier.gent/nl/agenda
 * URL pattern: /nl/agenda/<slug>  (slug ends with 4-char hash, e.g. "han-solo-5258")
 *
 * NOTE: viernulvier sometimes lists events "in Club Wintercircus".
 * Those are EXCLUDED here �€� clubwintercircus.ts has its own scraper.
 */
import { fetchHtml } from '../../lib/http.js'
import { parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID      = 'viernulvier'
export const requiresPlaywright = true

const VENUE_ID   = 'viernulvier'
const VENUE_NAME = 'VIERNULVIER'
const BASE_URL   = 'https://www.viernulvier.gent'
const SCRAPE_URL = `${BASE_URL}/nl/agenda`
const MAX_PAGES  = 12

// Slug ends with -[a-z0-9]{3,5} hash (e.g. -b856, -5258, -m1qq)
const EVENT_HREF_RE = /\/(?:nl|en)\/agenda\/[^\s?#]+-[a-z0-9]{3,5}$/i
// Date: DD.MM format (e.g. "11.06", "20.06")
const DOTDATE_RE    = /\b(\d{1,2})\.(\d{2})\b/
const TIME_RE       = /\b(\d{2}:\d{2})\b/

const DETAIL_BATCH    = 5
const TICKET_RE       = /\/order\/add\/|ticketmatic\.com/i
const PRICE_RE        = /€\s*[\d,.]+/

interface PepperedDetail {
  description: string | null
  price:       string | null
  ticket_url:  string | null
  artists_raw: string | null
  image_url:   string | null
  hour_start:  string | null
}

async function fetchDetail(url: string): Promise<PepperedDetail> {
  try {
    const html = await fetchHtml(url)
    const $    = parseCheerio(html)

    // Ticket URL
    let ticket_url: string | null = null
    $('a[href]').each((_i, el) => {
      if (ticket_url) return
      const href = $(el).attr('href') ?? ''
      if (TICKET_RE.test(href)) {
        ticket_url = href.startsWith('http') ? href : `${BASE_URL}${href}`
      }
    })

    // Price: € XX,XX or "gratis"
    let price: string | null = null
    const bodyText = $('body').text()
    const priceM   = bodyText.match(PRICE_RE)
    if (priceM) price = priceM[0].trim()
    else if (/\bgratis\b/i.test(bodyText)) price = 'gratis'

    // Description: paragraphs following h1, stop at "Anderen bekeken"
    const parts: string[] = []
    $('h1').first().nextAll('p, h2, h3').each((_i, el) => {
      const tag  = ((el as { tagName?: string }).tagName ?? '').toLowerCase()
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (/anderen bekeken|cookies/i.test(text)) return false as unknown as void
      if (!text || text.length < 15) return
      if ($(el).closest('nav, footer, header').length) return
      parts.push(text)
      if (parts.join(' ').length > 600) return false as unknown as void
    })
    const description = parts.length ? parts.join(' ').slice(0, 600) : null

    // Artists: subtitle (h2 right after h1) if short enough to be a name
    const subtitle    = $('h1').first().next('h2').text().trim()
    const artists_raw = subtitle && subtitle.length < 120 ? subtitle : null

    // Poster image
    const image_url = $('meta[property="og:image"]').attr('content') ?? null

    // Start time: labeled time first ("deuren/aanvang/start 20:00"), else the
    // first HH:MM in the main content
    let hour_start: string | null = null
    const labeled = bodyText.match(/(?:deuren|doors|aanvang|start)\D{0,12}(\d{1,2})[:.](\d{2})/i)
    if (labeled) hour_start = `${labeled[1].padStart(2, '0')}:${labeled[2]}`
    else {
      const anyTime = bodyText.match(/\b(\d{2}):(\d{2})\b/)
      if (anyTime) hour_start = `${anyTime[1]}:${anyTime[2]}`
    }

    return { description, price, ticket_url, artists_raw, image_url, hour_start }
  } catch {
    return { description: null, price: null, ticket_url: null, artists_raw: null, image_url: null, hour_start: null }
  }
}

// �€�€ helpers �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

function parseDotDate(day: string, month: string): string | null {
  const d = parseInt(day,   10)
  const m = parseInt(month, 10)
  if (d < 1 || d > 31 || m < 1 || m > 12) return null
  const now  = new Date()
  let year   = now.getFullYear()
  const cand = new Date(year, m - 1, d)
  if (cand < now) year++
  const yy = year
  const mm  = String(m).padStart(2, '0')
  const dd  = String(d).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEvent(card: any, now: string): RawVenueEvent | null {
  const text: string = (card.text  ?? '').replace(/\s+/g, ' ').trim()
  const href: string = card.href   ?? ''
  const tags: string = (card.tags  ?? '').toLowerCase()
  if (!href) return null

  // Exclude events taking place at Club Wintercircus (separate scraper)
  if (/club\s*wintercircus/i.test(tags) || /club\s*wintercircus/i.test(text)) return null

  // Parse date (first DD.MM in text)
  const dotM = text.match(DOTDATE_RE)
  if (!dotM) return null
  const date_start = parseDotDate(dotM[1], dotM[2])
  if (!date_start) return null

  // Title: text before the date
  const dateIdx = text.search(DOTDATE_RE)
  const title   = (dateIdx > 0 ? text.slice(0, dateIdx) : text).trim()
  if (!title) return null

  // Time
  const timeM     = text.match(TIME_RE)
  const hour_start = timeM ? parseTime(timeM[1]) : null

  // Room: last meaningful segment after time in the text
  let room: string | null = null
  if (timeM) {
    const after    = text.slice(text.lastIndexOf(timeM[1]) + timeM[1].length).trim()
    const segments = after.split(/\s{2,}|[\n\r]/)
    const last     = segments[segments.length - 1]?.trim()
    if (last && last.length > 1 && last.length < 60 && !/^\d/.test(last)) room = last
  }

  const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`

  return {
    _source:     'viernulvier',
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
    ticket_url:  source_url,
    genre_raw:   tags.trim() || null,
    artists_raw: null,
  }
}

async function scrapeWithPlaywright(): Promise<ScraperResult<RawVenueEvent>> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'nl-BE',
  })
  const page    = await context.newPage()
  const now     = new Date().toISOString()
  const events: RawVenueEvent[] = []
  const seen    = new Set<string>()

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = pageNum === 1 ? SCRAPE_URL : `${SCRAPE_URL}?page=${pageNum}`
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(1500)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cards: any[] = await page.evaluate((eventHrefRe: string) => {
        const re      = new RegExp(eventHrefRe, 'i')
        // @ts-ignore �€� document is available in Playwright browser context
        const items   = Array.from((document as any).querySelectorAll('li, article'))
        const results: { text: string; href: string; tags: string }[] = []
        const hrefs   = new Set<string>()

        for (const item of items as any[]) {
          const links = Array.from((item as any).querySelectorAll('a[href]'))
          let mainLink: any = null
          let mainText      = ''
          for (const link of links as any[]) {
            const href: string = (link as any).href ?? ''
            if (!re.test(href)) continue
            const text: string = ((link as any).innerText ?? (link as any).textContent ?? '').trim()
            if (text.length > mainText.length) { mainLink = link; mainText = text }
          }
          if (!mainLink || !mainText) continue
          const href: string = mainLink.href ?? ''
          if (hrefs.has(href)) continue
          hrefs.add(href)

          const fullText: string = ((item as any).innerText ?? (item as any).textContent ?? '').replace(/\s+/g, ' ').trim()
          const tagLinks: string[] = Array.from((item as any).querySelectorAll('a[href*="genres"]'))
            .map((a: any) => ((a as any).innerText ?? '').trim())
          const tags = tagLinks.join(' ')

          results.push({ text: fullText, href, tags })
        }
        return results
      }, EVENT_HREF_RE.source)

      const pageEvents: RawVenueEvent[] = []
      for (const card of cards) {
        const ev = buildEvent(card, now)
        if (!ev) continue
        if (seen.has(ev.source_url ?? "")) continue
        seen.add(ev.source_url ?? "")
        pageEvents.push(ev)
      }

      if (pageEvents.length === 0 && pageNum > 1) break
      events.push(...pageEvents)
    }
  } finally {
    await browser.close()
  }

  // Enrich with detail pages (description, price, ticket_url, artists)
  for (let i = 0; i < events.length; i += DETAIL_BATCH) {
    const batch   = events.slice(i, i + DETAIL_BATCH)
    const details = await Promise.all(batch.map(ev => fetchDetail(ev.source_url ?? '')))
    for (let j = 0; j < batch.length; j++) {
      const d = details[j]
      batch[j].description = d.description
      batch[j].price       = d.price
      batch[j].ticket_url  = d.ticket_url ?? batch[j].ticket_url
      batch[j].artists_raw = d.artists_raw
      batch[j].image_url   = d.image_url
      batch[j].hour_start  = batch[j].hour_start ?? d.hour_start
    }
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeWithPlaywright, SOURCE_ID)
}
