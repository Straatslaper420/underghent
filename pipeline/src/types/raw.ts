export interface RawEventBase {
  _source:     string
  _scraped_at: string
  title:       string
  date_start:  string
  source_url:  string | null
}

export interface RawGoabaseEvent extends RawEventBase {
  _source:     'goabase'
  event_id:    string
  country:     string | null
  city:        string | null
  venue_name:  string | null
  hour_start:  string | null
  genre_raw:   string | null
  artists_raw: string | null
  description: string | null
  ticket_url:  string | null
  price:       string | null
  organizer:   string | null
}

export interface RawBeldubEvent extends RawEventBase {
  _source:     'beldub'
  event_id:    string | null
  venue_name:  string | null
  hour_start:  string | null
  genre_raw:   string | null
  description: string | null
  city:        string | null
  ticket_url:  string | null
}

export interface RawReggaebeEvent extends RawEventBase {
  _source:     'reggaebe'
  event_id:    string | null
  venue_name:  string | null
  city:        string | null
  hour_start:  string | null
  artists_raw: string | null
  description: string | null
  price:       string | null
}

export interface RawVenueEvent extends RawEventBase {
  _source:     'funke' | 'chinastraat' | 'asgaard' | 'kinkystar' | 'broei' | 'thecrossover' | 'molotov' | 'charlatan' | 'clubsauvage' | 'kompass' | 'wintercircus'
  venue_id:    string
  venue_name:  string
  hour_start:  string | null
  room:        string | null
  description: string | null
  price:       string | null
  ticket_url:  string | null
  artists_raw: string | null
}

export interface RawAgendaEvent extends RawEventBase {
  _source:      'vierdeZaal' | 'minusOne'
  venue_id:     string
  venue_name:   string
  hour_start:   string | null
  hour_end:     string | null
  description:  string | null
  location_raw: string | null
}

export type RawEvent =
  | RawGoabaseEvent
  | RawBeldubEvent
  | RawReggaebeEvent
  | RawVenueEvent
  | RawAgendaEvent
