import { fetchHtml } from '../../lib/http.js'
import { parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawReggaebeEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'reggaebe'

const BASE_URL    = 'https://www.reggae.be'
const API_URL     = 'https://reggae-be-kangafarm-0.kangacoders.com/events?uid=1779182994_calendar_index&identifier=calendar_index&locale=NL'

const NL_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mrt: 3, mar: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
}

function inferYear(day: number, monthNum: number): number {
  const today = new Date()
  const thisYear = today.getFullYear()
  const d = new Date(thisYear, monthNum - 1, day)
  // If the date is more than 30 days in the past, it's next year
  return d.getTime() < today.getTime() - 30 * 86400000 ? thisYear + 1 : thisYear
}

async function scrapeList(): Promise<ScraperResult<RawReggaebeEvent>> {
  // API returns a JS call with escaped HTML embedded in the string
  const jsText = await fetchHtml(API_URL)

  // Extract the HTML content from replaceWith('...')
  const start = jsText.indexOf("replaceWith('") + "replaceWith('".length
  const end   = jsText.lastIndexOf("')")
  if (start <= 0 || end <= start) return makeScraperResult(SOURCE_ID, [])

  // Unescape JS string: \" → ", \/ → /, \n → newline, \' → '
  const innerHtml = jsText.slice(start, end)
    .replace(/\\'/g, "'")
    .replace(/\\/g, c => c === '\\' ? '' : c)
    .replace(/\\/g, '')

  // Fall back to a simpler unescape approach via JSON
  let html = ''
  try {
    // Wrap in double quotes, escape internal " and ' → JSON.parse handles \n, \t, etc.
    const jsonStr = '"' + jsText.slice(start, end)
      .replace(/\\'/g, "'")
      .replace(/"/g, '\\"')
      .replace(/\\"/g, '"')  // undo double escaping
      + '"'
    html = JSON.parse(jsonStr) as string
  } catch {
    html = innerHtml
  }

  const $      = parseCheerio(html)
  const events: RawReggaebeEvent[] = []
  const now    = new Date().toISOString()

  $('li.mix.agenda_event').each((_i, el) => {
    const $el = $(el)

    const titleEl = $el.find('h4 a').first()
    const title   = titleEl.text().trim()
    if (!title) return

    const href       = titleEl.attr('href') ?? ''
    const source_url = href ? (href.startsWith('http') ? href : `${BASE_URL}${href}`) : null

    const dayStr   = $el.find('.homeagendaDay').first().text().trim()
    const monthStr = $el.find('.homeagendaYear').first().text().trim().toLowerCase().slice(0, 3)
    const day      = parseInt(dayStr, 10)
    const monthNum = NL_MONTHS[monthStr] ?? 0
    if (!day || !monthNum) return

    const year       = inferYear(day, monthNum)
    const date_start = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const venue_name = $el.find('.homeagendaVenu').first().text().trim() || null
    const city       = $el.find('.homeagendaGemeente').first().text().trim() || null
    const genre_raw  = $el.find('#homeagendacats li').map((_j, li) => $(li).text().trim()).toArray().join(', ') || null

    const idMatch  = href.match(/id=(\d+)/)
    const event_id = idMatch ? idMatch[1] : source_url ?? `reggaebe-${title}-${date_start}`

    // Flyer image (upgrade the 60px thumb to the original where possible)
    const imgSrc = $el.find('img[src]').first().attr('src') ?? null
    const image_url = imgSrc ? imgSrc.replace('/thumb/', '/original/') : null

    // The list payload carries per-event coordinates as data attributes
    const lat = parseFloat($el.attr('data-latitude') ?? '')
    const lng = parseFloat($el.attr('data-longitude') ?? '')

    // Artists hide in "A + B + C" titles
    const artists_raw = title.includes(' + ')
      ? title.split(' + ').map(s => s.trim()).filter(Boolean).join(', ')
      : null

    events.push({
      _source:     'reggaebe',
      _scraped_at: now,
      event_id,
      title,
      date_start,
      source_url,
      hour_start:  parseTime($el.text()),
      venue_name,
      city:        city ?? 'Belgium',
      artists_raw,
      description: null,
      price:       $el.find('.homeagendaPrijs').first().text().trim() || null,
      genre_raw,
      image_url,
      latitude:    Number.isFinite(lat) ? lat : null,
      longitude:   Number.isFinite(lng) ? lng : null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawReggaebeEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
