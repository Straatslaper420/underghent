import { fetchHtml } from '../../lib/http.js'
import { parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'chinastraat'
const VENUE_ID   = 'chinastraat'
const BASE_URL   = 'https://chinastraat.be'
const SCRAPE_URL = `${BASE_URL}/`

function inferYear(day: number, month: number): number {
  const today = new Date()
  const thisYear = today.getFullYear()
  const candidate = new Date(thisYear, month - 1, day)
  return candidate.getTime() < today.getTime() - 86400000 ? thisYear + 1 : thisYear
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html = await fetchHtml(SCRAPE_URL)
  const $    = parseCheerio(html)
  const now  = new Date().toISOString()

  // Build modal map: slug → enriched data
  const modalMap = new Map<string, {
    ticket_url:  string | null
    description: string | null
    artists_raw: string | null
    hour_start:  string | null
    price:       string | null
  }>()

  $('div.agenda_modal.w-dyn-item').each((_i, el) => {
    const $el  = $(el)
    const slug = $el.attr('data-modal') ?? ''
    if (!slug) return

    // Ticket link is the non-Close button in the modal header
    const ticket_url = $el.find('a.btn[href]')
      .filter((_j, a) => {
        const href = $(a).attr('href') ?? ''
        return href !== '#close' && href !== '#event-modal' && href !== ''
      })
      .first().attr('href') ?? null

    let description: string | null = null
    let artists_raw: string | null = null
    let hour_start:  string | null = null
    let price:       string | null = null

    $el.find('.agenda_modal_col .u-rich-text').each((_j, col) => {
      const $col   = $(col)
      const header = $col.find('h3').first().text().trim().toLowerCase()
      const paras  = $col.find('p').map((_k, p) => $(p).text().trim()).toArray().filter(Boolean)
      const lis    = $col.find('li').map((_k, li) => $(li).text().trim()).toArray().filter(Boolean)
      const allText = [...paras, ...lis].join(' ')

      // Time �€� grab from any column
      if (!hour_start) hour_start = parseTime(allText)

      // Price from li items
      if (!price) {
        const priceLi = lis.find(t => /gratis|free|\d+\s*€|€\s*\d+/i.test(t))
        if (priceLi) price = priceLi
      }

      // Description from NL / Bio / Practicals column
      if (!description && (header === 'nl' || header === 'bio' || header === 'practicals')) {
        const descPara = paras.find(p => p.length > 10 && !/^\d/.test(p))
        if (descPara) description = descPara
      }

      // Artists from lineup column
      if (header.includes('line up') || header.includes('lineup')) {
        const lineupText = paras.filter(p => p.length > 1 && p !== '�€�').join(', ')
        if (lineupText) artists_raw = lineupText
      }
    })

    modalMap.set(slug, { ticket_url, description, artists_raw, hour_start, price })
  })

  // Parse event cards
  const events: RawVenueEvent[] = []

  $('div.agenda_card-wrap.w-dyn-item').each((_i, el) => {
    const $el       = $(el)
    const title     = $el.find('.agenda_title').first().text().trim()
    if (!title) return
    if (/^closed/i.test(title)) return

    // Date: three .agenda_date_start spans �€� day, ".", month
    const parts  = $el.find('.agenda_date_start.u-text-style-h1').map((_j, d) => $(d).text().trim()).toArray()
    const day    = parseInt(parts[0] ?? '', 10)
    const month  = parseInt(parts[2] ?? '', 10)
    if (!day || !month) return

    const year       = inferYear(day, month)
    const date_start = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const venueAttr  = $el.attr('data-filter-name') ?? 'Chinastraat'
    const slug       = $el.find('a[data-modal-slug]').first().attr('data-modal-slug') ?? ''
    const modal      = modalMap.get(slug)

    // Card poster (Webflow lazy images may use data-src / srcset)
    const $img   = $el.find('img').first()
    const imgSrc = $img.attr('src') ?? $img.attr('data-src')
      ?? ($img.attr('srcset') ?? '').split(/\s+/)[0] ?? null
    const image_url = imgSrc && /^https?:/.test(imgSrc) ? imgSrc : null

    events.push({
      image_url,
      _source:     'chinastraat',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  venueAttr,
      title,
      date_start,
      source_url:  `${BASE_URL}/#${slug}`,
      hour_start:  modal?.hour_start ?? null,
      room:        venueAttr === 'Bar Bricolage' ? 'Bar Bricolage' : null,
      description: modal?.description ?? null,
      price:       modal?.price ?? null,
      ticket_url:  modal?.ticket_url ?? null,
      artists_raw: modal?.artists_raw ?? null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
