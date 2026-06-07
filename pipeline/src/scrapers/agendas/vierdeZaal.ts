import { makeScraperResult, safeRun } from '../base.js'
import { scrapeIcalDirect } from './_ical.js'
import type { RawAgendaEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'vierdeZaal'

// Google Calendar ID from embed URL on https://vierdezaal.gent/
const CALENDAR_ID = 'd5153e129d0328ff0cf68610104aed59dd526bfafcab6bb276425a37cd755d4d@group.calendar.google.com'

async function scrapeList(): Promise<ScraperResult<RawAgendaEvent>> {
  const today  = new Date().toISOString().slice(0, 10)
  const events = await scrapeIcalDirect(CALENDAR_ID, 'vierdeZaal', 'Vierde Zaal', 'vierdeZaal', { minDate: today })
  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawAgendaEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
