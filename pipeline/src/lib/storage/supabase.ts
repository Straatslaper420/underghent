import type { StorageAdapter } from '../../types/storage.js'
import type { CanonicalEvent } from '../../types/canonical.js'

// Not yet implemented. Swap in for JsonStorageAdapter once a Supabase project is configured.
export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(_url: string, _key: string) {
    throw new Error('SupabaseStorageAdapter is not yet implemented')
  }

  async readCanonical(): Promise<CanonicalEvent[]> { throw new Error('Not implemented') }
  async writeCanonical(_events: CanonicalEvent[]): Promise<void> { throw new Error('Not implemented') }
  async readRaw<T>(_source: string): Promise<T[]> { throw new Error('Not implemented') }
  async writeRaw<T>(_source: string, _events: T[]): Promise<void> { throw new Error('Not implemented') }
  async readReviewQueue(): Promise<CanonicalEvent[]> { throw new Error('Not implemented') }
  async appendReviewQueue(_events: CanonicalEvent[]): Promise<void> { throw new Error('Not implemented') }
}
