# UNDERGHENT — Project Snapshot

## Directory Tree

```
underghent_v2/
├── .gitignore
├── credentials.json
├── underghent_agent.py
│
├── data/
│   └── UnderGhent_Events - Events (11).csv
│
├── frontline/
│   ├── .gitignore
│   ├── .aider.chat.history.md
│   ├── .aider.input.history
│   ├── .aider.tags.cache.v4/
│   │   ├── cache.db
│   │   ├── cache.db-shm
│   │   └── cache.db-wal
│   ├── index.html
│   └── qwenwithindexaccess.txt
│
└── pipeline/
    ├── .env
    ├── .env.example
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    │
    ├── config/
    │   ├── credentials.json
    │   ├── genres.json
    │   ├── organizers.json
    │   ├── scoring.json
    │   └── venues.json
    │
    ├── data/
    │   ├── canonical.json
    │   ├── events.json
    │   └── raw/
    │       ├── beldub.json
    │       ├── goabase.json
    │       └── reggaebe.json
    │
    ├── node_modules/
    │   └── (dependencies)
    │
    └── src/
        ├── commands/
        │   ├── dedupe.ts
        │   ├── enrich-artists.ts
        │   ├── enrich-genre.ts
        │   ├── enrich-geo.ts
        │   ├── enrich-score.ts
        │   ├── export.ts
        │   ├── normalize.ts
        │   ├── scrape-agendas.ts
        │   ├── scrape-aggregators.ts
        │   └── scrape-venues.ts
        │
        ├── export/
        │   ├── json.ts
        │   └── sheets.ts
        │
        ├── lib/
        │   ├── date.ts
        │   ├── http.ts
        │   ├── logger.ts
        │   ├── registry.ts
        │   ├── text.ts
        │   └── storage/
        │       ├── json.ts
        │       └── supabase.ts
        │
        ├── pipeline/
        │   ├── dedupe.ts
        │   ├── normalize.ts
        │   └── enrichers/
        │       ├── artists.ts
        │       ├── genre.ts
        │       ├── geo.ts
        │       └── score.ts
        │
        ├── scrapers/
        │   ├── base.ts
        │   ├── agendas/
        │   │   ├── _ical.ts
        │   │   ├── minusOne.ts
        │   │   └── vierdeZaal.ts
        │   ├── aggregators/
        │   │   ├── beldub.ts
        │   │   ├── goabase.ts
        │   │   └── reggaebe.ts
        │   └── venues/
        │       ├── _peppered.ts
        │       ├── asgaard.ts
        │       ├── broei.ts
        │       ├── chinastraat.ts
        │       ├── crossover.ts
        │       ├── funke.ts
        │       ├── kinkystar.ts
        │       └── molotov.ts
        │
        └── types/
            ├── canonical.ts
            ├── enricher.ts
            ├── raw.ts
            ├── registry.ts
            └── storage.ts
```

---

## FILE: frontline/index.html

> 1258 lines — showing first 150 and last 50.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UNDERGHENT</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster/dist/MarkerCluster.Default.css"/>
<style>
/* ── RESET ─────────────────────────────────────────────────── */
*,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
html,body { height:100%; overflow:hidden; }
body {
  font-family:'JetBrains Mono',monospace;
  background:#141219;
  color:#e6e0ea;
}

/* ── CRT SCANLINE OVERLAY ──────────────────────────────────── */
body::before {
  content:'';
  position:fixed;
  inset:0;
  z-index:9999;
  pointer-events:none;
  background:repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 3px,
    rgba(0,0,0,0.03) 3px,
    rgba(0,0,0,0.03) 4px
  );
}

/* ── MAP ───────────────────────────────────────────────────── */
#map {
  position:fixed;
  inset:0;
  z-index:1;
}

/* ── HEADER ────────────────────────────────────────────────── */
#header {
  position:fixed;
  top:0; left:0; right:0;
  height:44px;
  z-index:200;
  background:#1c1b21;
  border-bottom:1px solid rgba(255,255,255,0.06);
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 16px;
}

#wordmark {
  position:relative;
  font-size:13px;
  font-weight:700;
  letter-spacing:0.32em;
  color:#e6e0ea;
  text-transform:uppercase;
  user-select:none;
  flex-shrink:0;
}
#wordmark::after {
  content:'';
  position:absolute;
  inset:0;
  pointer-events:none;
  background:repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0,0,0,0.18) 2px,
    rgba(0,0,0,0.18) 4px
  );
}

#tagline {
  font-size:10px;
  font-weight:500;
  letter-spacing:0.20em;
  color:#cac4d4;
  text-transform:uppercase;
  animation:glitch 5s infinite;
  flex:1;
  text-align:center;
}

@keyframes glitch {
  0%   { text-shadow:none; clip-path:none; opacity:1; }
  1%   { text-shadow:2px 0 #aad1a6, -2px 0 #ff6060; clip-path:inset(8% 0 88% 0); }
  2%   { text-shadow:none; clip-path:none; }
  3%   { text-shadow:-1px 0 #aad1a6; clip-path:inset(55% 0 38% 0); }
  4%   { clip-path:none; text-shadow:none; }
  6%   { text-shadow:1px 0 #ff6060; }
  7%   { text-shadow:none; }
  44%  { text-shadow:none; clip-path:none; }
  45%  { text-shadow:3px 0 #aad1a6, -3px 0 #ff6060; clip-path:inset(40% 0 52% 0); }
  46%  { text-shadow:none; clip-path:none; }
  47%  { clip-path:inset(70% 0 18% 0); }
  48%  { clip-path:none; }
  79%  { text-shadow:none; }
  80%  { text-shadow:2px 0 #ff6060, -1px 0 #aad1a6; clip-path:inset(20% 0 72% 0); }
  81%  { text-shadow:none; clip-path:none; }
  100% { text-shadow:none; clip-path:none; }
}

#header-right {
  display:flex;
  align-items:center;
  gap:10px;
  flex-shrink:0;
}

#live-indicator {
  display:flex;
  align-items:center;
  gap:5px;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.14em;
  color:#aad1a6;
}

#live-dot {
  font-size:7px;
  animation:blink 1.4s infinite;
}
@keyframes blink {
  0%,100% { opacity:1; }
  50%      { opacity:0.25; }
}

#signal-bars {
  font-size:10px;
  color:#cac4d4;
  letter-spacing:0.06em;
}

.hdr-btn {
  width:24px; height:24px;
  border:1px solid rgba(255,255,255,0.06);
  background:none;
  cursor:pointer;

... [lines 151–1207 omitted] ...

  volSlider.classList.remove('muted');
  } else {
    radioBtn.textContent = '◎ URGENT.FM';
    radioBtn.classList.remove('is-live');
    volSlider.classList.add('muted');
  }
  updateShowColor();
}

function reconnect() {
  if (!radioLive) return;
  radio.load();
  radio.volume = parseFloat(volSlider.value);
  radio.play().catch(() => {});
  if (marqueeRAF) cancelAnimationFrame(marqueeRAF);
  initMarquee();
}

radio.addEventListener('ended', reconnect);
radio.addEventListener('error', () => { setTimeout(reconnect, 3000); });

function toggleRadio() {
  if (!radioLive) {
    setLive(true);
    if (firstUnmute) {
      firstUnmute = false;
      // Blink the dot for 2 seconds on first unmute
      radioBtn.querySelector ? null : null; // no-op
      radioBtn.classList.add('radio-dot-blink');
      blinkTimer = setTimeout(() => {
        radioBtn.classList.remove('radio-dot-blink');
      }, 5000);
    }
    radio.volume = parseFloat(volSlider.value);
    radio.play().catch(() => { setLive(false); });
  } else {
    if (blinkTimer) { clearTimeout(blinkTimer); blinkTimer = null; }
    radioBtn.classList.remove('radio-dot-blink');
    setLive(false);
    radio.pause();
  }
}

function setVolume(val) {
  radio.volume = parseFloat(val);
}

