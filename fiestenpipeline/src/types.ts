// One scraped Gentse Feesten 2026 event, parsed from a detail page.
//
// Field groups:
//  - "shared" fields overlap conceptually with the fb_events tab and are
//    written FIRST (mapped onto the fb_events header by name) so the frontend
//    parses them identically to Facebook events.
//  - everything else is Gentse-Feesten-only detail, written as trailing
//    gf_* columns for in-sheet review and future use.

export interface FeestenEvent {
  // ── provenance ──────────────────────────────────────────────
  nodeId: string
  detailUrl: string
  icsUrl: string | null
  scrapedAt: string // ISO timestamp of the scrape

  // ── shared / overlapping (front-facing) ─────────────────────
  title: string
  venue: string | null
  address: string | null // full composed: "street nr, postalcode locality"
  dateStart: string // ISO date (earliest day the event appears on)
  timeStart: string | null // "HH:MM"
  lat: number | null
  lng: number | null
  description: string | null
  website: string | null
  categories: string[] // cleaned category labels
  organizer: string | null
  price: string | null // short price text, e.g. "€14,00"
  imageUrl: string | null // hero image (absolute URL)
  source: 'feesten'

  // ── multi-day / timing detail ───────────────────────────────
  endDateStart: string | null // ISO date of latest day, if multi-day
  timeEnd: string | null // "HH:MM" (last showtime), if more than one time
  allTimes: string[] // every showtime listed on the page, normalized

  // ── pricing detail ──────────────────────────────────────────
  priceDetail: string | null // full price description text
  reductionGroups: string[] // "Kortingsgroepen" split into entries

  // ── accessibility / flags ───────────────────────────────────
  accessibilityFlags: string[] // wheelchair, UitPAS, Uit met Vlieg, language, min age, …

  // ── classification ──────────────────────────────────────────
  genre: string | null // muziekgenre, if the page exposes one
  rawCategories: string[] // category labels exactly as on the page

  // ── organizer detail ────────────────────────────────────────
  organizerUrl: string | null // link to the organizer entity / site
  organizerAddress: string | null
  organizerPhone: string | null
  organizerEmail: string | null

  // ── venue detail ────────────────────────────────────────────
  venuePhone: string | null
  venueEmail: string | null
  venueUrl: string | null

  // ── links / media ───────────────────────────────────────────
  ticketUrl: string | null
  readSpeakerUrl: string | null
  gallery: string[] // ALL distinct image URLs (absolute), hero first
}
