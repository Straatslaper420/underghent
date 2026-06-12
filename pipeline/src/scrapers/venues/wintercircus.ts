/**
 * Wintercircus scraper �€� Next.js SPA (https://www.wintercircus.be/en/agenda)
 *
 * Strategy:
 *  1. Intercept JSON API responses that the app fetches for events.
 *  2. Check window.__NEXT_DATA__ for embedded event data.
 *  3. DOM fallback: find the event list container (most date-bearing children),
 *     then extract ALL events �€� not just portal-linked ones.
 *
 * Events link to: portal.wintercircus.be, wintercircus.be/en/events,
 * viernulvier.gent, external ticketing, or have no link at all.
 * Date formats: "DD. MM. YY" or range "DD. MM > DD. MM. YY"
 */
import { makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID          = 'wintercircus'
export const requiresPlaywright = true

const VENUE_ID   = 'wintercircus'
const VENUE_NAME = 'Wintercircus'
const SCRAPE_URL = 'https://www.wintercircus.be/en/agenda'
const PORTAL_URL = 'https://portal.wintercircus.be'

// �€�€ helpers �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

function toIso(d: Date): string { return d.toISOString().slice(0, 10) }

function parseDotDate(raw: string): string | null {
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dotFull = raw.match(/(\d{1,2})[.\s]+(\d{1,2})[.\s]+(\d{2,4})/)
  if (dotFull) {
    const [, dd, mm, yy] = dotFull
    const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10)
    return toIso(new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10)))
  }
  return null
}

function parseApiDate(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw)
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10)
  const ts = Number(s)
  if (Number.isFinite(ts) && ts > 1e9) return toIso(new Date(ts > 1e12 ? ts : ts * 1000))
  return parseDotDate(s)
}

