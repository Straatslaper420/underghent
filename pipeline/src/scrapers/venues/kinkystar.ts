/**
 * Kinky Star scraper — REWRITTEN 2026-06 for the new kinkystar.com site
 * (Stager platform, server-rendered — the old kinkystar.com/programma now
 * redirects to www.kinkystar.com/nl and the old Playwright text-walker found
 * nothing useful on it).
 *
 * Listing:  https://www.kinkystar.com/nl  (+ ?page=2, ?page=3, …)
 * Detail:   /nl/events/YYYY-MM-DD-slug    ← date is IN the slug (very stable)
 *
 * The listing card exposes: title (h2/h3 link), poster image, a
 * "weekdag D maand YYYY - HH:MM · prijs" line and genre/type tags.
 * The detail page adds the description/line-up (og:description) and a
 * "Programma" block with door times.
 */
import { fetchHtml } from '../../lib/http.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'kinkystar'

const VENUE_ID   = 'kinkystar'
const VENUE_NAME = 'Kinky Star'
const BASE_URL   = 'https://www.kinkystar.com'
const LIST_URL   = `${BASE_URL}/nl`
const MAX_PAGES  = 6
const DETAIL_BATCH = 4

// /nl/events/2026-06-13-belgian-junglists-night → date + slug
const EVENT_HREF_RE = /\/nl\/events\/(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)/i
const TIME_RE  = /\b(\d{1,2}):(\d{2})\b/
const PRICE_RE = /Gratis|€\s*[\d,.]+/i

// Genre tags the site uses (matched against the card's concatenated tag text)
const KNOWN_GENRES = [
  'Drum & Bass', 'Hip Hop', 'Singer-Songwriter',
  'Punk', 'Metal', 'Jazz', 'Electronic', 'Rock', 'Wave', 'Experimental',
  'Folk', 'Pop', 'Indie', 'Hardcore', 'Techno', 'House', 'Reggae', 'Ska',
  'Garage', 'Psych', 'Noise', 'Blues', 'Funk', 'Soul', 'Ambient',
]

const SUBTITLE_HINTS = [
  'invites', 'presents', 'night', 'fest', 'rave', 'matinee', 'open mic', 'release', 'party',
]

// Kept from the old scraper — artist names hide in the titles
// ("KINKY KAPOT: VerpesT (BE) + Aphelium (BE)").
function extractArtists(title: string): string | null {
  if (title.includes(' + ')) {
    const afterColon = title.includes(':') ? title.slice(title.indexOf(':') + 1).trim() : title
    return afterColon.split(' + ').map(s => s.trim()).filter(Boolean).join(', ') || null
  }
  if (title.includes(':')) {
    const segment = title.slice(title.indexOf(':') + 1).trim()
    if (!segment) return null
    if (segment === segment.toLowerCase()) return null
    const lower = segment.toLowerCase()
    for (const hint of SUBTITLE_HINTS) {
      if (lower.includes(hint)) return null
    }
    return segment
  }
  return null
}

