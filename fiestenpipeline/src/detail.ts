// Parse one Gentse Feesten detail page into a FeestenEvent.
//
// The site is server-rendered Drupal with NO JSON-LD, so we anchor on stable
// Drupal field classes (field--name-*) and on field__label text rather than
// brittle theme CSS. Verified against:
//   /nl/day/17/het-verhaal-van-gent-met-vlieg-70663
//
// Stable anchors used:
//   - .ics link            a[href$="/calendar.ics"]      -> nodeId + icsUrl
//   - Google Maps daddr     .gf-google-maps-link a[href]  -> lat,lng
//   - field--name-*         organizer / website / categories / address / …
//   - field__label text     "Prijs" / "Kortingsgroepen" / "Genre" / "Tickets"

import * as cheerio from 'cheerio'
import type { CheerioAPI, Cheerio } from 'cheerio'
import type { AnyNode } from 'domhandler'
import { fetchHtml } from './http.js'
import type { FeestenEvent } from './types.js'

export const BASE = 'https://gentsefeesten.stad.gent'

// "10.00 u." / "20:30" / "20.30u" -> "10:00" / "20:30"
function normalizeTime(raw: string): string | null {
  const m = raw.match(/(\d{1,2})[.:hu](\d{2})/i)
  if (!m) return null
  const h = m[1].padStart(2, '0')
  return `${h}:${m[2]}`
}

