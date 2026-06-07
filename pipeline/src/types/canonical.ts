import { z } from 'zod'

export interface CanonicalEvent {
  event_id:          string
  facebook_id:       string | null
  venue_id:          string | null
  aggregator_id:     string | null
  title:             string
  date_start:        string
  hour_start:        string | null
  venue:             string | null
  room:              string | null
  address:           string | null
  area:              string | null
  latitude:          number | null
  longitude:         number | null
  genre:             string | null
  subgenre:          string | null
  artists:           string[]
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
}

export const CanonicalEventSchema = z.object({
  event_id:          z.string().min(1),
  facebook_id:       z.string().nullable(),
  venue_id:          z.string().nullable(),
  aggregator_id:     z.string().nullable(),
  title:             z.string().min(1),
  date_start:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour_start:        z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  venue:             z.string().nullable(),
  room:              z.string().nullable(),
  address:           z.string().nullable(),
  area:              z.string().nullable(),
  latitude:          z.number().nullable(),
  longitude:         z.number().nullable(),
  genre:             z.string().nullable(),
  subgenre:          z.string().nullable(),
  artists:           z.array(z.string()),
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
})
