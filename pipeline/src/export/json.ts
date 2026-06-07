import { writeFileSync, renameSync } from 'fs'
import type { CanonicalEvent } from '../types/canonical.js'
import type { StorageAdapter } from '../types/storage.js'

function sortEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  return [...events].sort((a, b) => {
    const dateCmp = a.date_start.localeCompare(b.date_start)
    if (dateCmp !== 0) return dateCmp
    // Nulls last for hour_start
    if (a.hour_start === null && b.hour_start === null) return 0
    if (a.hour_start === null) return 1
    if (b.hour_start === null) return -1
    return a.hour_start.localeCompare(b.hour_start)
  })
}

export async function exportJson(storage: StorageAdapter, outputPath: string): Promise<number> {
  const all    = await storage.readCanonical()
  const active = all.filter(e => e.status !== 'duplicate')
  const sorted = sortEvents(active)

  const tmp = outputPath + '.tmp'
  writeFileSync(tmp, JSON.stringify(sorted, null, 2), 'utf-8')
  renameSync(tmp, outputPath)

  return sorted.length
}
