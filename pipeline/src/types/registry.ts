export interface VenueRecord {
  id:                 string
  canonical_name:     string
  aliases:            string[]
  address:            string | null
  lat:                number | null
  lng:                number | null
  underground_weight: number
  genres:             string[]
  area:               string | null
  website:            string | null
  scrape_url:         string | null
  scrape_type:        'html' | 'ical' | 'json' | 'playwright' | null
}

export interface GenreRecord {
  id:       string
  label:    string
  parent:   string | null
  keywords: string[]
  weight:   number
  aliases:  string[]
}

export interface OrganizerRecord {
  id:      string
  name:    string
  aliases: string[]
  genres:  string[]
  weight:  number
}

export interface Registries {
  venues:     Map<string, VenueRecord>
  venueAlias: Map<string, string>
  genres:     Map<string, GenreRecord>
  /** Dangerous bare tokens that must never match a genre on their own (only inside multi-word keywords). */
  genreStopwords: Set<string>
  organizers: Map<string, OrganizerRecord>
}
