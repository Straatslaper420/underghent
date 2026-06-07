const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
  throw new Error('unreachable')
}

export async function fetchHtml(url: string, userAgent?: string): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': userAgent ?? DEFAULT_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return res.text()
  })
}

export async function fetchJson<T = unknown>(url: string, userAgent?: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': userAgent ?? DEFAULT_UA,
        'Accept': 'application/json',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return res.json() as Promise<T>
  })
}

// Simple token-bucket rate limiter for Nominatim (1 req/sec per domain)
const domainLastCall = new Map<string, number>()

export async function rateLimitedFetch(url: string, minIntervalMs: number, userAgent?: string): Promise<string> {
  const domain = new URL(url).hostname
  const last = domainLastCall.get(domain) ?? 0
  const wait = Math.max(0, last + minIntervalMs - Date.now())
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  domainLastCall.set(domain, Date.now())
  return fetchHtml(url, userAgent)
}
