import type { CanonicalEvent } from './canonical.js'
import type { Registries } from './registry.js'

export type EnricherResult = Partial<CanonicalEvent>

export interface PipelineContext {
  registries:     Registries
  dataDir:        string
}

export interface Enricher {
  name: string
  enrich(event: CanonicalEvent, ctx: PipelineContext): Promise<EnricherResult>
}

export interface ScraperResult<T> {
  source: string
  events: T[]
}
