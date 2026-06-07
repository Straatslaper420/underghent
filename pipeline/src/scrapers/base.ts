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
