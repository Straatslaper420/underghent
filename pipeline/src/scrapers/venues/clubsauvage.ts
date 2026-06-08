import { makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'clubsauvage'
export const requiresPlaywright = true

const VENUE_ID   = 'clubsauvage'
const VENUE_NAME = 'Club Sauvage'
const SCRAPE_URL = 'https://www.clubsauvage.be/calendar'
const BASE_URL   = 'https://www.clubsauvage.be'

// Matches dates like "18/07/2026", "18-07-2026", "18 july 2026", "July 18, 2026", "2026-07-18"
const DATE_RE = /(\d{4}-\d{2}-\d{2})|(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/

function parseDateFromText(text: string): string | null {
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  const m2 = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (m2) {
    const d = String(m2[1]).padStart(2, '0')
    const mo = String(m2[2]).padStart(2, '0')
    return `${m2[3]}-${mo}-${d}`
  }

  // "18 july 2026" or "July 18, 2026" or "18 Jul 2026"
  const EN_MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
    aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }
  const m3 = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i)
  if (m3) {
    const mon = EN_MONTHS[m3[2].toLowerCase()]
    if (mon) {
      const d = String(parseInt(m3[1], 10)).padStart(2, '0')
      return `${m3[3]}-${mon}-${d}`
    }
  }
  const m4 = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i)
  if (m4) {
    const mon = EN_MONTHS[m4[1].toLowerCase()]
    if (mon) {
      const d = String(parseInt(m4[2], 10)).padStart(2, '0')
      return `${m4[3]}-${mon}-${d}`
    }
  }

  return null
}

