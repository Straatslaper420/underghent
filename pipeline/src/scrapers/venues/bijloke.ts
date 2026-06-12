/**
 * De Bijloke scraper (Peppered CMS) �€� uses Playwright for reliable rendering.
 * Events: https://www.bijloke.be/nl/programma
 * URL pattern: /nl/programma/<slug>  (slug ends with 4-char hash, e.g. "cote-jardin-y3q2")
 */
import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID      = 'bijloke'
export const requiresPlaywright = true

const VENUE_ID   = 'debijloke'
const VENUE_NAME = 'De Bijloke'
const BASE_URL   = 'https://www.bijloke.be'
const SCRAPE_URL = `${BASE_URL}/nl/programma`
const MAX_PAGES  = 20

// Slug ends with -[a-z0-9]{3,5} hash
const EVENT_HREF_RE = /\/(?:nl|en)\/programma\/[^\s?#]+-[a-z0-9]{3,5}$/i
const NL_DATE_RE    = /\b(ma|di|wo|do|vr|za|zo)\s+(\d{1,2})\s+(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\b/i
const TIME_RE       = /\b(\d{2}:\d{2})\b/

const DETAIL_BATCH = 5
const TICKET_RE    = /ticketmatic\.com|\/order\/add\//i
const PRICE_RE     = /€\s*[\d,.]+/

interface BijlokeDetail {
  description: string | null
  price:       string | null
  ticket_url:  string | null
  artists_raw: string | null
  image_url:   string | null
}

async function fetchDetail(url: string): Promise<BijlokeDetail> {
  try {
    const html = await fetchHtml(url)
    const $    = parseCheerio(html)

    // Ticket URL
    let ticket_url: string | null = null
    $('a[href]').each((_i, el) => {
      if (ticket_url) return
      const href = $(el).attr('href') ?? ''
      // Skip the generic shop homepage (not event-specific)
      if (TICKET_RE.test(href) && !href.includes('/bijloke/shop')) {
        ticket_url = href.startsWith('http') ? href : `${BASE_URL}${href}`
      }
    })

    // Price: € XX,XX or "gratis"
    let price: string | null = null
    const bodyText = $('body').text()
    const priceM   = bodyText.match(PRICE_RE)
    if (priceM) price = priceM[0].trim()
    else if (/\bgratis\b/i.test(bodyText)) price = 'gratis'

    // Description: scan all <p> elements (Peppered CMS nests content deep)
    const parts: string[] = []
    $('p').each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if ($(el).closest('nav, footer, header').length) return
      if (/anderen bekeken|cookies|bereikbaarheid|volg ons|facebook|instagram/i.test(text)) return false as unknown as void
      if (!text || text.length < 25) return
      parts.push(text)
      if (parts.join(' ').length > 600) return false as unknown as void
    })
    const description = parts.length ? parts.join(' ').slice(0, 600) : null

    // Artists: subtitle (h2 right after h1) if short enough to be a name
    const subtitle    = $('h1').first().next('h2').text().trim()
    const artists_raw = subtitle && subtitle.length < 120 ? subtitle : null

    const image_url = $('meta[property="og:image"]').attr('content') ?? null

    return { description, price, ticket_url, artists_raw, image_url }
  } catch {
    return { description: null, price: null, ticket_url: null, artists_raw: null, image_url: null }
  }
}

// �€�€ helpers �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEvent(card: any, now: string): RawVenueEvent | null {
  const text: string = (card.text ?? '').replace(/\s+/g, ' ').trim()
  const href: string = card.href ?? ''
  if (!href) return null

  // Parse date from text
  const dateM = text.match(NL_DATE_RE)
  if (!dateM) return null
  const date_start = parseNlDate(`${dateM[2]} ${dateM[3]}`)
  if (!date_start) return null

  // Title: text before the date match
  const dateIdx = text.search(NL_DATE_RE)
  const title   = (dateIdx > 0 ? text.slice(0, dateIdx) : text).trim()
  if (!title) return null

  // Time
  const timeM     = text.match(TIME_RE)
  const hour_start = timeM ? parseTime(timeM[1]) : null

  // Room: text after time (last meaningful segment)
  let room: string | null = null
  if (timeM) {
    const after    = text.slice(text.lastIndexOf(timeM[1]) + timeM[1].length).trim()
    const segments = after.split(/[,\s]{2,}/)
    const last     = segments[segments.length - 1]?.trim()
    if (last && last.length > 1 && last.length < 80) room = last
  }

  const source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`

  return {
    _source:     'bijloke',
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
        const anchors = Array.from((document as any).querySelectorAll('a[href]'))
        const cardMap = new Map<string, { text: string; href: string }>()
        for (const a of anchors as any[]) {
          const href: string = (a as any).href ?? ''
          if (!re.test(href)) continue
          const text: string = ((a as any).innerText ?? (a as any).textContent ?? '').trim()
          if (text.length < 5) continue
          if (!cardMap.has(href) || cardMap.get(href)!.text.length < text.length) {
            cardMap.set(href, { text, href })
          }
        }
        return Array.from(cardMap.values())
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
    }
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeWithPlaywright, SOURCE_ID)
}
