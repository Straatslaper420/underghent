// Crawl the Gentse Feesten 2026 day listings and collect unique detail URLs.
//
// Day listings:   https://gentsefeesten.stad.gent/nl/day/{day}/time
//                 ...?page=1, ?page=2, … (Drupal pager, 0-indexed)
// Detail links:   /nl/day/{day}/{slug}-{nodeid}
//
// The SAME event (node id) appears on every day it runs, so we record the set
// of days per node id — detail.ts turns that into dateStart / endDateStart.

import * as cheerio from 'cheerio'
import { fetchHtml, politeDelay } from './http.js'
import { BASE } from './detail.js'

export const DAYS = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26] // July 2026

export interface NodeRef {
  nodeId: string
  detailUrl: string
  days: Set<number>
}

const DETAIL_RE = /^\/nl\/day\/\d+\/.+-(\d+)$/

// Extract (nodeId, absoluteUrl) pairs for every event link on a listing page.
function extractLinks(html: string): Array<{ nodeId: string; url: string }> {
  const $ = cheerio.load(html)
  const out: Array<{ nodeId: string; url: string }> = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const path = href.split('?')[0].split('#')[0]
    const m = path.match(DETAIL_RE)
    if (m) out.push({ nodeId: m[1], url: new URL(path, BASE).toString() })
  })
  return out
}

// Page through one day until a page yields zero (new-or-old) event links.
async function crawlDay(day: number, nodes: Map<string, NodeRef>): Promise<number> {
  let found = 0
  for (let page = 0; ; page++) {
    const url =
      page === 0
        ? `${BASE}/nl/day/${day}/time`
        : `${BASE}/nl/day/${day}/time?page=${page}`
    const html = await fetchHtml(url)
    await politeDelay()

    const links = extractLinks(html)
    if (links.length === 0) break

    for (const { nodeId, url: detailUrl } of links) {
      const existing = nodes.get(nodeId)
      if (existing) {
        existing.days.add(day)
      } else {
        nodes.set(nodeId, { nodeId, detailUrl, days: new Set([day]) })
      }
      found++
    }
    // Defensive: Drupal pagers loop back to page 0 past the last page. Stop if a
    // page repeats the exact first link of page 0 — but the zero-length check
    // above is the normal terminator. Cap pages to avoid runaway loops.
    if (page > 50) break
  }
  return found
}

// Crawl all days, returning the deduped node map.
export async function scrapeListings(): Promise<Map<string, NodeRef>> {
  const nodes = new Map<string, NodeRef>()
  for (const day of DAYS) {
    const before = nodes.size
    const found = await crawlDay(day, nodes)
    const added = nodes.size - before
    console.log(`  day ${day}: ${found} links (${added} new nodes, ${nodes.size} total)`)
  }
  return nodes
}