function slugToTitle(slug: string): string {
  return slug.replace(/-+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

function genresFrom(text: string): string | null {
  const found = KNOWN_GENRES.filter(g => text.toLowerCase().includes(g.toLowerCase()))
  return found.length ? found.join(', ') : null
}

interface Detail {
  description: string | null
  support_raw: string | null
  image_url:   string | null
  hour_start:  string | null
  price:       string | null
  genre_raw:   string | null
}

async function fetchDetail(url: string): Promise<Detail> {
  const out: Detail = { description: null, support_raw: null, image_url: null, hour_start: null, price: null, genre_raw: null }
  try {
    const html = await fetchHtml(url)
    const $    = parseCheerio(html)

    out.image_url = $('meta[property="og:image"]').attr('content') ?? null

    const ogDesc = ($('meta[property="og:description"]').attr('content') ?? '')
      .replace(/&amp;/g, '&').trim()
    if (ogDesc) out.description = ogDesc.slice(0, 800)

    // Line-up names → support acts ("Line Up- Name- Name- …")
    const lineupM = ogDesc.match(/line\s*-?\s*up:?\s*(.+)/i)
    if (lineupM) {
      const names = lineupM[1]
        .split(/\s*-\s+|\n/)
        .map(s => s.trim())
        .filter(s => s.length > 1 && s.length < 40 && !/available|tickets?|records?/i.test(s))
      if (names.length) out.support_raw = names.join(', ')
    }

    const bodyText = $('main').text() || $('body').text()
    const dateLine = bodyText.match(/\b\d{1,2}\s+\w+\s+\d{4}\s*[-–]\s*(\d{1,2}):(\d{2})/)
    if (dateLine) out.hour_start = `${dateLine[1].padStart(2, '0')}:${dateLine[2]}`

    const priceM = bodyText.match(PRICE_RE)
    if (priceM) out.price = priceM[0].trim()

    out.genre_raw = genresFrom(bodyText.slice(0, 2000))
  } catch { /* defensive: detail enrich is best-effort */ }
  return out
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const now    = new Date().toISOString()
  const events: RawVenueEvent[] = []
  const seen   = new Set<string>()

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url  = page === 1 ? LIST_URL : `${LIST_URL}?page=${page}`
    let html: string
    try {
      html = await fetchHtml(url)
    } catch {
      break
    }
    const $ = parseCheerio(html)

    let newOnPage = 0
    $('a[href]').each((_i, a) => {
      const href = $(a).attr('href') ?? ''
      const m = href.match(EVENT_HREF_RE)
      if (!m) return
      const [, date_start, slug] = m
      const abs = href.startsWith('http') ? href : `${BASE_URL}${href}`
      if (seen.has(abs)) return
      seen.add(abs)
      newOnPage++

      // Card container: nearest ancestor that carries a time or price line
      let $card = $(a)
      for (let d = 0; d < 5; d++) {
        const $p = $card.parent()
        if (!$p.length) break
        $card = $p
        const t = $card.text()
        if (TIME_RE.test(t) && t.length > 40) break
      }
      const cardText = $card.text().replace(/\s+/g, ' ').trim()

      // Title: heading inside the card, else the anchor text, else the slug
      const heading = $card.find('h1, h2, h3').first().text().replace(/\s+/g, ' ').trim()
      const anchorText = $(a).text().replace(/\s+/g, ' ').trim()
      const title = heading || (anchorText.length > 3 && anchorText.length < 120 ? anchorText : '') || slugToTitle(slug)

      const timeM  = cardText.match(/[-–]\s*(\d{1,2}):(\d{2})/) ?? cardText.match(TIME_RE)
      const priceM = cardText.match(PRICE_RE)
      const img    = $card.find('img[src*="stager"], img[src]').first().attr('src') ?? null

      events.push({
        _source:     'kinkystar',
        _scraped_at: now,
        venue_id:    VENUE_ID,
        venue_name:  VENUE_NAME,
        title,
        date_start,
        source_url:  abs,
        hour_start:  timeM ? `${timeM[1].padStart(2, '0')}:${timeM[2]}` : null,
        room:        null,
        description: null,
        price:       priceM ? priceM[0].trim() : null,
        ticket_url:  null,
        image_url:   img,
        genre_raw:   genresFrom(cardText),
        artists_raw: extractArtists(title),
      })
    })

    if (newOnPage === 0) break
  }

  // Detail enrich (description, line-up, og:image, missing time/price)
  for (let i = 0; i < events.length; i += DETAIL_BATCH) {
    const batch   = events.slice(i, i + DETAIL_BATCH)
    const details = await Promise.all(batch.map(e => fetchDetail(e.source_url ?? '')))
    batch.forEach((e, j) => {
      const d = details[j]
      e.description = d.description ?? e.description
      e.support_raw = d.support_raw ?? null
      e.image_url   = e.image_url ?? d.image_url
      e.hour_start  = e.hour_start ?? d.hour_start
      e.price       = e.price ?? d.price
      e.genre_raw   = e.genre_raw ?? d.genre_raw
    })
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
