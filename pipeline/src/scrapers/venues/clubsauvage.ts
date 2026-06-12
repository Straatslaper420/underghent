/**
 * Club Sauvage scraper — REWRITTEN 2026-06.
 *
 * Why: /calendar is a Wix site whose events widget renders fully client-side.
 * The old Playwright scraper guessed Wix DOM selectors and "read more"
 * buttons; the served page contains none of them (verified: the HTML body is
 * just header + footer), so it returned 0 events on every run.
 *
 * New approach — no browser at all:
 *  1. Fetch the plain HTML and read Wix's embedded JSON payloads
 *     (warmup data / wix-events widget state), which contain the event
 *     records when the venue has any published.
 *  2. Deep-walk every embedded JSON blob for objects shaped like Wix events
 *     ({ title, scheduling/startDate, slug, … }).
 *  3. If the venue has no events published on Wix (their events mostly live
 *     on Facebook/Instagram), this correctly yields 0 — the venue's FB page
 *     belongs in config/facebook.json for the Apify path.
 */
import { fetchHtml } from '../../lib/http.js'
import { makeScraperResult, safeRun } from '../base.js'
import type { RawVenueEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'clubsauvage'

const VENUE_ID   = 'clubsauvage'
const VENUE_NAME = 'Club Sauvage'
const BASE_URL   = 'https://www.clubsauvage.be'
const SCRAPE_URL = `${BASE_URL}/calendar`

/* eslint-disable @typescript-eslint/no-explicit-any */

function extractJsonBlobs(html: string): any[] {
  const blobs: any[] = []
  // All JSON script payloads Wix embeds (warmup data, app states, JSON-LD)
  const re = /<script[^>]*type="application\/(?:json|ld\+json)"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try { blobs.push(JSON.parse(m[1])) } catch { /* skip unparsable */ }
  }
  return blobs
}

function isoDate(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function isoTime(raw: unknown): string | null {
  if (!raw) return null
  const m = String(raw).match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : null
}

function looksLikeWixEvent(o: any): boolean {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const hasTitle = typeof o.title === 'string' && o.title.trim().length > 1
  const start = o.scheduling?.config?.startDate ?? o.scheduling?.startDate ?? o.startDate ?? o.start
  return hasTitle && !!isoDate(start)
}

function collectWixEvents(node: any, out: any[], depth = 0): void {
  if (!node || depth > 12) return
  if (Array.isArray(node)) {
    for (const item of node) collectWixEvents(item, out, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  if (looksLikeWixEvent(node)) { out.push(node); return }
  for (const v of Object.values(node)) collectWixEvents(v, out, depth + 1)
}

async function scrapeList(): Promise<ScraperResult<RawVenueEvent>> {
  const html  = await fetchHtml(SCRAPE_URL)
  const blobs = extractJsonBlobs(html)

  const found: any[] = []
  for (const blob of blobs) collectWixEvents(blob, found)

  // JSON-LD Event objects are also possible (@type: "Event")
  for (const blob of blobs) {
    const arr = Array.isArray(blob) ? blob : [blob]
    for (const o of arr) {
      if (o && o['@type'] === 'Event' && o.name && o.startDate) {
        found.push({ title: o.name, startDate: o.startDate, endDate: o.endDate,
                     description: o.description, url: o.url, image: o.image,
                     offers: o.offers })
      }
    }
  }

  const now    = new Date().toISOString()
  const events: RawVenueEvent[] = []
  const seen   = new Set<string>()

  for (const ev of found) {
    const startRaw = ev.scheduling?.config?.startDate ?? ev.scheduling?.startDate ?? ev.startDate ?? ev.start
    const endRaw   = ev.scheduling?.config?.endDate ?? ev.scheduling?.endDate ?? ev.endDate ?? null
    const date_start = isoDate(startRaw)
    if (!date_start) continue
    const title = String(ev.title).trim()
    const key = `${title}|${date_start}`
    if (seen.has(key)) continue
    seen.add(key)

    const slug = ev.slug ?? null
    const source_url = ev.url
      ? String(ev.url)
      : slug ? `${BASE_URL}/event-details/${slug}` : SCRAPE_URL

    const image = ev.mainImage?.url ?? ev.mainImage?.id ?? ev.image ?? null
    const price = ev.registration?.ticketing?.lowestPrice?.amount
      ? `€ ${ev.registration.ticketing.lowestPrice.amount}`
      : (typeof ev.offers?.price === 'string' || typeof ev.offers?.price === 'number')
        ? `€ ${ev.offers.price}` : null

    events.push({
      _source:     'clubsauvage',
      _scraped_at: now,
      venue_id:    VENUE_ID,
      venue_name:  VENUE_NAME,
      title,
      date_start,
      source_url,
      hour_start:  isoTime(startRaw),
      hour_end:    isoTime(endRaw),
      room:        null,
      description: ev.description ? String(ev.description).slice(0, 800) : null,
      price,
      ticket_url:  ev.registration?.external?.registration ?? null,
      image_url:   typeof image === 'string' && image.startsWith('http') ? image : null,
      artists_raw: null,
    })
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawVenueEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