function parseHour(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw)
  const m = s.match(/(\d{1,2})[h:](\d{2})/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looksLikeEventArray(arr: any[]): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false
  const f = arr[0]
  if (!f || typeof f !== 'object') return false
  const hasTitle = 'name' in f || 'title' in f || 'summary' in f
  const hasDate  = Object.keys(f).some(k => /date|start|begin|time/i.test(k))
  return hasTitle && hasDate
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventsFromApiArray(arr: any[], now: string): RawVenueEvent[] {
  const today  = now.slice(0, 10)
  const events: RawVenueEvent[] = []
  for (const ev of arr) {
    const title = (ev.name ?? ev.title ?? ev.summary ?? '').trim()
    if (!title) continue
    const dateRaw    = ev.date_start ?? ev.start_date ?? ev.start ?? ev.date ??
                       ev.start_time ?? ev.datetime ?? ev.begin_at ?? ''
    const date_start = parseApiDate(dateRaw)
    if (!date_start || date_start < today) continue
    const id   = ev.id ?? ev.event_id ?? ''
    const slug = ev.slug ?? ev.url_slug ?? ev.handle ?? ''
    const source_url = slug
      ? `${PORTAL_URL}/event/${slug}${id ? `-${id}` : ''}`
      : id ? `${PORTAL_URL}/event/${id}` : SCRAPE_URL
    // Image: the API payload exposes covers under various keys
    const imgRaw = ev.image ?? ev.image_url ?? ev.imageUrl ?? ev.cover ?? ev.cover_image ??
                   ev.thumbnail ?? ev.photo ?? ev.media?.url ?? ev.image?.url ?? null
    const image_url = typeof imgRaw === 'string' && /^https?:/.test(imgRaw)
      ? imgRaw
      : (typeof imgRaw === 'object' && imgRaw && typeof (imgRaw as any).url === 'string')
        ? (imgRaw as any).url : null

    events.push({
      _source:     'wintercircus',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start:  parseHour(ev.start_time ?? ev.time ?? ev.doors ?? ev.door_time ?? dateRaw),
      hour_end:    parseHour(ev.end_time ?? ev.ends_at ?? ev.end ?? null),
      room:        (ev.location ?? ev.room ?? ev.space ?? ev.venue_name ?? null) as string | null,
      description: ((ev.description ?? ev.body ?? ev.content ?? ev.summary ?? ev.short_description ?? ev.intro ?? '') as string).trim() || null,
      price:       ev.price != null ? String(ev.price) : (ev.price_info ?? ev.ticket_price ?? null) as string | null,
      ticket_url:  (ev.ticket_url ?? ev.ticketUrl ?? ev.buy_url ?? ev.tickets_url ?? (slug ? source_url : null)) as string | null,
      image_url,
      genre_raw:   (typeof ev.category === 'string' ? ev.category
                    : Array.isArray(ev.categories) ? ev.categories.filter((c: any) => typeof c === 'string').join(', ')
                    : Array.isArray(ev.tags) ? ev.tags.filter((t: any) => typeof t === 'string').join(', ')
                    : null),
      artists_raw: (ev.artists ?? ev.performers ?? ev.lineup ?? null) as string | null,
    })
  }
  return events
}

// �€�€ DOM fallback (finds ALL events by locating the date-bearing list) �€�€�€�€�€�€�€�€�€

interface DomCard { title: string; dateRaw: string; href: string | null }

async function extractFromDom(page: import('playwright').Page, now: string): Promise<RawVenueEvent[]> {
  const today = now.slice(0, 10)

  const cards: DomCard[] = await page.evaluate((): DomCard[] => {
    // Patterns for dates
    const DATE_PAT  = '\\d{1,2}[.]\\s*\\d{2}[.]\\s*\\d{2,4}'
    const DATE_RE   = new RegExp(DATE_PAT)
    // Range: "04. 07 > 26. 07. 26" �€� start has no year, end has year
    const RANGE_RE  = /(\d{1,2})[.]\s*(\d{2})\s*[>]\s*(\d{1,2})[.]\s*(\d{2})[.]\s*(\d{2,4})/
    const SINGLE_RE = /(\d{1,2})[.]\s*(\d{2})[.]\s*(\d{2,4})/
    // Words to skip when searching for the title line
    const TAG_RE    = /^(UiV|Arts|Culture|Music|Sport|Tech|Health|Circus|Food|Drinks|Klassieke|Theater|Creativiteit|register|koop|reserve|subscribe|more info|click here|buy|free|gratis|info|\d)/i

    const results: DomCard[] = []
    const seen = new Set<string>()

    // �€�€ Step 1: find the list container with the most date-bearing direct children �€�€
    let bestEl: Element | null = null
    let bestCount = 0

    // @ts-ignore
    const candidates = Array.from((document as any).querySelectorAll(
      'ul, ol, div, section, main, [class*="list"], [class*="agenda"], [class*="event"]'
    )) as Element[]

    for (const el of candidates) {
      const kids = Array.from(el.children)
      const n = kids.filter(c =>
        DATE_RE.test(((c as HTMLElement).innerText || '').slice(0, 80))
      ).length
      if (n > bestCount) { bestCount = n; bestEl = el }
    }

    // �€�€ Step 2: also capture highlighted / featured cards (may be outside the list) �€�€
    // @ts-ignore
    const featuredAs = Array.from((document as any).querySelectorAll(
      'a[href*="portal.wintercircus.be"], a[href*="wintercircus.be/en/events"]'
    )) as Element[]

    const featuredContainers: Element[] = []
    for (const a of featuredAs) {
      let el: Element = a
      let found = false
      for (let i = 0; i < 6; i++) {
        const p = el.parentElement
        if (!p) break
        if (DATE_RE.test(((p as HTMLElement).innerText || '').slice(0, 80))) {
          featuredContainers.push(p)
          found = true
          break
        }
        el = p
      }
      if (!found) featuredContainers.push(a.parentElement ?? a)
    }

    // �€�€ Step 3: combine list children + featured, deduplicate, extract �€�€
    const items: Element[] = [
      ...(bestEl && bestCount > 0 ? Array.from(bestEl.children) : []),
      ...featuredContainers,
    ]

    for (const item of items) {
      const rawText = ((item as HTMLElement).innerText || (item as HTMLElement).textContent || '').trim()
      if (!rawText || rawText.length < 4) continue

      // Extract date (handle range → use start date)
      let dateRaw = ''
      const rangeM = rawText.match(RANGE_RE)
      const singleM = rawText.match(SINGLE_RE)
      if (rangeM) {
        // Build start date string: startDay. startMonth. endYear
        dateRaw = `${rangeM[1]}. ${rangeM[2]}. ${rangeM[5]}`
      } else if (singleM) {
        dateRaw = singleM[0]
      } else {
        continue
      }

      // Remove the matched date string to isolate title + tags
      const dateToken = rangeM ? rangeM[0] : (singleM ? singleM[0] : '')
      const withoutDate = rawText.replace(dateToken, ' ').trim()
      const lines = withoutDate
        .split(/[\n\r]+/)
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 2)

      // First line that isn't a tag/category word is the title
      const titleLine = lines.find((l: string) => !TAG_RE.test(l) && l.length < 200)
      if (!titleLine) continue

      const key = `${dateRaw.replace(/\s/g, '')}|${titleLine.slice(0, 60)}`
      if (seen.has(key)) continue
      seen.add(key)

      // Find the best link in this card:
      // prefer portal > wintercircus.be/en/events > anything else
      // @ts-ignore
      const links = Array.from((item as any).querySelectorAll('a[href]')) as HTMLAnchorElement[]
      let href: string | null = null
      for (const a of links) {
        const h = (a as HTMLAnchorElement).href || ''
        if (/portal\.wintercircus\.be/.test(h)) { href = h; break }
        if (/wintercircus\.be\/en\/events/.test(h)) { href = h; break }
      }
      // Fall back to first available link
      if (!href && links.length > 0) {
        href = (links[0] as HTMLAnchorElement).href || null
      }

      results.push({ title: titleLine, dateRaw, href })
    }

    return results
  })

  const events: RawVenueEvent[] = []
  const seen = new Set<string>()

  for (const card of cards) {
    const date_start = parseDotDate(card.dateRaw)
    if (!date_start || date_start < today) continue
    const key = `${card.title}|${date_start}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({
      _source:     'wintercircus',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title:       card.title,
      date_start,
      source_url:  card.href ?? SCRAPE_URL,
      hour_start:  null,
      room:        null,
      description: null,
      price:       null,
      ticket_url:  card.href,
      artists_raw: null,
    })
  }

  return events
}

// �€�€ Main �€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€�€

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
    if (!ct.includes('json') && !url.includes('/api/')) return
    try {
      const data = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr: any[] = Array.isArray(data) ? data
        : data?.events ?? data?.data?.events ?? data?.results ?? data?.data ?? []
      if (looksLikeEventArray(arr)) captured.push(...arr)
    } catch { /* ignore */ }
  })

  try {
    await page.goto(SCRAPE_URL, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(3000)
    // Scroll to trigger lazy-loading
    await page.evaluate(() => (window as any).scrollTo(0, (document as any).body.scrollHeight))
    await page.waitForTimeout(2000)

    // Try API-intercepted data first
    if (captured.length > 0) {
      const events = eventsFromApiArray(captured, now)
      if (events.length > 0) return makeScraperResult(SOURCE_ID, events)
    }

    // Try window.__NEXT_DATA__ (embedded page props)
    const nextEvents = await page.evaluate((): unknown[] => {
      try {
        // @ts-ignore
        const nd = (window as any).__NEXT_DATA__
        if (!nd) return []
        const pp = nd?.props?.pageProps
        return (
          pp?.events ?? pp?.data?.events ?? pp?.agenda ?? pp?.items ?? []
        )
      } catch { return [] }
    })

    if (Array.isArray(nextEvents) && nextEvents.length > 0 && looksLikeEventArray(nextEvents as any[])) {
      const events = eventsFromApiArray(nextEvents as any[], now)
      if (events.length > 0) return makeScraperResult(SOURCE_ID, events)
    }

    // Full DOM fallback �€� finds all events by locating the date-bearing list
    const domEvents = await extractFromDom(page, now)
    return makeScraperResult(SOURCE_ID, domEvents)
  } finally {
    await browser.close()
  }
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
