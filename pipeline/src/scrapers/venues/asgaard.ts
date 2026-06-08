/**
 * Asgaard scraper — anykrowd SPA (https://asgaard.anykrowd.app/#/events)
 *
 * Strategy:
 *  1. Intercept ALL JSON responses; try to find event arrays.
 *  2. DOM fallback: page.evaluate() extracts card text. The list page already
 *     renders title + "DD/MM/YYYY at HH:MM" so no click-through needed.
 *  3. If no cards found, navigate to each /events/ID detail page via links.
 */
import { makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'asgaard'
export const requiresPlaywright = true

const VENUE_ID   = 'asgaard'
const VENUE_NAME = 'Asgaard'
const LIST_URL   = 'https://asgaard.anykrowd.app/#/events'
const BASE_URL   = 'https://asgaard.anykrowd.app'

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
  aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  januari: '01', februari: '02', maart: '03', mei: '05', juni: '06',
  juli: '07', augustus: '08', oktober: '10',
}

function toIso(d: Date): string { return d.toISOString().slice(0, 10) }

function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const n = Number(s)
  if (Number.isFinite(n) && n > 1e9) return toIso(new Date(n > 1e12 ? n : n * 1000))
  const dmy = s.match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/i)
  if (dmy) {
    const mon = MONTHS[dmy[2].toLowerCase()]
    if (mon) {
      const day  = String(parseInt(dmy[1], 10)).padStart(2, '0')
      const year = dmy[3] ?? String(new Date().getFullYear())
      return `${year}-${mon}-${day}`
    }
  }
  const mdy = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i)
  if (mdy) {
    const mon = MONTHS[mdy[1].toLowerCase()]
    if (mon) return `${mdy[3]}-${mon}-${String(parseInt(mdy[2], 10)).padStart(2, '0')}`
  }
  const dmy2 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (dmy2) return `${dmy2[3]}-${dmy2[2].padStart(2, '0')}-${dmy2[1].padStart(2, '0')}`
  return null
}

function parseHour(raw: string): string | null {
  if (!raw) return null
  const ampm = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    if (ampm[3].toUpperCase() === 'PM' && h < 12) h += 12
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${ampm[2]}`
  }
  const hhmm = raw.match(/\b(\d{1,2})[h:](\d{2})\b/i)
  if (hhmm) return `${String(parseInt(hhmm[1], 10)).padStart(2, '0')}:${hhmm[2]}`
  const hh = raw.match(/\b(\d{1,2})h\b/i)
  if (hh) return `${String(parseInt(hh[1], 10)).padStart(2, '0')}:00`
  return null
}

// ── JSON capture ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looksLikeEventArray(arr: any[]): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false
  const f = arr[0]
  if (!f || typeof f !== 'object') return false
  const hasName = 'name' in f || 'title' in f
  const hasDate =
    'start_date' in f || 'startDate' in f || 'date'       in f ||
    'start_at'   in f || 'starts_at'  in f || 'start'     in f ||
    'begins_at'  in f || 'begin_at'   in f || 'date_from' in f ||
    'dateFrom'   in f || 'event_date' in f || 'datetime'  in f
  return hasName && hasDate
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEventArray(data: any): any[] {
  if (Array.isArray(data) && looksLikeEventArray(data)) return data
  if (data && typeof data === 'object') {
    for (const key of ['events', 'data', 'items', 'results', 'list', 'records']) {
      if (Array.isArray(data[key]) && looksLikeEventArray(data[key])) return data[key]
    }
    if (data.data && typeof data.data === 'object') {
      for (const key of ['events', 'items', 'results']) {
        if (Array.isArray(data.data[key]) && looksLikeEventArray(data.data[key])) return data.data[key]
      }
    }
  }
  return []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventsFromJson(raw: any[], now: string): RawVenueEvent[] {
  const today = now.slice(0, 10)
  const events: RawVenueEvent[] = []
  for (const ev of raw) {
    const title = (ev.name ?? ev.title ?? '').trim()
    if (!title) continue
    const dateRaw = String(
      ev.start_date ?? ev.startDate ?? ev.start     ?? ev.date      ??
      ev.start_at   ?? ev.starts_at ?? ev.begins_at ?? ev.begin_at  ??
      ev.date_from  ?? ev.dateFrom  ?? ev.event_date ?? ev.datetime ?? '',
    )
    const date_start = parseDate(dateRaw)
    if (!date_start || date_start < today) continue
    const id = ev.id ?? ev.event_id ?? ev.eventId ?? ''
    const source_url = id ? `${BASE_URL}/#/events/${id}` : LIST_URL
    const hourRaw = String(ev.start_time ?? ev.startTime ?? ev.time ?? dateRaw)
    const desc: string = ev.description ?? ev.body ?? ev.content ?? ev.summary ?? ''
    const price: string | null = ev.price != null
      ? (typeof ev.price === 'number' ? `EUR${ev.price.toFixed(2)}` : String(ev.price))
      : null
    events.push({
      _source: 'asgaard', _scraped_at: now,
      venue_id: VENUE_ID, venue_name: VENUE_NAME,
      title, date_start, source_url,
      hour_start:  parseHour(hourRaw),
      room:        null,
      description: desc.slice(0, 500) || null,
      price,
      ticket_url:  ev.ticket_url ?? ev.ticketUrl ?? ev.buy_url ?? null,
      artists_raw: null,
    })
  }
  return events
}