loadData();
</script>
</body>
</html>
```

---

## FILE: pipeline/src/types/canonical.ts

```typescript
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
  underground_score: number
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
  underground_score: z.number().min(-2).max(2),
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
```

---

## FILE: pipeline/src/types/raw.ts

```typescript
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
  _source:     'funke' | 'chinastraat' | 'asgaard' | 'kinkystar' | 'broei' | 'thecrossover' | 'molotov' | 'charlatan' | 'kompass' | 'wintercircus'
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
```

---

## FILE: pipeline/config/venues.json

```json
{
  "venues": [
    {
      "id": "charlatan",
      "canonical_name": "Charlatan",
      "aliases": ["charlatan", "de charlatan", "cafe charlatan"],
      "address": "Vlasmarkt 6, 9000 Gent",
      "lat": 51.05603186841703,
      "lng": 3.7285059220882286,
      "underground_weight": -0.3,
      "genres": ["club", "techno", "electronic", "nightlife"],
      "area": "City Centre",
      "website": "https://www.charlatan.be",
      "scrape_url": "https://www.charlatan.be/agenda",
      "scrape_type": "html"
    },
    {
      "id": "kompass",
      "canonical_name": "Kompass",
      "aliases": ["kompass", "kompass klub", "kompass club", "kompass klup"],
      "address": "Nieuwevaart 51, 9000 Gent",
      "lat": 51.06836775216201,
      "lng": 3.723787570557093,
      "underground_weight": -0.3,
      "genres": ["techno", "electronic", "club", "industrial"],
      "area": "Muide",
      "website": "https://kompassklub.com",
      "scrape_url": "https://kompassklub.com/event-list/",
      "scrape_type": "html"
    },
    {
      "id": "viernulvier",
      "canonical_name": "VIERNULVIER",
      "aliases": [
        "viernulvier", "vooruit", "de vooruit", "vooruit concertzaal",
        "4nulvier", "4 nul vier", "kunstencentrum viernulvier",
        "viernulvier concertzaal", "viernulvier café"
      ],
      "address": "Sint-Pietersnieuwstraat 23, 9000 Gent",
      "lat": 51.04785719025603,
      "lng": 3.727390868709035,
      "underground_weight": 0.4,
      "genres": ["concert", "theater", "dance", "alternative", "pop", "jazz"],
      "area": "City Centre",
      "website": "https://www.viernulvier.gent",
      "scrape_url": "https://www.viernulvier.gent/nl/agenda",
      "scrape_type": "html"
    },
    {
      "id": "minusone",
      "canonical_name": "Minus One",
      "aliases": ["minus one", "minus 1", "minus-one", "minus one gent", "joc minus one"],
      "address": "Opgeëistenlaan 455, 9000 Gent",
      "lat": 51.064983789821206,
      "lng": 3.7170938380275604,
      "underground_weight": -0.3,
      "genres": ["punk", "metal", "rock", "hardcore", "DIY"],
      "area": "Brugse Poort",
      "website": "https://www.minus-one.be",
      "scrape_url": "https://www.minus-one.be/agenda",
      "scrape_type": "ical"
    },
    {
      "id": "chinastraat",
      "canonical_name": "Chinastraat",
      "aliases": ["chinastraat", "china straat", "chinastraat gent"],
      "address": "Chinastraat 1, 9000 Gent",
      "lat": 51.07292204573162,
      "lng": 3.7352400275105238,
      "underground_weight": -0.3,
      "genres": ["squat", "DIY", "underground", "experimental"],
      "area": "Dampoort",
      "website": null,
      "scrape_url": "https://chinastraat.be",
      "scrape_type": "html"
    },
    {
      "id": "vierdeZaal",
      "canonical_name": "Vierde Zaal",
      "aliases": [
        "vierde zaal", "4e zaal", "4dezaal", "de vierde zaal",
        "4de zaal", "vierdezaal"
      ],
      "address": "Driebeekstraat 4, 9050 Gent",
      "lat": 51.03703524099016,
      "lng": 3.76571949754381,
      "underground_weight": -0.3,
      "genres": ["DIY", "underground", "experimental", "punk"],
      "area": null,
      "website": null,
      "scrape_url": "https://vierdezaal.gent/agenda",
      "scrape_type": "ical"
    },
    {
      "id": "wintercircus",
      "canonical_name": "Wintercircus",
      "aliases": ["wintercircus", "winter circus", "club wintercircus"],
      "address": "Lammerstraat 13, 9000 Gent",
      "lat": 51.04823127912577,
      "lng": 3.728013926379643,
      "underground_weight": 0.5,
      "genres": ["club", "pop", "electronic", "urban"],
      "area": "City Centre",
      "website": null,
      "scrape_url": "https://www.wintercircus.be/en/agenda",
      "scrape_type": "html"
    },
    {
      "id": "baudelopark",
      "canonical_name": "Baudelopark",
      "aliases": ["baudelopark", "baudelo", "baudelo park"],
      "address": "Koning Willem I-kaai 8, 9000 Gent",
      "lat": 51.05846956553006,
      "lng": 3.7303613975448613,
      "underground_weight": 0.2,
      "genres": ["outdoor", "festival", "community", "world"],
      "area": "City Centre",
      "website": null,
      "scrape_url": null,
      "scrape_type": null
    },
    {
      "id": "funke",
      "canonical_name": "FUNKE",
      "aliases": ["funke", "cafe funke", "funke gent", "FUNKE"],
      "address": "Sint-Jacobs 13-13A, 9000 Gent",
      "lat": 51.0571191,
      "lng": 3.7276669,
      "underground_weight": -0.5,
      "genres": ["jazz", "blues", "world", "live music"],
      "area": "City Centre",
      "website": "https://funke.gent/",
      "scrape_url": "https://funke.gent/agenda",
      "scrape_type": "html"
    },
    {
      "id": "asgaard",
      "canonical_name": "Asgaard",
      "aliases": ["asgaard", "asgaard gentbrugge", "asgaard gent"],
      "address": "Driebeekstraat 3, 9050 Gentbrugge",
      "lat": 51.0367699,
      "lng": 3.7659118,
      "underground_weight": -0.5,
      "genres": ["metal", "hardcore", "punk"],
      "area": null,
      "website": null,
      "scrape_url": "https://asgaard.be/programma",
      "scrape_type": "html"
    },
    {
      "id": "missy_sippy",
      "canonical_name": "Missy Sippy",
      "aliases": [
        "missy sippy", "missy sippy blues",
        "missy sippy blues & roots club",
        "missy sippy blues and roots club"
      ],
      "address": "Klein Turkije 16, 9000 Gent",
      "lat": 51.05445833867116,
      "lng": 3.7226740110387766,
      "underground_weight": 0.2,
      "genres": ["blues", "jazz", "roots", "swing", "live music"],
      "area": "City Centre",
      "website": "https://www.missy-sippy.be",
      "scrape_url": null,
      "scrape_type": null
    },
    {
      "id": "shoonya",
      "canonical_name": "Shoonya Dance Centre",
      "aliases": ["shoonya", "shoonya dance", "shoonya dance centre", "shoonya dance gent", "stapelplein 41"],
      "address": "Stapelplein 41, 9000 Gent",
      "lat": 51.063525166973676,
      "lng": 3.7342634398745163,
      "underground_weight": 0.2,
      "genres": ["dance", "world", "festival", "workshop"],
      "area": "Dampoort",
      "website": "https://www.shoonyadance.com",
      "scrape_url": null,
      "scrape_type": null
    },
    {
      "id": "hotclub",
      "canonical_name": "Hot Club Gent",
      "aliases": ["hot club gent", "hot club", "hotclub gent"],
      "address": "Schuddevisstraatje 2, 9000 Gent",
      "lat": 51.05638448302568,
      "lng": 3.722551682203568,
      "underground_weight": 0.2,
      "genres": ["jazz", "blues", "swing", "world", "gypsy"],
      "area": "City Centre",
      "website": "https://www.hotclub.gent",
      "scrape_url": "https://www.hotclub.gent/programma.php",
      "scrape_type": "html"
    },
    {
      "id": "decentrale",
      "canonical_name": "De Centrale",
      "aliases": ["de centrale", "centrale gent", "intercultureel muziekcentrum"],
      "address": "Kraankindersstraat 2, 9000 Gent",
      "lat": 51.06151194618855,
      "lng": 3.7343752687757483,
      "underground_weight": 0.2,
      "genres": ["world", "intercultural", "jazz", "folk", "global"],
      "area": "Dampoort",
      "website": "https://www.decentrale.be",
      "scrape_url": "https://www.decentrale.be/en/agenda",
      "scrape_type": "html"
    },
    {
      "id": "ha_concerts",
      "canonical_name": "Ha Concerts",
      "aliases": ["ha concerts", "haconcerts", "ha", "ha gent", "de handelsbeurs"],
      "address": "Kouter 29, 9000 Gent",
      "lat": 51.04995797741283,
      "lng": 3.723342946222628,
      "underground_weight": 0.2,
      "genres": ["jazz", "pop", "world", "classical", "children"],
      "area": "City Centre",
      "website": "https://www.haconcerts.be",
      "scrape_url": "https://www.haconcerts.be/nl/concertagenda",
      "scrape_type": "html"
    },
    {
      "id": "thecrossover",
      "canonical_name": "The Crossover",
      "aliases": ["the crossover", "crossover music pub", "crossover gent"],
      "address": "Biezekapelstraat 6, 9000 Gent",
      "lat": 51.111710298125985,
      "lng": 3.7400412829803122,
      "underground_weight": -0.2,
      "genres": ["blues", "rock", "roots", "soul", "live music"],
      "area": null,
      "website": "https://www.thecrossover.be",
      "scrape_url": "https://www.thecrossover.be/",
      "scrape_type": "html"
    },
    {
      "id": "zebrastraat",
      "canonical_name": "Zebrastraat",
      "aliases": ["zebrastraat", "zebra straat", "zebrastraat gent"],
      "address": "Zebrastraat 32, 9000 Gent",
      "lat": 51.03997086700192,
      "lng": 3.733814466397537,
      "underground_weight": 0.2,
      "genres": ["arts", "culture", "experimental", "interdisciplinary"],
      "area": null,
      "website": "https://www.zebrastraat.be",
      "scrape_url": "https://www.zebrastraat.be/nl/agenda",
      "scrape_type": "html"
    },
    {
      "id": "broei",
      "canonical_name": "BROEI",
      "aliases": ["broei", "broei gent", "broei vzw"],
      "address": "Nieuwland 69, 9000 Gent",
      "lat": 51.06276151712576,
      "lng": 3.7304432980316027,
      "underground_weight": -0.2,
      "genres": ["arts", "culture", "DIY", "community", "performance", "music", "safe space"],
      "area": "Muide",
      "website": "https://www.broei.be",
      "scrape_url": "https://www.broei.be/agenda",
      "scrape_type": "html"
    },
    {
      "id": "trefpunt",
      "canonical_name": "Trefpunt",
      "aliases": ["trefpunt", "trefpunt gent", "trefpunt festival"],
      "address": "Walter De Buckplein 5, 9000 Gent",
      "lat": 51.05629940833704,
      "lng": 3.7271136986516025,
      "underground_weight": 0.2,
      "genres": ["jazz", "blues", "folk", "world", "live music", "community"],
      "area": "City Centre",
      "website": "https://trefpunt.be",
      "scrape_url": "https://trefpunt.be/agenda/",
      "scrape_type": "html"
    },
    {
      "id": "kinkystar",
      "canonical_name": "Kinky Star",
      "aliases": ["kinky star", "kinkystar", "kinky star gent"],
      "address": "Vlasmarkt 9, 9000 Gent",
      "lat": 51.055966233961335,
      "lng": 3.7285570259706775,
      "underground_weight": -0.4,
      "genres": ["indie", "alternative", "punk", "experimental", "DIY", "underground"],
      "area": "City Centre",
      "website": "https://kinkystar.com",
      "scrape_url": "https://kinkystar.com/programma",
      "scrape_type": "html"
    },
    {
      "id": "copadok",
      "canonical_name": "Copa DOK",
      "aliases": ["copa dok", "copadok", "copa dok gent", "copa"],
      "address": "Koopvaardijlaan, 9000 Gent",
      "lat": 51.07048447071386,
      "lng": 3.7364126971363967,
      "underground_weight": 0.2,
      "genres": ["festival", "outdoor", "pop", "world", "electronic"],
      "area": "Muide",
      "website": "https://www.copadok.be",
      "scrape_url": "https://www.copadok.be/line-up",
      "scrape_type": "html"
    },
    {
      "id": "debijloke",
      "canonical_name": "De Bijloke",
      "aliases": ["de bijloke", "bijloke", "muziekcentrum de bijloke", "bijloke gent", "kraakhuis"],
      "address": "Bijlokekaai 7, 9000 Gent",
      "lat": 51.043784604116425,
      "lng": 3.719343036800827,
      "underground_weight": 0.2,
      "genres": ["classical", "world", "jazz", "folk", "early music"],
      "area": "City Centre",
      "website": "https://www.bijloke.be",
      "scrape_url": "https://www.bijloke.be/nl/programma",
      "scrape_type": "html"
    },
    {
      "id": "molotov",
      "canonical_name": "Molotov",
      "aliases": ["molotov", "molotov gent", "cafe molotov"],
      "address": "Voetweg 48, 9000 Gent",
      "lat": 51.04070189091864,
      "lng": 3.726496810630025,
      "underground_weight": -0.5,
      "genres": ["punk", "metal", "hardcore", "DIY", "underground"],
      "area": "City Centre",
      "website": null,
      "scrape_url": null,
      "scrape_type": null
    }
  ]
}
```

---

## FILE: pipeline/config/genres.json

```json
{
  "genres": [
    {
      "id": "electronic",
      "label": "Electronic",
      "parent": null,
      "keywords": ["electronic", "elektronisch"],
      "weight": 0.0,
      "aliases": []
    },
    {
      "id": "rock",
      "label": "Rock",
      "parent": null,
      "keywords": ["rock"],
      "weight": -0.1,
      "aliases": []
    },
    {
      "id": "reggae",
      "label": "Reggae",
      "parent": null,
      "keywords": ["electronic", "elektronisch"],
      "weight": -0.3,
      "aliases": []
    },
    {
      "id": "dnb",
      "label": "Drum & Bass",
      "parent": "electronic",
      "keywords": ["drum and bass", "drum & bass", "dnb", "d&b", "drum'n'bass", "drumnbass"],
      "weight": -0.5,
      "aliases": ["dnb", "d&b"]
    },
    {
      "id": "jungle",
      "label": "Jungle",
      "parent": "electronic",
      "keywords": ["jungle", "junglist", "jungleismassive", "ragga jungle"],
      "weight": -1.0,
      "aliases": []
    },
    {
      "id": "dub",
      "label": "Dub",
      "parent": "reggae",
      "keywords": ["dub", "soundsystem", "sound system", "steppers", "roots dub"],
      "weight": -1.0,
      "aliases": []
    },
    {
      "id": "roots_reggae",
      "label": "Roots",
      "parent": "reggae",
      "keywords": ["roots reggae", "roots", "reggae roots", "conscious reggae"],
      "weight": -1.0,
      "aliases": ["roots reggae"]
    },
    {
      "id": "goa",
      "label": "Goa / Psytrance",
      "parent": "electronic",
      "keywords": ["goa", "psytrance", "psy trance", "psychedelic trance", "full on", "progressive psy"],
      "weight": -1.0,
      "aliases": ["psytrance", "goa trance"]
    },
    {
      "id": "forest",
      "label": "Forest",
      "parent": "electronic",
      "keywords": ["forest", "darkpsy", "dark psy", "forest psy"],
      "weight": -1.0,
      "aliases": []
    },
    {
      "id": "tekno",
      "label": "Tekno",
      "parent": "electronic",
      "keywords": ["tekno", "teknival", "free tekno", "acid tekno"],
      "weight": -1.0,
      "aliases": []
    },
    {
      "id": "tribe",
      "label": "Tribe",
      "parent": "electronic",
      "keywords": ["tribe", "freetekno", "free party"],
      "weight": -1.0,
      "aliases": []
    },
    {
      "id": "oldschool_dubstep",
      "label": "Oldschool Dubstep",
      "parent": "reggae",
      "keywords": ["oldschool dubstep", "old school dubstep", "uk dubstep", "og dubstep", "early dubstep"],
      "weight": -1.0,
      "aliases": ["oldschool dubstep"]
    },
    {
      "id": "hardcore",
      "label": "Hardcore",
      "parent": "electronic",
      "keywords": ["hardcore", "frenchcore", "terrorcore", "uptempo", "speedcore"],
      "weight": -0.8,
      "aliases": []
    },
    {
      "id": "gabber",
      "label": "Gabber",
      "parent": "electronic",
      "keywords": ["gabber", "rotterdam hardcore", "oldschool hardcore"],
      "weight": -0.8,
      "aliases": []
    },
    {
      "id": "punk",
      "label": "Punk",
      "parent": "rock",
      "keywords": ["punk", "crust", "anarcho-punk", "d-beat", "crustpunk", "oi", "street punk"],
      "weight": -0.8,
      "aliases": []
    },
    {
      "id": "ska",
      "label": "Ska",
      "parent": "rock",
      "keywords": ["ska", "ska punk", "two tone", "third wave ska"],
      "weight": -0.3,
      "aliases": []
    },
    {
      "id": "metal",
      "label": "Metal",
      "parent": "rock",
      "keywords": ["metal", "heavy metal", "doom", "sludge", "stoner", "thrash", "death metal", "black metal", "grindcore", "metalcore"],
      "weight": -0.5,
      "aliases": ["heavy metal"]
    },
    {
      "id": "industrial",
      "label": "Industrial",
      "parent": "electronic",
      "keywords": ["industrial", "ebm", "body music", "dark electro"],
      "weight": -0.4,
      "aliases": []
    },
    {
      "id": "techno",
      "label": "Techno",
      "parent": "electronic",
      "keywords": ["techno", "acid techno", "industrial techno", "detroit techno", "rave"],
      "weight": -0.3,
      "aliases": []
    },
    {
      "id": "house",
      "label": "House",
      "parent": "electronic",
      "keywords": ["house", "deep house", "afro house", "organic house", "soulful house", "nu disco"],
      "weight": 0.2,
      "aliases": []
    },
    {
      "id": "tech_house",
      "label": "Tech House",
      "parent": "electronic",
      "keywords": ["tech house", "minimal techno", "minimal"],
      "weight": 0.7,
      "aliases": ["tech house"]
    },
    {
      "id": "commercial_edm",
      "label": "Commercial EDM",
      "parent": "electronic",
      "keywords": ["edm", "commercial", "big room", "festival edm", "mainstage", "future house", "electro house"],
      "weight": 1.0,
      "aliases": ["edm"]
    },
    {
      "id": "pop",
      "label": "Pop",
      "parent": null,
      "keywords": ["pop", "indie pop", "synth pop"],
      "weight": 1.8,
      "aliases": []
    },
    {
      "id": "jazz",
      "label": "Jazz",
      "parent": null,
      "keywords": ["jazz", "blues jazz", "bebop", "swing jazz"],
      "weight": 0.3,
      "aliases": []
    },
    {
      "id": "blues",
      "label": "Blues",
      "parent": null,
      "keywords": ["blues", "delta blues", "electric blues"],
      "weight": 0.2,
      "aliases": []
    },
    {
      "id": "folk",
      "label": "Folk",
      "parent": null,
      "keywords": ["folk", "indie folk", "acoustic folk"],
      "weight": 0.3,
      "aliases": []
    },
    {
      "id": "world",
      "label": "World",
      "parent": null,
      "keywords": ["world music", "worldbeat", "afrobeat", "cumbia"],
      "weight": 0.2,
      "aliases": []
    },
    {
      "id": "classical",
      "label": "Classical",
      "parent": null,
      "keywords": ["classical", "klassiek", "orchestral", "chamber music", "opera"],
      "weight": 1.0,
      "aliases": []
    }
  ]
}
```

---

## FILE: pipeline/config/scoring.json

```json
{
  "genre_weights": {
    "dnb":               -1.0,
    "jungle":            -1.0,
    "dub":               -1.0,
    "roots reggae":      -1.0,
    "goa":               -1.0,
    "psytrance":         -1.0,
    "forest":            -1.0,
    "tekno":             -1.0,
    "tribe":             -1.0,
    "oldschool dubstep": -1.0,
    "hardcore":          -0.8,
    "gabber":            -0.8,
    "punk":              -0.8,
    "metal":             -0.5,
    "heavy metal":       -0.5,
    "techno":            -0.3,
    "ska":               -0.3,
    "house":              0.2,
    "deep house":         0.2,
    "tech house":         0.5,
    "minimal":            0.5,
    "commercial edm":     1.0,
    "edm":                1.0
  },
  "venue_weights": {
    "funke":        -0.5,
    "asgaard":      -0.5,
    "molotov":      -0.5,
    "kinkystar":    -0.4,
    "chinastraat":  -0.3,
    "broei":        -0.2,
    "viernulvier":   0.4,
    "wintercircus":  0.5
  },
  "area_weights": {
    "Dampoort":     -0.2,
    "Brugse Poort": -0.2,
    "Muide":        -0.2,
    "City Centre":   0.2
  },
  "source_weights": {
    "facebook": -0.2
  },
  "clamp": {
    "min": -2.0,
    "max":  2.0
  },
  "visibility": {
    "underghent_only_below":  -1.0,
    "eventghent_only_above":   1.0
  }
}
```

---

## FILE: pipeline/package.json

```json
{
  "name": "underghent-pipeline",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "scrape:aggregators": "tsx src/commands/scrape-aggregators.ts",
    "scrape:venues":      "tsx src/commands/scrape-venues.ts",
    "scrape:agendas":     "tsx src/commands/scrape-agendas.ts",
    "normalize":          "tsx src/commands/normalize.ts",
    "dedupe":             "tsx src/commands/dedupe.ts",
    "enrich:artists":     "tsx src/commands/enrich-artists.ts",
    "enrich:genre":       "tsx src/commands/enrich-genre.ts",
    "enrich:geo":         "tsx src/commands/enrich-geo.ts",
    "enrich:score":       "tsx src/commands/enrich-score.ts",
    "export":             "tsx src/commands/export.ts",
    "pipeline":           "npm run scrape:aggregators && npm run scrape:venues && npm run scrape:agendas && npm run normalize && npm run dedupe && npm run enrich:artists && npm run enrich:genre && npm run enrich:geo && npm run enrich:score && npm run export"
  },
  "dependencies": {
    "cheerio":    "^1.0.0",
    "playwright": "^1.44.0",
    "zod":        "^3.23.0",
    "googleapis": "^140.0.0",
    "dotenv":     "^16.4.0"
  },
  "devDependencies": {
    "typescript":  "^5.4.0",
    "tsx":         "^4.11.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## FILE: pipeline/src/pipeline/normalize.ts

```typescript
import { createHash } from 'crypto'
import { readdirSync } from 'fs'
import { join } from 'path'
import { normalizeText } from '../lib/text.js'
import { CanonicalEventSchema } from '../types/canonical.js'
import { log } from '../lib/logger.js'
import type { CanonicalEvent } from '../types/canonical.js'
import type { Registries } from '../types/registry.js'
import type { StorageAdapter } from '../types/storage.js'
import type {
  RawGoabaseEvent, RawBeldubEvent, RawReggaebeEvent,
  RawVenueEvent, RawAgendaEvent, RawEventBase,
} from '../types/raw.js'

function makeEventId(source: string, title: string, date: string): string {
  return createHash('sha1')
    .update(`${source}|${normalizeText(title)}|${date}`)
    .digest('hex')
    .slice(0, 16)
}

function resolveVenue(
  venueName: string | null,
  registries: Registries,
): Pick<CanonicalEvent, 'venue_id' | 'venue' | 'address' | 'latitude' | 'longitude' | 'area'> {
  if (!venueName) return { venue_id: null, venue: null, address: null, latitude: null, longitude: null, area: null }

  const key = normalizeText(venueName)
  const id  = registries.venueAlias.get(key)
  if (id) {
    const v = registries.venues.get(id)!
    return {
      venue_id:  v.id,
      venue:     v.canonical_name,
      address:   v.address,
      latitude:  v.lat,
      longitude: v.lng,
      area:      v.area,
    }
  }
  return { venue_id: null, venue: venueName, address: null, latitude: null, longitude: null, area: null }
}

function defaults(): Omit<CanonicalEvent,
  'event_id' | 'title' | 'date_start' | 'source_url' |
  'venue_id' | 'venue' | 'address' | 'latitude' | 'longitude' | 'area'> {
  return {
    facebook_id:       null,
    aggregator_id:     null,
    hour_start:        null,
    room:              null,
    genre:             null,
    subgenre:          null,
    artists:           [],
    underground_score: 0,
    ticket_url:        null,
    price:             null,
    details:           null,
    description:       null,
    interested:        null,
    going:             null,
    city:              null,
    country:           null,
    organizers:        [],
    social_links:      [],
    collective:        null,
    status:            'pending',
  }
}

function normalizeGoabase(raw: RawGoabaseEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    const date_start = r.date_start
    if (!date_start) return []
    const venueFields = resolveVenue(r.venue_name, registries)
    const event: CanonicalEvent = {
      ...defaults(),
      ...venueFields,
      event_id:      makeEventId('goabase', r.title, date_start),
      aggregator_id: r.event_id ? `gb_${r.event_id}` : null,
      title:         r.title,
      date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      description:   r.description ?? null,
      ticket_url:    r.ticket_url ?? null,
      price:         r.price ?? null,
      city:          r.city ?? null,
      country:       r.country ?? null,
      organizers:    r.organizer ? [r.organizer] : [],
    }
    return [event]
  })
}

function normalizeBeldub(raw: RawBeldubEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const venueFields = resolveVenue(r.venue_name, registries)
    const fbMatch = r.event_id?.match(/\/events\/(\d+)/)
    const aggId   = fbMatch ? fbMatch[1] : r.event_id
    const event: CanonicalEvent = {
      ...defaults(),
      ...venueFields,
      event_id:      makeEventId('beldub', r.title, r.date_start),
      aggregator_id: aggId ? `bd_${aggId}` : null,
      title:         r.title,
      date_start:    r.date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      description:   r.description ?? null,
      ticket_url:    r.ticket_url ?? null,
      city:          r.city ?? null,
      country:       'Belgium',
    }
    return [event]
  })
}

function normalizeReggaebe(raw: RawReggaebeEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const venueFields = resolveVenue(r.venue_name, registries)
    const event: CanonicalEvent = {
      ...defaults(),
      ...venueFields,
      event_id:      makeEventId('reggaebe', r.title, r.date_start),
      aggregator_id: r.event_id ? `rg_${r.event_id}` : null,
      title:         r.title,
      date_start:    r.date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      description:   r.description ?? null,
      price:         r.price ?? null,
      city:          r.city ?? null,
      country:       'Belgium',
    }
    return [event]
  })
}

function normalizeVenue(raw: RawVenueEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const reg = registries.venues.get(r.venue_id)
    const event: CanonicalEvent = {
      ...defaults(),
      event_id:      makeEventId(r.venue_id, r.title, r.date_start),
      venue_id:      r.venue_id,
      venue:         r.venue_name,
      address:       reg?.address ?? null,
      latitude:      reg?.lat ?? null,
      longitude:     reg?.lng ?? null,
      area:          reg?.area ?? null,
      title:         r.title,
      date_start:    r.date_start,
      source_url:    r.source_url,
      hour_start:    r.hour_start ?? null,
      room:          r.room ?? null,
      description:   r.description ?? null,
      price:         r.price ?? null,
      ticket_url:    r.ticket_url ?? null,
      city:          'Gent',
      country:       'Belgium',
    }
    return [event]
  })
}

function normalizeAgenda(raw: RawAgendaEvent[], registries: Registries): CanonicalEvent[] {
  return raw.flatMap(r => {
    if (!r.date_start) return []
    const reg = registries.venues.get(r.venue_id)
    const event: CanonicalEvent = {
      ...defaults(),
      event_id:    makeEventId(r.venue_id, r.title, r.date_start),
      venue_id:    r.venue_id,
      venue:       r.venue_name,
      address:     reg?.address ?? null,
      latitude:    reg?.lat ?? null,
      longitude:   reg?.lng ?? null,
      area:        reg?.area ?? null,
      title:       r.title,
      date_start:  r.date_start,
      source_url:  r.source_url,
      hour_start:  r.hour_start ?? null,
      description: r.description ?? null,
      city:        'Gent',
      country:     'Belgium',
    }
    return [event]
  })
}

function validateEvent(event: CanonicalEvent, source: string): CanonicalEvent | null {
  const result = CanonicalEventSchema.safeParse(event)
  if (!result.success) {
    log('NORMALIZE', `WARN skipped invalid event from ${source}: "${event.title}" — ${result.error.errors[0]?.message}`)
    return null
  }
  return result.data as CanonicalEvent
}

export async function normalizeAll(
  storage: StorageAdapter,
  registries: Registries,
  dataDir: string,
): Promise<number> {
  const rawDir   = join(dataDir, 'raw')
  const allEvents: CanonicalEvent[] = []

  let files: string[] = []
  try {
    files = readdirSync(rawDir).filter(f => f.endsWith('.json'))
  } catch {
    log('NORMALIZE', 'No raw data directory found — nothing to normalize')
    return 0
  }

  for (const file of files) {
    const source = file.replace('.json', '')
    const raw    = await storage.readRaw<RawEventBase>(source)
    if (!raw.length) continue

    let normalized: CanonicalEvent[] = []

    if (source === 'goabase') {
      normalized = normalizeGoabase(raw as RawGoabaseEvent[], registries)
    } else if (source === 'beldub') {
      normalized = normalizeBeldub(raw as RawBeldubEvent[], registries)
    } else if (source === 'reggaebe') {
      normalized = normalizeReggaebe(raw as RawReggaebeEvent[], registries)
    } else if (['vierdeZaal', 'minusOne'].includes(source)) {
      normalized = normalizeAgenda(raw as RawAgendaEvent[], registries)
    } else {
      // All venue scrapers
      normalized = normalizeVenue(raw as RawVenueEvent[], registries)
    }

    const valid = normalized.map(e => validateEvent(e, source)).filter((e): e is CanonicalEvent => e !== null)
    allEvents.push(...valid)
  }

  // Merge with any existing canonical events (preserve enriched data)
  const existing    = await storage.readCanonical()
  const existingMap = new Map(existing.map(e => [e.event_id, e]))

  for (const event of allEvents) {
    if (!existingMap.has(event.event_id)) {
      existingMap.set(event.event_id, event)
    }
    // If already exists, preserve it (enrichment already applied)
  }

  const merged = Array.from(existingMap.values())
  await storage.writeCanonical(merged)
  return allEvents.length
}
```

---

## FILE: pipeline/src/pipeline/dedupe.ts

```typescript
import { createHash } from 'crypto'
import { normalizeText, diceCoefficient } from '../lib/text.js'
import type { CanonicalEvent } from '../types/canonical.js'
import type { StorageAdapter } from '../types/storage.js'

// Higher = preferred source when merging duplicates
const SOURCE_PRIORITY: Record<string, number> = {
  facebook:    0,
  goabase:     1,
  beldub:      1,
  reggaebe:    1,
  funke:       2,
  chinastraat: 2,
  asgaard:     2,
  kinkystar:   2,
  broei:       2,
  thecrossover:2,
  molotov:     2,
  vierdeZaal:  2,
  minusOne:    2,
}

function sourceOf(event: CanonicalEvent): string {
  if (event.facebook_id) return 'facebook'
  if (event.aggregator_id) return event.aggregator_id.split('-')[0] ?? 'aggregator'
  return event.venue_id ?? 'unknown'
}

function priority(event: CanonicalEvent): number {
  return SOURCE_PRIORITY[sourceOf(event)] ?? 1
}

function dedupeKey(event: CanonicalEvent): string {
  return createHash('sha1')
    .update(`${normalizeText(event.title)}|${event.date_start}`)
    .digest('hex')
    .slice(0, 12)
}

function mergeAggregatorIds(a: CanonicalEvent, b: CanonicalEvent): string | null {
  const ids = [
    ...(a.aggregator_id ?? '').split(',').map(s => s.trim()).filter(Boolean),
    ...(b.aggregator_id ?? '').split(',').map(s => s.trim()).filter(Boolean),
  ]
  const unique = [...new Set(ids)]
  return unique.length ? unique.join(', ') : null
}

function merge(winner: CanonicalEvent, loser: CanonicalEvent): CanonicalEvent {
  return {
    ...winner,
    // Accumulate all source IDs so the merged event stays traceable
    aggregator_id: mergeAggregatorIds(winner, loser),
    // Pull social counts from Facebook source
    interested:  winner.interested ?? loser.interested,
    going:       winner.going ?? loser.going,
    // Pull missing fields from loser
    ticket_url:  winner.ticket_url ?? loser.ticket_url,
    description: winner.description ?? loser.description,
    price:       winner.price ?? loser.price,
    hour_start:  winner.hour_start ?? loser.hour_start,
    artists:     winner.artists.length ? winner.artists : loser.artists,
    organizers:  winner.organizers.length ? winner.organizers : loser.organizers,
  }
}

function countFields(e: CanonicalEvent): number {
  return Object.values(e).filter(v => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== '')).length
}

export async function deduplicateAll(storage: StorageAdapter): Promise<number> {
  const events    = await storage.readCanonical()
  const active    = events.filter(e => e.status !== 'duplicate')
  const canonical = new Map<string, CanonicalEvent>()
  let mergeCount  = 0

  // ─── Exact pass ─────────────────────────────────────────────────────────────
  const byKey = new Map<string, CanonicalEvent[]>()
  for (const e of active) {
    const key = dedupeKey(e)
    const bucket = byKey.get(key) ?? []
    bucket.push(e)
    byKey.set(key, bucket)
  }

  for (const [key, group] of byKey) {
    if (group.length === 1) {
      canonical.set(key, group[0])
      continue
    }
    // Pick winner: highest source priority, then most non-null fields
    const sorted = [...group].sort((a, b) => {
      const pd = priority(b) - priority(a)
      return pd !== 0 ? pd : countFields(b) - countFields(a)
    })
    let winner = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      winner = merge(winner, sorted[i])
      sorted[i] = { ...sorted[i], status: 'duplicate' }
      mergeCount++
    }
    canonical.set(key, winner)
  }

  // ─── Fuzzy pass (same date, title similarity > 0.85) ────────────────────────
  const byDate = new Map<string, CanonicalEvent[]>()
  for (const e of canonical.values()) {
    const bucket = byDate.get(e.date_start) ?? []
    bucket.push(e)
    byDate.set(e.date_start, bucket)
  }

  const toMark = new Set<string>()
  for (const group of byDate.values()) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (toMark.has(a.event_id) || toMark.has(b.event_id)) continue

        const sim = diceCoefficient(normalizeText(a.title), normalizeText(b.title))
        if (sim < 0.85) continue

        const winner = priority(a) >= priority(b) ? a : b
        const loser  = winner === a ? b : a

        const merged = merge(winner, loser)
        canonical.set(dedupeKey(winner), merged)
        toMark.add(loser.event_id)
        mergeCount++
      }
    }
  }

  // Assemble final list: canonical winners + all original duplicates marked
  const duplicateIds = new Set<string>()
  for (const e of active) {
    if (toMark.has(e.event_id)) duplicateIds.add(e.event_id)
  }

  const result: CanonicalEvent[] = [
    ...canonical.values(),
    ...events.filter(e => e.status === 'duplicate'),
    ...active.filter(e => duplicateIds.has(e.event_id)).map(e => ({ ...e, status: 'duplicate' as const })),
  ]

  // Deduplicate the result list itself by event_id
  const seen = new Set<string>()
  const final: CanonicalEvent[] = []
  for (const e of result) {
    if (!seen.has(e.event_id)) {
      seen.add(e.event_id)
      final.push(e)
    }
  }

  await storage.writeCanonical(final)
  return mergeCount
}
```

---

## FILE: pipeline/src/pipeline/enrichers/score.ts

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'
import { normalizeText } from '../../lib/text.js'
import type { Enricher, EnricherResult, PipelineContext } from '../../types/enricher.js'
import type { CanonicalEvent } from '../../types/canonical.js'

interface ScoringConfig {
  genre_weights:  Record<string, number>
  venue_weights:  Record<string, number>
  area_weights:   Record<string, number>
  source_weights: Record<string, number>
  clamp:          { min: number; max: number }
}

function loadScoring(configDir: string): ScoringConfig {
  return JSON.parse(readFileSync(join(configDir, 'scoring.json'), 'utf-8')) as ScoringConfig
}

let scoringCache: ScoringConfig | null = null

export const scoreEnricher: Enricher = {
  name: 'SCORE',
  async enrich(event: CanonicalEvent, ctx: PipelineContext): Promise<EnricherResult> {
    if (!scoringCache) {
      const configDir = join(ctx.dataDir, '..', 'config')
      scoringCache = loadScoring(configDir)
    }
    const s = scoringCache

    let score = 0

    // Genre weight — try subgenre first, then genre
    const genreKey = normalizeText(event.subgenre ?? event.genre ?? '')
    if (genreKey) {
      // Direct key lookup
      const direct = s.genre_weights[genreKey]
      if (direct !== undefined) {
        score += direct
      } else {
        // Try matching any key that is contained in the genre key
        for (const [key, weight] of Object.entries(s.genre_weights)) {
          if (normalizeText(key) === genreKey) {
            score += weight
            break
          }
        }
      }
    }

    // Venue weight
    if (event.venue_id) {
      score += s.venue_weights[event.venue_id] ?? 0
    }

    // Area weight
    if (event.area) {
      score += s.area_weights[event.area] ?? 0
    }

    // Facebook source weight
    if (event.facebook_id !== null) {
      score += s.source_weights['facebook'] ?? 0
    }

    // Clamp and round
    const clamped = Math.max(s.clamp.min, Math.min(s.clamp.max, score))
    const rounded = Math.round(clamped * 100) / 100

    return { underground_score: rounded }
  },
}
```

---

## FILE: pipeline/src/pipeline/enrichers/genre.ts

```typescript
import { normalizeText } from '../../lib/text.js'
import type { Enricher, EnricherResult, PipelineContext } from '../../types/enricher.js'
import type { CanonicalEvent } from '../../types/canonical.js'
import type { GenreRecord } from '../../types/registry.js'

function buildCombinedText(event: CanonicalEvent, venueGenres: string[]): string {
  return normalizeText([
    event.title,
    event.description ?? '',
    event.details ?? '',
    event.artists.join(' '),
    venueGenres.join(' '),
  ].join(' '))
}

function scoreGenre(genre: GenreRecord, text: string): number {
  let count = 0
  for (const keyword of genre.keywords) {
    const kn = normalizeText(keyword)
    // Use whole-word matching
    const re = new RegExp(`\\b${kn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (re.test(text)) count++
  }
  for (const alias of genre.aliases) {
    const an = normalizeText(alias)
    const re = new RegExp(`\\b${an.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (re.test(text)) count++
  }
  return count
}

export const genreEnricher: Enricher = {
  name: 'GENRE',
  async enrich(event: CanonicalEvent, ctx: PipelineContext): Promise<EnricherResult> {
    const { registries, classifierFn } = ctx

    const venueRecord  = event.venue_id ? registries.venues.get(event.venue_id) : null
    const venueGenres  = venueRecord?.genres ?? []
    const combinedText = buildCombinedText(event, venueGenres)

    let bestGenre: GenreRecord | null = null
    let bestScore = 0

    for (const genre of registries.genres.values()) {
      const score = scoreGenre(genre, combinedText)
      if (score > bestScore || (score === bestScore && score > 0 && genre.weight < (bestGenre?.weight ?? Infinity))) {
        bestScore = score
        bestGenre = genre
      }
    }

    // No keyword match — try AI classifier if provided
    if (!bestGenre && classifierFn) {
      const inputText = [event.title, event.description ?? ''].join(' ').slice(0, 500)
      try {
        const result = await classifierFn(inputText)
        return { genre: result.genre || null, subgenre: result.subgenre || null }
      } catch {
        return { genre: null, subgenre: null }
      }
    }

    // No match at all — fall back to venue genres
    if (!bestGenre && venueGenres.length > 0) {
      const fallbackKey = normalizeText(venueGenres[0])
      for (const genre of registries.genres.values()) {
        if (normalizeText(genre.label) === fallbackKey || genre.aliases.some(a => normalizeText(a) === fallbackKey)) {
          bestGenre = genre
          break
        }
      }
    }

    if (!bestGenre) return { genre: null, subgenre: null }

    // If genre has a parent, use parent as genre and this as subgenre
    if (bestGenre.parent) {
      const parentRecord = Array.from(registries.genres.values()).find(g => g.id === bestGenre!.parent)
      return {
        genre:    parentRecord?.label ?? bestGenre.parent,
        subgenre: bestGenre.label,
      }
    }

    return { genre: bestGenre.label, subgenre: null }
  },
}
```

---

## FILE: pipeline/src/pipeline/enrichers/geo.ts

```typescript
import { rateLimitedFetch } from '../../lib/http.js'
import { normalizeText } from '../../lib/text.js'
import type { Enricher, EnricherResult, PipelineContext } from '../../types/enricher.js'
import type { CanonicalEvent } from '../../types/canonical.js'
import type { StorageAdapter } from '../../types/storage.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const UA = process.env.NOMINATIM_USER_AGENT ?? 'UnderGhent-Pipeline/2.0 (contact@underghent.be)'

// Area bounding boxes [latMin, latMax, lngMin, lngMax]
const AREA_BOXES: Array<{ name: string; lat: [number, number]; lng: [number, number] }> = [
  { name: 'Dampoort',     lat: [51.055, 51.070], lng: [3.740, 3.770] },
  { name: 'Brugse Poort', lat: [51.055, 51.075], lng: [3.700, 3.730] },
  { name: 'Muide',        lat: [51.060, 51.075], lng: [3.720, 3.740] },
  { name: 'City Centre',  lat: [51.040, 51.060], lng: [3.715, 3.740] },
]

function inferArea(lat: number, lng: number): string | null {
  for (const box of AREA_BOXES) {
    if (lat >= box.lat[0] && lat <= box.lat[1] && lng >= box.lng[0] && lng <= box.lng[1]) {
      return box.name
    }
  }
  return null
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=be`
  try {
    const text = await rateLimitedFetch(url, 1100, UA)
    const results = JSON.parse(text) as NominatimResult[]
    if (!results.length) return null
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) }
  } catch {
    return null
  }
}

export function makeGeoEnricher(storage: StorageAdapter): Enricher {
  const reviewQueue: CanonicalEvent[] = []

  return {
    name: 'GEO',
    async enrich(event: CanonicalEvent, ctx: PipelineContext): Promise<EnricherResult> {
      // Already has coordinates
      if (event.latitude !== null && event.longitude !== null) {
        const area = event.area ?? inferArea(event.latitude, event.longitude)
        return { area }
      }

      // Priority 1: venue_id registry lookup
      if (event.venue_id) {
        const v = ctx.registries.venues.get(event.venue_id)
        if (v?.lat !== null && v?.lat !== undefined) {
          return {
            latitude:  v.lat,
            longitude: v.lng,
            address:   v.address ?? event.address,
            area:      v.area ?? (v.lat ? inferArea(v.lat, v.lng!) : null),
          }
        }
      }

      // Priority 2: fuzzy alias match on venue string
      if (event.venue) {
        const key = normalizeText(event.venue)
        const id  = ctx.registries.venueAlias.get(key)
        if (id) {
          const v = ctx.registries.venues.get(id)
          if (v?.lat !== null && v?.lat !== undefined) {
            return {
              venue_id:  v.id,
              latitude:  v.lat,
              longitude: v.lng,
              address:   v.address ?? event.address,
              area:      v.area ?? (v.lat ? inferArea(v.lat, v.lng!) : null),
            }
          }
        }
      }

      // Priority 3: Nominatim geocode
      const query = event.address
        ? `${event.address}, Gent, Belgium`
        : event.venue
          ? `${event.venue}, Gent, Belgium`
          : null

      if (query) {
        const coords = await nominatimGeocode(query)
        if (coords) {
          return {
            latitude:  coords.lat,
            longitude: coords.lng,
            area:      inferArea(coords.lat, coords.lng),
          }
        }
      }

      // Priority 4: push to review queue
      reviewQueue.push(event)
      await storage.appendReviewQueue([event])
      return {}
    },
  }
}
```

---

## FILE: pipeline/src/export/sheets.ts

```typescript
import { readFileSync, existsSync } from 'fs'
import type { CanonicalEvent } from '../types/canonical.js'

export interface SheetsConfig {
  credentialsPath: string
  spreadsheetId:   string
  worksheetName:   string
}

const HEADERS = [
  'event_id', 'facebook_id', 'venue_id', 'aggregator_id',
  'title', 'date_start', 'hour_start',
  'venue', 'room', 'address', 'area', 'latitude', 'longitude',
  'genre', 'subgenre', 'artists', 'underground_score',
  'source_url', 'ticket_url', 'price', 'details', 'description',
  'interested', 'going', 'city', 'country',
  'organizers', 'social_links', 'collective', 'status',
]

function flatten(event: CanonicalEvent): string[] {
  const n = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return String(v)
    return String(v)
  }
  return [
    n(event.event_id), n(event.facebook_id), n(event.venue_id), n(event.aggregator_id),
    n(event.title), n(event.date_start), n(event.hour_start),
    n(event.venue), n(event.room), n(event.address), n(event.area),
    n(event.latitude), n(event.longitude),
    n(event.genre), n(event.subgenre),
    Array.isArray(event.artists) ? event.artists.join(', ') : n(event.artists),
    n(event.underground_score),
    n(event.source_url), n(event.ticket_url), n(event.price),
    n(event.details), n(event.description),
    n(event.interested), n(event.going),
    n(event.city), n(event.country),
    Array.isArray(event.organizers) ? event.organizers.join(', ') : n(event.organizers),
    Array.isArray(event.social_links) ? event.social_links.join('\n') : n(event.social_links),
    n(event.collective), n(event.status),
  ]
}

function isGeoMissing(event: CanonicalEvent): boolean {
  const empty = (v: unknown) =>
    v === null || v === undefined || v === '' || v === 0 || v === '0'
  return empty(event.latitude) || empty(event.longitude)
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 429 && attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

async function ensureSheetExists(
  sheets: Awaited<ReturnType<typeof import('googleapis')['google']['sheets']>>,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === sheetTitle)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
    })
  }
}

async function appendRows(
  sheets: Awaited<ReturnType<typeof import('googleapis')['google']['sheets']>>,
  spreadsheetId: string,
  worksheetName: string,
  rows: string[][],
  headers: string[],
): Promise<void> {
  const check = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!A1`,
  })
  const hasHeader = check.data.values && check.data.values.length > 0
  const allRows = hasHeader ? rows : [headers, ...rows]
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${worksheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: allRows },
    })
  )
}