function clean(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

function absUrl(href: string | undefined): string | null {
  if (!href) return null
  try {
    return new URL(href, BASE).toString()
  } catch {
    return null
  }
}

// Strip the Drupal image-style segment + ?itok cache token so the same source
// image in different render styles collapses to one gallery entry.
function imageKey(url: string): string {
  const noQuery = url.split('?')[0]
  return noQuery.split('/').pop() ?? noQuery
}

// Find a .field block by its visible field__label text (case-insensitive).
function fieldByLabel($: CheerioAPI, label: string): Cheerio<AnyNode> | null {
  let found: Cheerio<AnyNode> | null = null
  $('.field').each((_, el) => {
    if (found) return
    const lbl = clean($(el).children('.field__label').first().text())
    if (lbl.toLowerCase() === label.toLowerCase()) found = $(el)
  })
  return found
}

export function parseDetail(html: string, detailUrl: string, days: number[]): FeestenEvent {
  const $ = cheerio.load(html)

  // ── provenance: nodeId + icsUrl from the .ics calendar link ──────────────
  const icsHref = $('a[href*="/calendar.ics"]').first().attr('href') ?? null
  let nodeId = ''
  if (icsHref) {
    const m = icsHref.match(/\/node\/(\d+)\/calendar\.ics/)
    if (m) nodeId = m[1]
  }
  if (!nodeId) {
    const m = detailUrl.match(/-(\d+)(?:[/?#]|$)/)
    nodeId = m ? m[1] : detailUrl
  }
  const icsUrl = absUrl(icsHref ?? undefined)

  // ── title ────────────────────────────────────────────────────────────────
  const title = clean($('h1').first().text())

  // ── coordinates from the Google Maps daddr link ──────────────────────────
  let lat: number | null = null
  let lng: number | null = null
  const mapsHref = $('.gf-google-maps-link a').first().attr('href') ?? ''
  const coordM = mapsHref.match(/daddr=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (coordM) {
    lat = Number(coordM[1])
    lng = Number(coordM[2])
  }

  // ── venue + address (location group) ──────────────────────────────────────
  // The "skip to location" link carries the full venue name ("STAM Stadsmuseum
  // Gent"); the sidebar h3.location-name is sometimes just an acronym ("STAM").
  const venue =
    clean($('.field--name-gf-skip-to-location a').first().text()) ||
    clean($('a.location').first().text()) ||
    clean($('.location-name').first().text()) ||
    null

  const street = clean($('.field--name-address.location-address').first().text())
  const postal = clean($('.field--name-postalcode.location-postalcode').first().text())
  const locality = clean($('.field--name-locality.location-locality').first().text())
  const addressParts: string[] = []
  if (street) addressParts.push(street)
  const cityLine = [postal, locality].filter(Boolean).join(' ')
  if (cityLine) addressParts.push(cityLine)
  const address = addressParts.length ? addressParts.join(', ') : null

  const venuePhone =
    clean($('.field--name-phone.location-phone').first().text()).replace(/^tel:/i, '') || null
  const venueEmail = clean($('.field--name-email.location-email').first().text()) || null
  const venueUrl = absUrl($('.field--name-url.location-url a').first().attr('href'))

  // ── timing: every showtime listed ────────────────────────────────────────
  const allTimes: string[] = []
  $('.field--name-gf-event-time .field__item').each((_, el) => {
    const t = normalizeTime(clean($(el).text()))
    if (t) allTimes.push(t)
  })
  const timeStart = allTimes[0] ?? null
  const timeEnd = allTimes.length > 1 ? allTimes[allTimes.length - 1] : null

  // ── organizer + website ───────────────────────────────────────────────────
  const orgA = $('.field--name-organizer .field__item a').first()
  const organizer = clean(orgA.text()) || null
  const organizerUrl = absUrl(orgA.attr('href'))
  const website = absUrl($('.field--name-website .field__item a').first().attr('href'))

  // Organizer contact is not exposed separately on the detail page (only a link);
  // leave null. Kept in the type for forward compatibility.
  const organizerAddress: string | null = null
  const organizerPhone: string | null = null
  const organizerEmail: string | null = null

  // ── categories ────────────────────────────────────────────────────────────
  const rawCategories: string[] = []
  $('.field--name-categories .field__item').each((_, el) => {
    const c = clean($(el).text())
    if (c) rawCategories.push(c)
  })
  const categories = [...rawCategories]

  // ── price: label "Prijs" + numeric [content]; detail = following no-label ─
  let price: string | null = null
  let priceDetail: string | null = null
  const priceField = fieldByLabel($, 'Prijs')
  if (priceField) {
    price = clean(priceField.find('.field__item').first().text()) || null
    const detailField = priceField.nextAll('.field.no-label').first()
    if (detailField.length) priceDetail = clean(detailField.find('.field__item').first().text()) || null
  }

  // ── reduction groups: label "Kortingsgroepen" ─────────────────────────────
  let reductionGroups: string[] = []
  const reduField = fieldByLabel($, 'Kortingsgroepen')
  if (reduField) {
    const txt = clean(reduField.find('.field__item').first().text())
    reductionGroups = txt
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }

  // ── genre / muziekgenre (if present) ──────────────────────────────────────
  const genreField = fieldByLabel($, 'Muziekgenre') ?? fieldByLabel($, 'Genre')
  const genre = genreField ? clean(genreField.find('.field__item').first().text()) || null : null

  // ── accessibility / feature flags ─────────────────────────────────────────
  // part-of icons (Uit met Vlieg / UitPAS / language / min age) + wheelchair.
  const accessibilityFlags: string[] = []
  $('.field--name-part-of li').each((_, el) => {
    const label = clean($(el).find('span').first().text()) || clean($(el).attr('title'))
    if (label) accessibilityFlags.push(label)
  })
  const wheelchair = clean($('.field--name-wheelchair-unfriendly span').first().text())
  if (wheelchair) accessibilityFlags.push(wheelchair)

  // ── description ───────────────────────────────────────────────────────────
  const descEl = $('.group--description').first().clone()
  descEl.find('.field__label').remove()
  const description = clean(descEl.text()) || null

  // ── ticket link (label "Tickets" or a ticket-classed link) ────────────────
  const ticketField = fieldByLabel($, 'Tickets')
  let ticketUrl: string | null = null
  if (ticketField) ticketUrl = absUrl(ticketField.find('a').first().attr('href'))
  if (!ticketUrl) ticketUrl = absUrl($('a.ticket, a[href*="ticket"]').first().attr('href'))

  // ── ReadSpeaker URL (lives in markup as an &amp;-encoded query) ───────────
  let readSpeakerUrl: string | null = null
  const rsM = html.match(/app-eu\.readspeaker\.com\/cgi-bin\/rsent\?[^"'\s<>]+/)
  if (rsM) readSpeakerUrl = 'https://' + rsM[0].replace(/&amp;/g, '&')

  // ── gallery: every distinct activity image, hero first ────────────────────
  const STYLE_RANK = ['news_detail_large', 'large', 'news_detail_medium', 'medium']
  const byKey = new Map<string, { url: string; rank: number }>()
  $('img[src*="/activity/image/"], source[srcset*="/activity/image/"]').each((_, el) => {
    const raw = $(el).attr('src') ?? ($(el).attr('srcset') ?? '').split(/\s+/)[0]
    const url = absUrl(raw)
    if (!url) return
    const rank = STYLE_RANK.findIndex(s => url.includes(`/styles/${s}/`))
    const key = imageKey(url)
    const prev = byKey.get(key)
    // lower rank index = higher quality; -1 (unknown) sorts last
    const norm = (r: number) => (r === -1 ? 99 : r)
    if (!prev || norm(rank) < norm(prev.rank)) byKey.set(key, { url, rank })
  })
  const gallery = [...byKey.values()].map(v => v.url)
  // Hero = the news_detail_large variant if we found one.
  const hero = [...byKey.values()].find(v => v.url.includes('/styles/news_detail_large/'))
  const imageUrl = hero?.url ?? gallery[0] ?? null

  // ── dates from the day pages this node appeared on ────────────────────────
  const sortedDays = [...days].sort((a, b) => a - b)
  const toIso = (d: number) => `2026-07-${String(d).padStart(2, '0')}`
  const dateStart = sortedDays.length ? toIso(sortedDays[0]) : ''
  const endDateStart = sortedDays.length > 1 ? toIso(sortedDays[sortedDays.length - 1]) : null

  return {
    nodeId,
    detailUrl,
    icsUrl,
    scrapedAt: new Date().toISOString(),

    title,
    venue,
    address,
    dateStart,
    timeStart,
    lat,
    lng,
    description,
    website,
    categories,
    organizer,
    price,
    imageUrl,
    source: 'feesten',

    endDateStart,
    timeEnd,
    allTimes,

    priceDetail,
    reductionGroups,

    accessibilityFlags,

    genre,
    rawCategories,

    organizerUrl,
    organizerAddress,
    organizerPhone,
    organizerEmail,

    venuePhone,
    venueEmail,
    venueUrl,

    ticketUrl,
    readSpeakerUrl,
    gallery,
  }
}

// Fetch + parse a single detail page.
export async function fetchDetail(detailUrl: string, days: number[]): Promise<FeestenEvent> {
  const html = await fetchHtml(detailUrl)
  return parseDetail(html, detailUrl, days)
}