// ── DOM fallback ──────────────────────────────────────────────────────────────

interface CardData { text: string; href: string | null }

async function scrapeViaDOM(
  page: import('playwright').Page,
  now: string,
): Promise<RawVenueEvent[]> {
  const today = now.slice(0, 10)

  const cards: CardData[] = await page.evaluate((): CardData[] => {
    const DATE_RE = /\d{2}\/\d{2}\/\d{4}\s+at\s+\d{2}:\d{2}/
    const sels = [
      'ion-card', 'app-event-card', 'app-event-item',
      '.event-card', '.event-item', '[class*="event-card"]',
    ]
    let containers: Element[] = []
    for (const sel of sels) {
      const found = Array.from(document.querySelectorAll(sel))
      if (found.length > 0) { containers = found; break }
    }
    if (containers.length === 0) {
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const t = ((el as HTMLElement).innerText ?? '').trim()
        if (DATE_RE.test(t) && el.children.length < 15) containers.push(el)
      }
    }
    const results: CardData[] = []
    for (const el of containers) {
      const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').trim()
      if (!DATE_RE.test(text)) continue
      const a = el.querySelector('a[href*="/events/"]') as HTMLAnchorElement | null
      results.push({ text, href: a ? a.href : null })
    }
    if (results.length === 0) {
      const body = (document.body as HTMLElement).innerText ?? document.body.textContent ?? ''
      results.push({ text: body, href: null })
    }
    return results
  })

  const DATE_LINE = /(\d{2}\/\d{2}\/\d{4})\s+at\s+(\d{2}:\d{2})(?:\s+to\s+[\d\/]+\s+at\s+[\d:]+)?(?:\s*[-–]\s*(.+))?/
  const events: RawVenueEvent[] = []

  if (cards.length > 1 || (cards.length === 1 && cards[0].href !== null)) {
    for (const card of cards) {
      const m = card.text.match(DATE_LINE)
      if (!m) continue
      const date_start = parseDate(m[1])
      if (!date_start || date_start < today) continue
      const hour_start = parseHour(m[2])
      const dateIdx = card.text.indexOf(m[0])
      const titleLines = card.text.slice(0, dateIdx).trim().split('\n')
        .map(l => l.trim()).filter(l => l.length > 0)
      const title = titleLines[titleLines.length - 1] ?? ''
      if (!title || title.length < 2) continue
      const description = card.text.slice(dateIdx + m[0].length).trim().slice(0, 500) || null
      let source_url = LIST_URL
      if (card.href) {
        const id = card.href.match(/\/events\/(\d+)/)
        if (id) source_url = `${BASE_URL}/#/events/${id[1]}`
      }
      events.push({
        _source: 'asgaard', _scraped_at: now,
        venue_id: VENUE_ID, venue_name: VENUE_NAME,
        title, date_start, source_url, hour_start,
        room: null, description, price: null, ticket_url: null, artists_raw: null,
      })
    }
  }

  if (events.length === 0) {
    return parseFullPageText(cards.map(c => c.text).join('\n'), now)
  }
  return events
}

