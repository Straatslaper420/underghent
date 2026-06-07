import type { CanonicalEvent } from './canonical.js'

export interface StorageAdapter {
  readCanonical(): Promise<CanonicalEvent[]>
  writeCanonical(events: CanonicalEvent[]): Promise<void>
  readRaw<T>(source: string): Promise<T[]>
  writeRaw<T>(source: string, events: T[]): Promise<void>
  readReviewQueue(): Promise<CanonicalEvent[]>
  appendReviewQueue(events: CanonicalEvent[]): Promise<void>
}
