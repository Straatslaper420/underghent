import { z } from 'zod'

// Human-owned values pulled back from the sheet's *_override / hide / approved
// columns. NEVER written by scrapers or enrichers — pull-overrides fills this,
// and export uses it only to decide placement (Events vs GeoFail). The
// override columns themselves are never touched by any pipeline write.
export interface EventOverrides {
  venue?:     string
  address?:   string
  latitude?:  number
  longitude?: number
  genre?:     string
  hide?:      boolean
  approved?:  boolean
}

export interface CanonicalEvent {
  event_id:          string
  facebook_id:       string | null
  venue_id:          string | null
  aggregator_id:     string | null
  title:             string
  date_start:        string
  hour_start:        string | null
  hour_end:          string | null
  venue:             string | null
  room:              string | null
  address:           string | null
  area:              string | null
  latitude:          number | null
  longitude:         number | null
  genre:             string | null
  subgenre:          string | null
  genre_raw:         string | null
  artists:           string[]
  support_acts:      string[]
  image_url:         string | null
  source:            string | null
  source_url:        string | null
  ticket_url:        string | null
  price:             string | null
  details:           string | null
  description:       string | null
  interested:        number | null
  going:             number | null
  city:              string | null
  country:           string | null
  organizers:        string[]
  social_links:      string[]
  collective:        string | null
  status:            string | null
  overrides?:        EventOverrides | null
}

export const EventOverridesSchema = z.object({
  venue:     z.string().optional(),
  address:   z.string().optional(),
  latitude:  z.number().optional(),
  longitude: z.number().optional(),
  genre:     z.string().optional(),
  hide:      z.boolean().optional(),
  approved:  z.boolean().optional(),
})

export const CanonicalEventSchema = z.object({
  event_id:          z.string().min(1),
  facebook_id:       z.string().nullable(),
  venue_id:          z.string().nullable(),
  aggregator_id:     z.string().nullable(),
  title:             z.string().min(1),
  date_start:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour_start:        z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  hour_end:          z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  venue:             z.string().nullable(),
  room:              z.string().nullable(),
  address:           z.string().nullable(),
  area:              z.string().nullable(),
  latitude:          z.number().nullable(),
  longitude:         z.number().nullable(),
  genre:             z.string().nullable(),
  subgenre:          z.string().nullable(),
  genre_raw:         z.string().nullable(),
  artists:           z.array(z.string()),
  support_acts:      z.array(z.string()),
  image_url:         z.string().nullable(),
  source:            z.string().nullable(),
  source_url:        z.string().nullable(),
  ticket_url:        z.string().nullable(),
  price:             z.string().nullable(),
  details:           z.string().nullable(),
  description:       z.string().nullable(),
  interested:        z.number().int().nullable(),
  going:             z.number().int().nullable(),
  city:              z.string().nullable(),
  country:           z.string().nullable(),
  organizers:        z.array(z.string()),
  social_links:      z.array(z.string()),
  collective:        z.string().nullable(),
  status:            z.string().nullable(),
  overrides:         EventOverridesSchema.nullable().optional(),
})

// ── Effective values: override wins when present, else the scraped value ─────
// This is the ONE rule both the pipeline and the frontends follow.

export function effectiveLat(e: CanonicalEvent): number | null {
  return e.overrides?.latitude ?? e.latitude
}
export function effectiveLng(e: CanonicalEvent): number | null {
  return e.overrides?.longitude ?? e.longitude
}
export function effectiveVenue(e: CanonicalEvent): string | null {
  return e.overrides?.venue ?? e.venue
}
export function effectiveGenre(e: CanonicalEvent): string | null {
  return e.overrides?.genre ?? e.genre
}
export function effectiveAddress(e: CanonicalEvent): string | null {
  return e.overrides?.address ?? e.address
}
export function isHidden(e: CanonicalEvent): boolean {
  return e.overrides?.hide === true
}
