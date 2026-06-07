export function log(tag: string, message: string): void {
  console.log(`[${tag.toUpperCase()}] ${message}`)
}

export function logError(tag: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[${tag.toUpperCase()}] ERROR: ${msg}`)
}