export async function exportSheets(
  events: CanonicalEvent[],
  config: SheetsConfig,
): Promise<number> {
  if (!existsSync(config.credentialsPath)) {
    throw new Error(`Google Sheets credentials not found at ${config.credentialsPath}`)
  }

  const { google } = await import('googleapis')
  const creds = JSON.parse(readFileSync(config.credentialsPath, 'utf-8'))
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const sheets = google.sheets({ version: 'v4', auth })

  const geoOk   = events.filter(e => !isGeoMissing(e))
  const geoFail = events.filter(isGeoMissing)

  console.log(`→ ${geoOk.length} with coords → "${config.worksheetName}"`)
  console.log(`→ ${geoFail.length} missing coords → "GeoFail"`)

  // Events tab: only events WITH coords
  await appendRows(sheets, config.spreadsheetId, config.worksheetName, geoOk.map(flatten), HEADERS)
  console.log(`✓ Wrote ${geoOk.length} to "${config.worksheetName}"`)

  // GeoFail tab: only events WITHOUT coords
  if (geoFail.length > 0) {
    await ensureSheetExists(sheets, config.spreadsheetId, 'GeoFail')
    await appendRows(sheets, config.spreadsheetId, 'GeoFail', geoFail.map(flatten), HEADERS)
    console.log(`✓ Wrote ${geoFail.length} to "GeoFail"`)
  }

  return events.length
}
```

---

## FILE: pipeline/src/scrapers/base.ts

```typescript
import * as cheerio from 'cheerio'
import { log, logError } from '../lib/logger.js'
import type { ScraperResult } from '../types/enricher.js'

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
}