function parseTimeFromText(text: string): string | null {
  const m = text.match(/\b(\d{1,2})[h:](\d{2})\b|\b(\d{1,2})h\b/i)
  if (!m) return null
  if (m[1] !== undefined) return `${String(m[1]).padStart(2, '0')}:${m[2]}`
  return `${String(m[3]).padStart(2, '0')}:00`
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page    = await browser.newPage()

  try {
    // Use 'load' instead of 'networkidle' — Wix sites have tracking scripts
    // that never settle, causing networkidle to always time out at 45s.
    await page.goto(SCRAPE_URL, { waitUntil: 'load', timeout: 60000 })
    // Give Wix/React hydration time to render event cards
    await page.waitForTimeout(5000)

    const now    = new Date().toISOString()
    const events: RawVenueEvent[] = []

    // Wix events widget: event items are typically div[data-testid] or similar
    // Try common Wix selectors for event cards
    const cardSelectors = [
      '[data-testid="event-list-item"]',
      '[data-testid="ev-comp-root"]',
      '.events-list-item',
      'li[data-hook="event-list-item"]',
      'article[data-hook]',
      // Generic fallback: any element containing "read more" / "lees meer" button
    ]

    let cardEls: string[] = []
    for (const sel of cardSelectors) {
      const count = await page.locator(sel).count()
      if (count > 0) {
        cardEls = await page.locator(sel).evaluateAll(els =>
          els.map(el => el.outerHTML)
        )
        break
      }
    }

    // If no recognised selector, collect all visible event-like blocks by finding
    // elements with a "read more" / "lees meer" button
    if (cardEls.length === 0) {
      // Gather all "read more" buttons and their parent containers
      const readMoreButtons = page.locator('button, a').filter({ hasText: /read more|lees meer|meer info|details/i })
      const btnCount = await readMoreButtons.count()

      for (let i = 0; i < btnCount; i++) {
        const btn = readMoreButtons.nth(i)

        // Try to get the enclosing event card — walk up to a meaningful container
        const containerText = await btn.evaluate(el => {
          let node: Element | null = el.parentElement
          for (let depth = 0; depth < 6; depth++) {
            if (!node) break
            // Stop when the container has substantial text (likely the card)
            if ((node.textContent?.trim().length ?? 0) > 30) break
            node = node.parentElement
          }
          return node?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
        })

        // Click the button to open the popup/modal
        try {
          await btn.click()
          await page.waitForTimeout(800)

          // Look for a modal/dialog/overlay that appeared
          const dialogSelectors = [
            '[role="dialog"]',
            '[data-testid="event-details-dialog"]',
            '.event-modal',
            '.modal',
            '[aria-modal="true"]',
            '[data-hook="event-details"]',
          ]

          let popupText = ''
          let popupUrl  = SCRAPE_URL

          for (const dSel of dialogSelectors) {
            const dlg = page.locator(dSel).first()
            if (await dlg.count() > 0) {
              popupText = (await dlg.textContent() ?? '').replace(/\s+/g, ' ').trim()
              // Try to get a link from the popup
              const popupLink = dlg.locator('a[href]').first()
              if (await popupLink.count() > 0) {
                const h = await popupLink.getAttribute('href') ?? ''
                popupUrl = h.startsWith('http') ? h : `${BASE_URL}${h}`
              }
              break
            }
          }

          // Fallback: if no dialog found, grab main content change
          if (!popupText) {
            popupText = containerText
          }

          const combinedText = `${containerText} ${popupText}`

          // Extract event title: first non-empty line / heading in popup
          const titleMatch = popupText.match(/^([^\n]{3,80})/) ?? combinedText.match(/^([^\n]{3,80})/)
          const rawTitle   = (titleMatch?.[1] ?? '').trim()

          // Strip emoji clusters from title start for cleaner storage
          const title = rawTitle.replace(/^[\p{Emoji}\s🪩✨🎉🎊]+/u, '').trim() || rawTitle

          if (!title) {
            await closePopup(page)
            continue
          }

          // Try to extract date from popup or container text
          const date_start = parseDateFromText(combinedText) ?? inferDateFromTitle(rawTitle)
          if (!date_start) {
            // Store without date — skip or store with today as placeholder
            await closePopup(page)
            continue
          }

          const hour_start = parseTimeFromText(popupText) ?? parseTimeFromText(containerText)

          events.push({
            _source:     'clubsauvage',
            _scraped_at: now,
            venue_id:    VENUE_ID,
            venue_name:  VENUE_NAME,
            title,
            date_start,
            source_url:  popupUrl !== SCRAPE_URL ? popupUrl : SCRAPE_URL,
            hour_start,
            room:        null,
            description: popupText.slice(0, 500) || null,
            price:       null,
            ticket_url:  null,
            artists_raw: null,
          })

          await closePopup(page)
        } catch {
          // If click/parse fails, continue with next button
          await closePopup(page).catch(() => undefined)
        }
      }
    } else {
      // We found event cards via selector — parse without clicking popups
      for (const cardHtml of cardEls) {
        const text = cardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

        const titleMatch = text.match(/([A-Z][^\n.!?]{2,60})/)
        const title      = titleMatch?.[1]?.trim()
        if (!title) continue

        const date_start = parseDateFromText(text)
        if (!date_start) continue

        events.push({
          _source:     'clubsauvage',
          _scraped_at: now,
          venue_id:    VENUE_ID,
          venue_name:  VENUE_NAME,
          title,
          date_start,
          source_url:  SCRAPE_URL,
          hour_start:  parseTimeFromText(text),
          room:        null,
          description: text.slice(0, 300) || null,
          price:       null,
          ticket_url:  null,
          artists_raw: null,
        })
      }
    }

    return makeScraperResult(SOURCE_ID, events)
  } finally {
    await browser.close()
  }
}

/** Attempt to close an open modal/popup. */
async function closePopup(page: import('playwright').Page): Promise<void> {
  const closeSelectors = [
    '[aria-label="Close"]',
    '[aria-label="Sluiten"]',
    'button[data-testid="close-button"]',
    '.close-button',
    'button.close',
    '[data-hook="close-button"]',
    'body', // fallback: press Escape
  ]
  for (const sel of closeSelectors) {
    const el = page.locator(sel).first()
    if (sel === 'body') {
      await page.keyboard.press('Escape')
      break
    }
    if (await el.count() > 0) {
      try {
        await el.click({ timeout: 1000 })
        break
      } catch {
        continue
      }
    }
  }
  await page.waitForTimeout(400)
}

/**
 * For events whose title encodes the date (e.g. "Gentse Feesten 2026"),
 * try to infer a rough start date from known festival windows.
 * This is a best-effort heuristic — scraper should always try to parse an
 * explicit date first.
 */
function inferDateFromTitle(title: string): string | null {
  const lower = title.toLowerCase()

  // Gentse Feesten is always the third Saturday of July
  if (/gentse feesten/.test(lower)) {
    const yearMatch = title.match(/20(\d{2})/)
    const year = yearMatch ? 2000 + parseInt(yearMatch[1], 10) : new Date().getFullYear()
    // Approximate: July 18 (varies by year; good enough for deduplication)
    return `${year}-07-18`
  }

  return null
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
