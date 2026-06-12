import { fetchHtml, fetchJson } from '../../lib/http.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'funke'
const VENUE_ID          = 'funke'
const VENUE_NAME        = 'FUNKE'
const PROGRAM_URL       = 'https://funke.gent/program'
const FUNKETIVITIES_URL = 'https://funke.gent/funketivities'
const PAYLOGIC_CHANNEL  = '91a4dda979ad40daa0e433e6e97158c8'
const PAYLOGIC_API      = 'https://shopping-api.paylogic.com'

const HEADER_RE   = /^(?:mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2})\.(\d{1,2})\s*(?:(\d{1,2}):(\d{2}))?\s*(.*)$/i
const DAY_ABBR_RE = /^(?:mon|tue|wed|thu|fri|sat|sun)\b/i
const YEAR_RE     = /\b(20\d{2})\b/g
const FUNKETIV_RE = /(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s*[-�€�]\s*\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)?\s*\|?\s*(.+)/

const pad   = (n: number) => String(n).padStart(2, '0')
const clean = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()

function roomFromType(eventType: string | null, kind: 'program' | 'funketivities'): string | null {
  if (kind === 'funketivities') return 'art'
  if (!eventType) return null
  const upper = eventType.toUpperCase()
  const hasClub = /\bCLUB\b/.test(upper)
  const hasBar  = /\bBAR\b/.test(upper)
  if (hasClub && hasBar) return 'club+bar'
  if (hasClub)           return 'club'
  if (hasBar)            return 'bar'
  if (/EXPO|WORKSHOP|PERFORMANCE|MARKET|SHOWCASE|LISTENING/.test(upper)) return 'art'
  return null
}

function parseProgram(html: string, now: string): RawVenueEvent[] {
  const $ = parseCheerio(html)
  const events: RawVenueEvent[] = []
  const today = now.slice(0, 10)

  let agendaHtml: string | null = null
  $('.page_content').each((_i, el) => {
    const t = $(el).text()
    if (/CLUB NIGHT|BAR\s*NIGHT/i.test(t) && /20\d{2}/.test(t)) {
      agendaHtml = $.html(el)
      return false
    }
  })
  if (!agendaHtml) return []

  const $a = parseCheerio(agendaHtml)
  let currentYear = new Date(now).getUTCFullYear()

  $a('h1, h2').each((_i, el) => {
    if (el.tagName === 'h1') {
      const txt   = clean($a(el).text())
      const years = [...txt.matchAll(YEAR_RE)].map(m => parseInt(m[1], 10))
      if (years.length) currentYear = years[years.length - 1]
      return
    }
    const trailing = trailingSiblingText($a, el)
    const ev       = parseEventH2($a, el, currentYear, now, trailing)
    if (ev && ev.date_start >= today) events.push(ev)
  })

  return events
}

function trailingSiblingText(
  $a: ReturnType<typeof parseCheerio>,
  h2: Parameters<ReturnType<typeof parseCheerio>['html']>[0],
): string {
  const parts: string[] = []
  let node = (h2 as { next?: unknown }).next as { type?: string; tagName?: string; next?: unknown } | null | undefined
  while (node) {
    const tag = node.type === 'tag' ? node.tagName : null
    if (tag === 'h1' || tag === 'h2') break
    const t = clean($a(node as never).text())
    if (t) parts.push(t)
    node = node.next as typeof node
  }
  return parts.join(' ').trim()
}

function parseEventH2(
  $a: ReturnType<typeof parseCheerio>,
  h2: Parameters<ReturnType<typeof parseCheerio>['html']>[0],
  currentYear: number,
  now: string,
  trailing: string,
): RawVenueEvent | null {
  const rawOuter = $a.html(h2 as never) ?? ''
  const expanded = rawOuter.replace(/<br\s*\/?>/gi, '\n')
  const $$ = parseCheerio(`<root>${expanded}</root>`)

  const $small      = $$('small').first()
  const headerLines = $small.text().split('\n').map(clean).filter(Boolean)
  if (headerLines.length === 0) return null
  const headerLine  = headerLines[0]
  const typeLine    = headerLines[1] ?? null
  if (!DAY_ABBR_RE.test(headerLine)) return null

  const m = headerLine.match(HEADER_RE)
  if (!m) return null
  const day   = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (!day || !month || month > 12 || day > 31) return null
  const hour  = m[3] ? `${pad(parseInt(m[3], 10))}:${m[4]}` : null
  const genre = m[5]?.trim() || null

  const tdText = clean($$('table td').first().text())

  const $h2    = $$('h2').first()
  const $clone = $h2.clone()
  $clone.find('small, table').remove()
  const restText = clean($clone.text().replace(/\n/g, ' '))

  const title = (tdText || restText || typeLine || '').trim()
  if (!title || /^closed$/i.test(title)) return null

  const date_start = `${currentYear}-${pad(month)}-${pad(day)}`
  const href = $small.find('a').first().attr('href') ?? $$('a').first().attr('href') ?? null
  const fallback_ticket = href && /paylogic|tickets?/i.test(href) ? href : null

  const detailParts: string[] = []
  if (genre)                          detailParts.push(genre)
  if (restText && restText !== title) detailParts.push(restText)
  if (trailing && trailing !== title) detailParts.push(trailing)
  const description = detailParts.length ? detailParts.join(' · ') : null

  return {
    _source:     'funke',
    _scraped_at: now,
    venue_id:    VENUE_ID,
    venue_name:  VENUE_NAME,
    title,
    date_start,
    source_url:  PROGRAM_URL,
    hour_start:  hour,
    room:        roomFromType(typeLine, 'program'),
    description,
    price:       null,
    ticket_url:  fallback_ticket,
    genre_raw:   genre,
    artists_raw: tdText || null,
  }
}