export function parseCheerio(html: string): cheerio.CheerioAPI {
  return cheerio.load(html)
}

export function makeScraperResult<T>(source: string, events: T[]): ScraperResult<T> {
  return { source, events }
}

export async function safeRun<T>(
  fn: () => Promise<ScraperResult<T>>,
  source: string,
): Promise<ScraperResult<T>> {
  try {
    return await fn()
  } catch (err) {
    logError(source, err)
    return { source, events: [] }
  }
}
```

---

## FILE: pipeline/src/scrapers/aggregators/beldub.ts

```typescript
import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawBeldubEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'beldub'

const BASE_URL   = 'https://beldub.be'
const AGENDA_URL = `${BASE_URL}/`

async function scrapeList(): Promise<ScraperResult<RawBeldubEvent>> {
  const html   = await fetchHtml(AGENDA_URL)
  const $      = parseCheerio(html)
  const events: RawBeldubEvent[] = []
  const now    = new Date().toISOString()

  // Elementor loop items for events: .e-loop-item.event
  $('.e-loop-item.event, [class*="e-loop-item"][class*="event"]').each((_i, item) => {
    const el = $(item)

    const title = el.find('h3.elementor-heading-title, h2.elementor-heading-title').first().text().trim()
    if (!title) return

    // Source URL is the wrapping <a> href (Facebook event link)
    const wrapLink = el.find('a[href]').first()
    const source_url = wrapLink.attr('href') ?? null

    // Text-editor divs: first = venue, second = date (DD/MM/YYYY)
    const textDivs = el.find('.elementor-widget-text-editor').toArray()
    const venueName = textDivs.length > 0 ? $(textDivs[0]).text().trim() : null
    const dateRaw   = textDivs.length > 1 ? $(textDivs[1]).text().trim() : ''

    const date_start = parseNlDate(dateRaw)
    if (!date_start) return

    events.push({
      _source:     'beldub',
      _scraped_at: now,
      event_id:    source_url ?? `beldub-${title}-${date_start}`,
      title,
      date_start,
      source_url,
      hour_start:  parseTime(dateRaw),
      venue_name:  venueName || null,
      city:        null,
      genre_raw:   null,
      description: null,
      ticket_url:  null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawBeldubEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
```

---

## FILE: pipeline/src/scrapers/aggregators/goabase.ts

```typescript
import { fetchHtml } from '../../lib/http.js'
import { parseNlDate, parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawGoabaseEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'goabase'

const BASE_URL = 'https://www.goabase.net'
const LIST_URL = `${BASE_URL}/party/list/?country=be&n=100`

async function scrapeDetailPage(url: string): Promise<Partial<RawGoabaseEvent>> {
  try {
    const html = await fetchHtml(url)
    const $ = parseCheerio(html)
    const description = $('.partyDesc, .party-description, [itemprop="description"]').text().trim() || null
    const artists_raw = $('.lineup, .partyLineup, .artist-list').text().trim() || null
    const ticket_url  = $('a[href*="ticket"], a[href*="tickets"]').first().attr('href') ?? null
    const price       = $('.price, .partyPrice').first().text().trim() || null
    return { description, artists_raw, ticket_url, price }
  } catch {
    return {}
  }
}

async function scrapeList(): Promise<ScraperResult<RawGoabaseEvent>> {
  const html = await fetchHtml(LIST_URL)
  const $    = parseCheerio(html)
  const events: RawGoabaseEvent[] = []
  const now  = new Date().toISOString()

  for (const el of $('article.partyElem').toArray()) {
    const $el      = $(el)
    const linkEl   = $el.find('a.lh14').first()
    const href     = linkEl.attr('href') ?? ''
    if (!href) continue

    const detailUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
    const title     = $el.find('h3').first().text().trim()
    if (!title) continue

    const idMatch  = href.match(/\/(\d+)$/)
    const event_id = idMatch ? idMatch[1] : href

    // Date/time from body text: "Sat, 23 May 2026, 22:00"
    const bodyText  = $el.text()
    const dateMatch = bodyText.match(/(\d{1,2}\s+\w+\s+\d{4}),?\s+(\d{2}:\d{2})/)
    const date_start = dateMatch ? parseNlDate(dateMatch[1]) : null
    if (!date_start) continue

    const hour_start = dateMatch ? parseTime(dateMatch[2]) : null
    const cityEl     = $el.find('a[href*="geoloc="]').first()
    const cityRaw    = cityEl.text().trim()

    // Throttle detail page fetches
    await new Promise(r => setTimeout(r, 1500))
    const detail = await scrapeDetailPage(detailUrl)

    events.push({
      _source:     'goabase',
      _scraped_at: now,
      event_id,
      title,
      date_start,
      hour_start,
      source_url:  detailUrl,
      venue_name:  null,
      city:        cityRaw || null,
      country:     'Belgium',
      genre_raw:   null,
      artists_raw: detail.artists_raw ?? null,
      description: detail.description ?? null,
      ticket_url:  detail.ticket_url ?? null,
      price:       detail.price ?? null,
      organizer:   null,
    })
  }

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawGoabaseEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
```

---

## FILE: pipeline/src/scrapers/aggregators/reggaebe.ts

```typescript
import { fetchHtml } from '../../lib/http.js'
import { parseTime } from '../../lib/date.js'
import { parseCheerio, makeScraperResult, safeRun } from '../base.js'
import type { RawReggaebeEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'reggaebe'

const BASE_URL    = 'https://www.reggae.be'
const API_URL     = 'https://reggae-be-kangafarm-0.kangacoders.com/events?uid=1779182994_calendar_index&identifier=calendar_index&locale=NL'

const NL_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mrt: 3, mar: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
}

function inferYear(day: number, monthNum: number): number {
  const today = new Date()
  const thisYear = today.getFullYear()
  const d = new Date(thisYear, monthNum - 1, day)
  // If the date is more than 30 days in the past, it's next year
  return d.getTime() < today.getTime() - 30 * 86400000 ? thisYear + 1 : thisYear
}

async function scrapeList(): Promise<ScraperResult<RawReggaebeEvent>> {
  // API returns a JS call with escaped HTML embedded in the string
  const jsText = await fetchHtml(API_URL)

  // Extract the HTML content from replaceWith('...')
  const start = jsText.indexOf("replaceWith('") + "replaceWith('".length
  const end   = jsText.lastIndexOf("')")
  if (start <= 0 || end <= start) return makeScraperResult(SOURCE_ID, [])

  // Unescape JS string: \" → ", \/ → /, \n → newline, \' → '
  const innerHtml = jsText.slice(start, end)
    .replace(/\\'/g, "'")
    .replace(/\\/g, c => c === '\\' ? '' : c)
    .replace(/\\/g, '')

  // Fall back to a simpler unescape approach via JSON
  let html = ''
  try {
    // Wrap in double quotes, escape internal " and ' → JSON.parse handles \n, \t, etc.
    const jsonStr = '"' + jsText.slice(start, end)
      .replace(/\\'/g, "'")
      .replace(/"/g, '\\"')
      .replace(/\\"/g, '"')  // undo double escaping
      + '"'
    html = JSON.parse(jsonStr) as string
  } catch {
    html = innerHtml
  }

  const $      = parseCheerio(html)
  const events: RawReggaebeEvent[] = []
  const now    = new Date().toISOString()

  $('li.mix.agenda_event').each((_i, el) => {
    const $el = $(el)

    const titleEl = $el.find('h4 a').first()
    const title   = titleEl.text().trim()
    if (!title) return

    const href       = titleEl.attr('href') ?? ''
    const source_url = href ? (href.startsWith('http') ? href : `${BASE_URL}${href}`) : null

    const dayStr   = $el.find('.homeagendaDay').first().text().trim()
    const monthStr = $el.find('.homeagendaYear').first().text().trim().toLowerCase().slice(0, 3)
    const day      = parseInt(dayStr, 10)
    const monthNum = NL_MONTHS[monthStr] ?? 0
    if (!day || !monthNum) return

    const year       = inferYear(day, monthNum)
    const date_start = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const venue_name = $el.find('.homeagendaVenu').first().text().trim() || null
    const city       = $el.find('.homeagendaGemeente').first().text().trim() || null
    const genre_raw  = $el.find('#homeagendacats li').map((_j, li) => $(li).text().trim()).toArray().join(', ') || null

    const idMatch  = href.match(/id=(\d+)/)
    const event_id = idMatch ? idMatch[1] : source_url ?? `reggaebe-${title}-${date_start}`

    events.push({
      _source:     'reggaebe',
      _scraped_at: now,
      event_id,
      title,
      date_start,
      source_url,
      hour_start:  parseTime($el.text()),
      venue_name,
      city:        city ?? 'Belgium',
      artists_raw: null,
      description: null,
      price:       $el.find('.homeagendaPrijs').first().text().trim() || null,
    })
  })

  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawReggaebeEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
```
