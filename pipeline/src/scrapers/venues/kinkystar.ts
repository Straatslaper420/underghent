import { makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'kinkystar'
export const requiresPlaywright = true

const VENUE_ID   = 'kinkystar'
const VENUE_NAME = 'Kinky Star'
const SCRAPE_URL = 'https://kinkystar.com/programma'

const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

const SUBTITLE_HINTS = [
  'invites', 'presents', 'night', 'fest', 'rave', 'matinee', 'open mic', 'release', 'party',
]

function parseEnglishDate(s: string): string | null {
  const m = s.trim().match(
    /^(?:(?:mon|tues|tuesday|monday|wednesday|thursday|friday|saturday|sunday|tue|wed|thu|fri|sat|sun)\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i,
  )
  if (!m) return null
  const day   = parseInt(m[1], 10)
  const month = EN_MONTHS[m[2].toLowerCase()]
  const year  = parseInt(m[3], 10)
  if (!month || day < 1 || day > 31) return null
  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

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

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page    = await browser.newPage()

  try {
    await page.goto(SCRAPE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)

    const text: string = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const lines: string[] = []
      let node: Node | null
      while ((node = walker.nextNode())) {
        const t = (node.nodeValue ?? '').trim()
        if (t) lines.push(t)
      }
      return lines.join('\n')
    })

    const now = new Date().toISOString()
    const events: RawVenueEvent[] = []
    let pendingTitle: string | null = null

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue

      const date_start = parseEnglishDate(line)
      if (date_start && pendingTitle) {
        const title = pendingTitle
        events.push({
          _source:     'kinkystar',
          _scraped_at: now,
          venue_id:    VENUE_ID,
          venue_name:  VENUE_NAME,
          title,
          date_start,
          source_url:  SCRAPE_URL,
          hour_start:  null,
          room:        null,
          description: null,
          price:       null,
          ticket_url:  null,
          artists_raw: extractArtists(title),
        })
        pendingTitle = null
      } else if (!date_start) {
        pendingTitle = line
      }
    }

    return makeScraperResult(SOURCE_ID, events)
  } finally {
    await browser.close()
  }
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