function parseFunketivities(html: string, now: string): RawVenueEvent[] {
  const $ = parseCheerio(html)
  const events: RawVenueEvent[] = []
  const today = now.slice(0, 10)

  let snippet = ''
  $('.page_content').each((_i, el) => {
    const inner = $.html(el) ?? ''
    const start = inner.indexOf('Upcoming Funketivities')
    const stop  = inner.indexOf('Past events')
    if (start >= 0 && stop > start) {
      snippet = inner.slice(start, stop)
      return false
    }
  })
  if (!snippet) return []

  const $$ = parseCheerio(`<root>${snippet.replace(/<br\s*\/?>/gi, '\n')}</root>`)
  $$('h2').each((_i, el) => {
    const text = clean($$(el).text().replace(/\n/g, ' | '))
    const m    = text.match(FUNKETIV_RE)
    if (!m) return
    const day   = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    if (!day || !month || month > 12 || day > 31) return
    const yearRaw = m[3]
    const year = yearRaw
      ? (yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10))
      : new Date(now).getUTCFullYear()
    const date_start = `${year}-${pad(month)}-${pad(day)}`
    if (date_start < today) return

    const title = clean(m[4]).replace(/^[\s|]+/, '')
    if (!title) return

    events.push({
      _source:     'funke',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url:  FUNKETIVITIES_URL,
      hour_start:  null,
      room:        'art',
      description: null,
      price:       null,
      ticket_url:  null,
      artists_raw: null,
    })
  })

  return events
}

interface PaylogicHref { href: string }
interface PaylogicEmbeddedSale {
  start_date?: string
  end_date?:   string
  _links?: {
    self?:        PaylogicHref
    event?:       PaylogicHref
    'shop:shop'?: PaylogicHref
  }
}
interface PaylogicEmbeddedEvent {
  event_start?: string
  _links?: { self?: PaylogicHref }
}
interface PaylogicChannel {
  _embedded?: {
    'shop:sale'?:  PaylogicEmbeddedSale[]
    'shop:event'?: PaylogicEmbeddedEvent[]
  }
}
interface PaylogicSale {
  jwt_token?: string
  _links?:    { event?: PaylogicHref }
}
interface PaylogicStorefront {
  categories?: { items?: { unit_price?: { amount: string } }[] }[]
}

async function fetchJsonAuth<T>(url: string, jwt: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json() as Promise<T>
}

function formatPrice(amounts: string[]): string | null {
  if (amounts.length === 0) return null
  const nums = amounts.map(a => parseFloat(a)).filter(n => Number.isFinite(n) && n > 0)
  if (nums.length === 0) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const fmt = (n: number) => n.toFixed(2).replace(/\.00$/, '').replace('.', ',')
  return min === max ? `€${fmt(min)}` : `€${fmt(min)}-${fmt(max)}`
}

async function enrichFromPaylogic(events: RawVenueEvent[]): Promise<void> {
  const channel = await fetchJson<PaylogicChannel>(`${PAYLOGIC_API}/channels/${PAYLOGIC_CHANNEL}`)
  const sales   = channel._embedded?.['shop:sale']  ?? []
  const evs     = channel._embedded?.['shop:event'] ?? []
  if (sales.length === 0) return

  // event_uri → event_start
  const eventStartByUri = new Map<string, string>()
  for (const e of evs) {
    const uri = e._links?.self?.href
    if (uri && e.event_start) eventStartByUri.set(uri, e.event_start)
  }

  const matched = new Set<RawVenueEvent>()

  await Promise.all(sales.map(async embeddedSale => {
    try {
      const saleUri  = embeddedSale._links?.self?.href
      const eventUri = embeddedSale._links?.event?.href
      const shopUrl  = embeddedSale._links?.['shop:shop']?.href
      const start    = (eventUri && eventStartByUri.get(eventUri)) ?? embeddedSale.start_date
      if (!saleUri || !eventUri || !start) return

      const date = start.slice(0, 10)
      const ev   = events.find(e => e.date_start === date && !matched.has(e))
      if (!ev) return

      const sale = await fetchJson<PaylogicSale>(saleUri)
      const jwt  = sale.jwt_token
      if (!jwt) return

      const sfUrl = `${PAYLOGIC_API}/storefront?event=${encodeURIComponent(eventUri)}`
      const sf    = await fetchJsonAuth<PaylogicStorefront>(sfUrl, jwt)

      const amounts = (sf.categories ?? [])
        .flatMap(c => c.items ?? [])
        .map(i => i.unit_price?.amount)
        .filter((a): a is string => !!a)

      const price = formatPrice(amounts)
      matched.add(ev)
      ev.price = price
      if (shopUrl) ev.ticket_url = shopUrl
    } catch {
      // ignore individual sale errors
    }
  }))
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const now = new Date().toISOString()
  const [programHtml, funkeHtml] = await Promise.all([
    fetchHtml(PROGRAM_URL),
    fetchHtml(FUNKETIVITIES_URL).catch(() => ''),
  ])
  const events = [
    ...parseProgram(programHtml, now),
    ...(funkeHtml ? parseFunketivities(funkeHtml, now) : []),
  ]

  await enrichFromPaylogic(events).catch(() => undefined)

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
