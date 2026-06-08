import { fetchHtml } from '../../lib/http.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'thecrossover'
const VENUE_ID   = 'thecrossover'
const VENUE_NAME = 'The Crossover'
const BASE_URL   = 'https://www.thecrossover.be'
const SCRAPE_URL = `${BASE_URL}/`

// Dutch month names → zero-padded month number
const NL_MONTHS: Record<string, string> = {
  januari: '01', februari: '02', maart: '03', april: '04',
  mei: '05', juni: '06', juli: '07', augustus: '08',
  september: '09', oktober: '10', november: '11', december: '12',
  jan: '01', feb: '02', mrt: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dec: '12',
}

/**
 * Parse a Dutch date string like "vr 12 juni" or "30 oktober" → YYYY-MM-DD.
 * Year: if the date is >7 days in the past, assume next year.
 */
function parseDutchDate(raw: string): string | null {
  const cleaned = raw.toLowerCase().replace(/[^\w\s]/g, '').trim()
  const m = cleaned.match(/(?:ma|di|wo|do|vr|za|zo)?\s*(\d{1,2})\s+([a-z]+)/)
  if (!m) return null
  const day   = String(parseInt(m[1], 10)).padStart(2, '0')
  const month = NL_MONTHS[m[2]]
  if (!month) return null

  const today = new Date()
  const year  = today.getFullYear()
  const candidate     = `${year}-${month}-${day}`
  const candidateDate = new Date(candidate)
  if (candidateDate.getTime() < today.getTime() - 7 * 24 * 3600 * 1000) {
    return `${year + 1}-${month}-${day}`
  }
  return candidate
}

function parseTime(raw: string): string | null {
  const m = raw.match(/(\d{1,2})[h:](\d{2})/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  const m2 = raw.match(/(\d{1,2})h\b/)
  if (m2) return `${m2[1].padStart(2, '0')}:00`
  return null
}

function parsePrice(raw: string): string | null {
  const m = raw.match(/\d+[,.]\d{2}/)
  return m ? m[0] : null
}

/**
 * Collect all event detail URLs from the listing page.
 * Grabs all internal hrefs, strips out nav/registration/external links.
 */
function collectEventUrls(html: string): string[] {
  const $ = parseCheerio(html)
  const urls = new Set<string>()

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') ?? ''
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    // Skip non-event internal paths
    if (/\/(nieuws|music-pub|menukaart|history|veelgestelde-vragen|wachtwoord|lost-user|algemene|privacybeleid)/.test(href)) return
    // Skip registration sub-pages
    if (/\/(individual|group)-registration|\/registration/.test(href)) return
    // Skip external links that aren't thecrossover.be
    if (href.startsWith('http') && !href.startsWith(BASE_URL)) return

    const full = href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
    const path = new URL(full).pathname
    if (path === '/' || path === '') return
    urls.add(full)
  })

  return [...urls]
}

/**
 * Scrape one event detail page. Returns null if title or date can't be extracted.
 */
async function scrapeDetailPage(url: string, now: string): Promise<RawVenueEvent | null> {
  let html: string
  try {
    html = await fetchHtml(url)
  } catch {
    return null
  }

  const $ = parseCheerio(html)

  const title = $('h1').first().text().trim()
    || $('title').text().replace(/[-|].*$/, '').trim()
  if (!title) return null

  let date_start: string | null = null
  let hour_start: string | null = null
  let price: string | null      = null

  // Detail pages have a <ul> with items: "vr 12 juni", "20:30", "+25", "12,00"
  $('ul, ol').each((_i, listEl) => {
    if (date_start && hour_start && price) return
    $(listEl).children('li').each((_j, li) => {
      const text = $(li).text().trim()
      if (!date_start) { const d = parseDutchDate(text); if (d) date_start = d }
      if (!hour_start) { const t = parseTime(text);      if (t) hour_start = t }
      if (!price)      { const p = parsePrice(text);     if (p) price = p      }
    })
  })

  // Fallback: scan any element for a date if list parse missed it
  if (!date_start) {
    $('p, span, div, li').each((_i, el) => {
      if (date_start) return
      const d = parseDutchDate($(el).text().trim())
      if (d) date_start = d
    })
  }

  if (!date_start) return null

  let description: string | null = null
  $('p').each((_i, el) => {
    if (description) return
    const text = $(el).text().trim()
    if (text.length > 30) description = text
  })

  const ticketHref = $('a[href*="registration"], a[href*="ticket"]').first().attr('href') ?? null
  const ticket_url = ticketHref
    ? (ticketHref.startsWith('http') ? ticketHref : `${BASE_URL}${ticketHref}`)
    : null

  return {
    _source:     SOURCE_ID,
    _scraped_at: now,
    venue_id:    VENUE_ID,
    venue_name:  VENUE_NAME,
    title,
    date_start,
    source_url:  url,
    hour_start,
    room:        null,
    description,
    price,
    ticket_url,
    artists_raw: null,
  }
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html      = await fetchHtml(SCRAPE_URL)
  const eventUrls = collectEventUrls(html)

  const now    = new Date().toISOString()
  const events: RawVenueEvent[] = []

  // Fetch detail pages in batches of 4
  const CONCURRENCY = 4
  for (let i = 0; i < eventUrls.length; i += CONCURRENCY) {
    const batch   = eventUrls.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(url => scrapeDetailPage(url, now)))
    for (const ev of results) {
      if (ev) events.push(ev)
    }
  }

  // Deduplicate by source_url
  const seen    = new Set<string>()
  const deduped = events.filter(ev => {
    if (seen.has(ev.source_url)) return false
    seen.add(ev.source_url)
    return true
  })

  return makeScraperResult(SOURCE_ID, deduped)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