function parseFullPageText(text: string, now: string): RawVenueEvent[] {
  const today = now.slice(0, 10)
  const events: RawVenueEvent[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{2}\/\d{2}\/\d{4})\s+at\s+(\d{2}:\d{2})/)
    if (!m) continue
    const date_start = parseDate(m[1])
    if (!date_start || date_start < today) continue
    const hour_start = parseHour(m[2])
    let titleIdx = i - 1
    while (titleIdx >= 0 && lines[titleIdx].length === 0) titleIdx--
    const title = titleIdx >= 0 ? lines[titleIdx] : ''
    if (!title || title.length < 2) continue
    const descLines: string[] = []
    let j = i + 1
    while (j < lines.length && descLines.length < 3 && !lines[j].match(/^\d{2}\/\d{2}\/\d{4}/)) {
      descLines.push(lines[j])
      j++
    }
    events.push({
      _source: 'asgaard', _scraped_at: now,
      venue_id: VENUE_ID, venue_name: VENUE_NAME,
      title, date_start, source_url: LIST_URL, hour_start,
      room: null, description: descLines.join(' ').slice(0, 500) || null,
      price: null, ticket_url: null, artists_raw: null,
    })
  }
  const seen = new Set<string>()
  return events.filter(e => {
    const k = `${e.title}|${e.date_start}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ── Detail-page fallback ──────────────────────────────────────────────────────

async function scrapeViaDetailPages(
  page: import('playwright').Page,
  now: string,
): Promise<RawVenueEvent[]> {
  const today = now.slice(0, 10)
  const ids: string[] = await page.evaluate((): string[] => {
    const found: string[] = []
    for (const a of Array.from(document.querySelectorAll('a[href*="/events/"]'))) {
      const m = (a as HTMLAnchorElement).href.match(/\/events\/(\d+)/)
      if (m && !found.includes(m[1])) found.push(m[1])
    }
    return found
  })
  if (ids.length === 0) return []

  const events: RawVenueEvent[] = []
  for (const id of ids) {
    const url = `${BASE_URL}/#/events/${id}`
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(1500)
    } catch { continue }

    const bodyText: string = await page.evaluate(
      () => ((document.body as HTMLElement).innerText ?? document.body.textContent ?? ''),
    )
    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    const startIdx = lines.findIndex(l => !/(ga terug|back|home)/i.test(l))
    if (startIdx < 0) continue
    const title = lines[startIdx]
    if (!title || title.length < 2) continue

    let date_start: string | null = null
    let hour_start: string | null = null
    for (const line of lines) {
      const dm = line.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?\s*(.*)/)
      if (dm) {
        const candidate = parseDate(`${dm[1]} ${dm[2]} ${dm[3] ?? new Date().getFullYear()}`)
        if (candidate) {
          date_start = candidate
          if (dm[4]) hour_start = parseHour(dm[4].trim())
          break
        }
      }
    }
    if (!date_start || date_start < today) continue

    const descIdx = lines.findIndex(l => /(over het event|about the event)/i.test(l))
    const description = descIdx >= 0
      ? lines.slice(descIdx + 1, descIdx + 6).join(' ').slice(0, 500)
      : null

    events.push({
      _source: 'asgaard', _scraped_at: now,
      venue_id: VENUE_ID, venue_name: VENUE_NAME,
      title, date_start, source_url: url, hour_start,
      room: null, description, price: null, ticket_url: null, artists_raw: null,
    })
  }
  return events
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page    = await browser.newPage()
  const now     = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const captured: any[] = []
  page.on('response', async (res) => {
    const ct  = res.headers()['content-type'] ?? ''
    const url = res.url()
    const isJson =
      ct.includes('application/json') ||
      ct.includes('application/vnd.api') ||
      (ct.includes('text/plain') && url.includes('/api/'))
    if (!isJson) return
    try {
      const data = await res.json()
      const arr  = extractEventArray(data)
      if (arr.length) captured.push(...arr)
    } catch { /* ignore */ }
  })

  try {
    await page.goto(LIST_URL, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(3000)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1500)

    if (captured.length > 0) {
      const events = eventsFromJson(captured, now)
      if (events.length > 0) return makeScraperResult(SOURCE_ID, events)
    }

    const domEvents = await scrapeViaDOM(page, now)
    if (domEvents.length > 0) return makeScraperResult(SOURCE_ID, domEvents)

    const detailEvents = await scrapeViaDetailPages(page, now)
    return makeScraperResult(SOURCE_ID, detailEvents)
  } finally {
    await browser.close()
  }
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
