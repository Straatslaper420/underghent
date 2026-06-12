import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'trefpunt'
const VENUE_ID   = 'trefpunt'
const VENUE_NAME = 'Trefpunt'
const BASE_URL   = 'https://trefpunt.be'
const SCRAPE_URL = `${BASE_URL}/agenda/`

// ALL-CAPS date header at the START of a bold element: "VR 12 JUN" / "DO 18 JUNI"
const DATE_HEADER_RE = /^(MA|DI(?:N)?|WO(?:E)?|DO|VR|ZAT?|ZO)\s+(\d{1,2})\s+(JAN(?:UARI)?|FEB(?:RUARI)?|MRT|MAART|APR(?:IL)?|MEI|JUN(?:I)?|JUL(?:I)?|AUG(?:USTUS)?|SEP(?:TEMBER)?|OKT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)/i

// Room + time: "CONCERTZAAL // 20u30" or "CAFE // 20u" or "WALTER DE BUCKPLEIN // 18u"
const ROOM_TIME_RE = /([\w\s()]+?)\s*\/\/\s*(\d{1,2}u\d{0,2})/i

// Regex that matches the end of a close_132 img tag in raw HTML
const SEP_RE = /close_132[^"']*["'][^>]*\/?>/i

function normalizeMonth(raw: string): string {
  return raw.toLowerCase()
    .replace('januari', 'jan').replace('februari', 'feb')
    .replace('maart', 'mrt').replace('april', 'apr')
    .replace('juni', 'jun').replace('juli', 'jul')
    .replace('augustus', 'aug').replace('september', 'sep')
    .replace('oktober', 'okt').replace('november', 'nov')
    .replace('december', 'dec')
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html = await fetchHtml(SCRAPE_URL)
  const events: RawVenueEvent[] = []
  const seen  = new Set<string>()
  const now   = new Date().toISOString()

  // Split raw HTML at each close_132 separator image.
  // This bypasses DOM-structure issues entirely — it doesn't matter whether the
  // images are in <p>, <div>, <figure>, etc.
  //
  // After splitting, each block[i] (i >= 1, i < blocks.length-1) contains one event:
  //   <p><strong>Expanded Title</strong></p>       <- block[i] starts here
  //   <p>Description...</p>
  //   <p>ROOM // TIME<br>VVK: €X</p>
  //   <p>[Facebook][tickets]</p>
  //   <p><strong>WEEKDAY D MON<br>Title</strong></p>  <- date card
  //   <p><img event-photo></p>
  //   <p>Short desc + links</p>
  //   ...                                          <- block[i] ends before next sep

  const blocks = html.split(SEP_RE)
  // blocks[0] = site header/nav (skip)
  // blocks[1..n-1] = event blocks (the LAST block holds the final event plus
  // the site footer — the footer's <strong>s never match DATE_HEADER_RE, so
  // it is safe to include; skipping it used to silently drop the last event)

  for (let bi = 1; bi < blocks.length; bi++) {
    const $ = parseCheerio(blocks[bi])

    // 2026 theme update: the date card's <strong> no longer sits inside a <p>
    // (it now lives directly in <div class="col-xs-3">). Walk LEAF block
    // elements (<p> or <div> without block children) so both the old and the
    // new markup are matched.
    const allPs: ReturnType<typeof $>[] = []
    $('p, div').each((_i, el) => {
      const $el = $(el)
      if ($el.find('p, div').length > 0) return   // not a leaf block
      allPs.push($el)
    })

    // Find date card: first leaf block whose first <strong>/<b> (or the
    // element itself, when the strong IS the leaf's only content) matches
    // DATE_HEADER_RE
    let dateCardIdx = -1
    let dateMatch:   RegExpMatchArray | null = null
    let fullCardText = ''
    for (let i = 0; i < allPs.length; i++) {
      const $s = allPs[i].find('strong, b').first()
      const t = ($s.length ? $s.text() : '').replace(/\s+/g, ' ').trim()
      if (!t) continue
      const m = t.match(DATE_HEADER_RE)
      if (m) { dateCardIdx = i; dateMatch = m; fullCardText = t; break }
    }
    if (dateCardIdx < 0 || !dateMatch) continue

    const m          = dateMatch as RegExpMatchArray
    const date_start = parseNlDate(`${m[2]} ${normalizeMonth(m[3])}`)
    if (!date_start) continue

    const title = fullCardText.slice(m[0].length).trim()
    if (!title || title.length < 2) continue

    const key = `${title}|${date_start}`
    if (seen.has(key)) continue
    seen.add(key)

    // Expanded block: allPs[0..dateCardIdx-1]
    // allPs[0] is always the expanded title paragraph — skip it
    let description: string | null = null
    let price:       string | null = null
    let ticket_url:  string | null = null
    let room:        string | null = null
    let hour_start:  string | null = null
    const descParts: string[] = []

    for (let i = 1; i < dateCardIdx; i++) {
      const $p    = allPs[i]
      const pText = $p.text().replace(/\s+/g, ' ').trim()

      // Ticket URL: external non-facebook link
      if (!ticket_url) {
        $p.find('a[href]').each((_j, a) => {
          const href = $(a).attr('href') ?? ''
          if (!ticket_url && href.startsWith('http')
              && !href.includes('facebook.com') && !href.includes('fb.me') && !href.includes('fb.com')) {
            ticket_url = href
          }
        })
      }

      // Room + time (also check for price in same paragraph)
      if (!room) {
        const rtm = pText.match(ROOM_TIME_RE)
        if (rtm) {
          room       = rtm[1].trim() || null
          hour_start = parseTime(rtm[2])
          if (!price) {
            if (/\bGRATIS\b/i.test(pText)) price = 'gratis'
            else { const pm = pText.match(/(?:VVK\s*:?\s*)?€\s*[\d,.]+/); if (pm) price = pm[0].trim() }
          }
          continue // don't add room/time paragraph to description
        }
      }

      // Price
      if (!price) {
        if (/\bGRATIS\b/i.test(pText)) price = 'gratis'
        else { const pm = pText.match(/(?:VVK\s*:?\s*)?€\s*[\d,.]+/); if (pm) price = pm[0].trim() }
      }

      // Description: collect substantial text, skip metadata lines
      if (pText.length > 25
          && !/^(VVK|ADK|€|GRATIS)/i.test(pText)
          && !/^\[?(FACEBOOK|TICKETS?)/i.test(pText)
      ) {
        descParts.push(pText)
      }
    }

    description = descParts.join(' ').slice(0, 800) || null

    // Source URL: event-specific /agenda/ link anywhere in the block
    let source_url = SCRAPE_URL
    for (let i = 0; i < allPs.length && source_url === SCRAPE_URL; i++) {
      allPs[i].find('a[href*="/agenda/"]').each((_j, a) => {
        const href = $(a).attr('href') ?? ''
        if (href.match(/\/agenda\/[a-z0-9-]{4,}/) && !href.includes('/archief/')) {
          source_url = href.startsWith('http') ? href : `${BASE_URL}${href}`
          return false as unknown as void
        }
      })
    }

    // Poster image: first uploads img in the block that isn't the separator
    let image_url: string | null = null
    $('img[src]').each((_j, img) => {
      if (image_url) return
      const src = $(img).attr('src') ?? ''
      if (src.includes('/uploads/') && !/close_132|themes\//.test(src)) {
        image_url = src.startsWith('http') ? src : `${BASE_URL}${src}`
      }
    })

    events.push({
      _source:     'trefpunt',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start,
      room,
      description,
      price,
      ticket_url,
      image_url,
      artists_raw: null,
    })
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
