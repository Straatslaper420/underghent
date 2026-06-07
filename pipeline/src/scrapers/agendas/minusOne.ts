import { makeScraperResult, safeRun } from '../base.js'
import { scrapeIcalDirect } from './_ical.js'
import type { RawAgendaEvent } from '../../types/raw.js'
import type { ScraperResult } from '../../types/enricher.js'

export const SOURCE_ID = 'minusOne'

// Google Calendar ID from embed URL provided by Minus One
const CALENDAR_ID = '8p47bbnur4iug5vo8bqtepqphk@group.calendar.google.com'

async function scrapeList(): Promise<ScraperResult<RawAgendaEvent>> {
  const today  = new Date().toISOString().slice(0, 10)
  const events = await scrapeIcalDirect(CALENDAR_ID, 'minusone', 'Minus One', 'minusOne', { minDate: today })
  return makeScraperResult(SOURCE_ID, events)
}

export async function scrape(): Promise<ScraperResult<RawAgendaEvent>> {
  return safeRun(scrapeList, SOURCE_ID)
}
