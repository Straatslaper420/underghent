import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import type { StorageAdapter } from '../../types/storage.js'
import type { CanonicalEvent } from '../../types/canonical.js'

export class JsonStorageAdapter implements StorageAdapter {
  private dataDir: string

  constructor(dataDir: string) {
    this.dataDir = dataDir
    mkdirSync(join(dataDir, 'raw'), { recursive: true })
  }

  private atomicWrite(path: string, data: unknown): void {
    const tmp = path + '.tmp'
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmp, path)
  }

  private readJson<T>(path: string): T | null {
    if (!existsSync(path)) return null
    const text = readFileSync(path, 'utf-8')
    if (text.trim() === '') return null
    return JSON.parse(text) as T
  }

  async readCanonical(): Promise<CanonicalEvent[]> {
    return this.readJson<CanonicalEvent[]>(join(this.dataDir, 'canonical.json')) ?? []
  }

  async writeCanonical(events: CanonicalEvent[]): Promise<void> {
    this.atomicWrite(join(this.dataDir, 'canonical.json'), events)
  }

  async readRaw<T>(source: string): Promise<T[]> {
    return this.readJson<T[]>(join(this.dataDir, 'raw', `${source}.json`)) ?? []
  }

  async writeRaw<T>(source: string, events: T[]): Promise<void> {
    this.atomicWrite(join(this.dataDir, 'raw', `${source}.json`), events)
  }

  async readReviewQueue(): Promise<CanonicalEvent[]> {
    return this.readJson<CanonicalEvent[]>(join(this.dataDir, 'review-queue.json')) ?? []
  }

  async appendReviewQueue(events: CanonicalEvent[]): Promise<void> {
    const existing = await this.readReviewQueue()
    const existingIds = new Set(existing.map(e => e.event_id))
    const newEvents = events.filter(e => !existingIds.has(e.event_id))
    this.atomicWrite(join(this.dataDir, 'review-queue.json'), [...existing, ...newEvents])
  }
}
