// HTTP helpers: custom UA, retry on 429/5xx, polite delay.

const UA = 'UnderGhent-fiestenpipeline/1.0 (https://underghent.be; contact: info@underghent.be)'

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export async function fetchHtml(url: string, attempt = 0): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':      UA,
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8',
    },
  })

  if (!res.ok) {
    if (RETRY_STATUSES.has(res.status) && attempt < 4) {
      const wait = 1000 * Math.pow(2, attempt) + Math.random() * 500
      console.warn(`  [http] ${res.status} for ${url} — retrying in ${Math.round(wait)}ms`)
      await sleep(wait)
      return fetchHtml(url, attempt + 1)
    }
    throw new Error(`HTTP ${res.status} for ${url}`)
  }

  return res.text()
}

/** Polite delay between requests — call after each fetchHtml. */
export async function politeDelay(ms = 350): Promise<void> {
  await sleep(ms + Math.random() * 150)
}

/**
 * Map an array concurrently with at most `concurrency` in-flight at once.
 * Items are processed in order; results array preserves input order.
 */
export async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}
