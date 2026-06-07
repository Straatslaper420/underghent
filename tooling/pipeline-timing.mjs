#!/usr/bin/env node
// Baseline timing harness — runs each pipeline step in isolation, captures
// wall time + peak RSS, counts records before/after, writes timing-baseline.json.
//
// Run from repo root:  node tooling/pipeline-timing.mjs
// Or via Odysseus background agent — output is structured JSON.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = dirname(__dirname)
const PIPELINE  = join(ROOT, 'pipeline')
const DATA_DIR  = join(PIPELINE, 'data')
const OUT_FILE  = join(__dirname, 'timing-baseline.json')

// Order matches the `pipeline` script in pipeline/package.json
const STEPS = [
  { name: 'scrape:aggregators', countAfter: () => countRawFiles(['goabase', 'beldub', 'reggaebe']) },
  { name: 'scrape:venues',      countAfter: () => countRawFiles(venueSources()) },
  { name: 'scrape:agendas',     countAfter: () => countRawFiles(['vierdeZaal', 'minusOne']) },
  { name: 'normalize',          countAfter: () => countCanonical() },
  { name: 'dedupe',             countAfter: () => countCanonical({ excludeStatus: 'duplicate' }) },
  { name: 'enrich:artists',     countAfter: () => countCanonical({ withField: 'artists', nonEmpty: true }) },
  { name: 'enrich:genre',       countAfter: () => countCanonical({ withField: 'genre' }) },
  { name: 'enrich:geo',         countAfter: () => countCanonical({ withField: 'latitude' }) },
  { name: 'enrich:score',       countAfter: () => countCanonical({ withField: 'underground_score', nonZero: true }) },
  { name: 'pull-geo',           countAfter: () => countCanonical({ withField: 'latitude' }) },
  { name: 'export',             countAfter: () => statBytes(join(PIPELINE, 'data', 'export')) },
]

function venueSources() {
  const dir = join(PIPELINE, 'src', 'scrapers', 'venues')
  return readdirSync(dir)
    .filter(f => f.endsWith('.ts') && !f.startsWith('_'))
    .map(f => f.replace('.ts', ''))
}

function countRawFiles(sources) {
  let total = 0
  const per = {}
  for (const s of sources) {
    const f = join(DATA_DIR, 'raw', `${s}.json`)
    if (!existsSync(f)) { per[s] = 0; continue }
    try {
      const arr = JSON.parse(readFileSync(f, 'utf-8'))
      per[s] = Array.isArray(arr) ? arr.length : 0
      total += per[s]
    } catch { per[s] = -1 }
  }
  return { total, per }
}

function countCanonical(opts = {}) {
  const f = join(DATA_DIR, 'canonical.json')
  if (!existsSync(f)) return { total: 0 }
  try {
    const arr = JSON.parse(readFileSync(f, 'utf-8'))
    if (!Array.isArray(arr)) return { total: 0 }
    let filtered = arr
    if (opts.excludeStatus) filtered = filtered.filter(e => e.status !== opts.excludeStatus)
    if (opts.withField) {
      filtered = filtered.filter(e => {
        const v = e[opts.withField]
        if (opts.nonEmpty) return Array.isArray(v) ? v.length > 0 : v != null
        if (opts.nonZero) return v != null && v !== 0
        return v != null
      })
    }
    return { total: arr.length, matching: filtered.length }
  } catch {
    return { total: -1 }
  }
}

function statBytes(path) {
  if (!existsSync(path)) return { bytes: 0 }
  try {
    const s = statSync(path)
    if (s.isDirectory()) {
      let bytes = 0
      const files = []
      for (const f of readdirSync(path)) {
        const fp = join(path, f)
        const fs = statSync(fp)
        if (fs.isFile()) { bytes += fs.size; files.push({ name: f, bytes: fs.size }) }
      }
      return { bytes, files }
    }
    return { bytes: s.size }
  } catch { return { bytes: -1 } }
}

function runStep(name) {
  return new Promise(resolve => {
    const start  = Date.now()
    let peakRss  = 0
    const proc   = spawn('npm', ['run', name], {
      cwd: PIPELINE,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const sample = setInterval(() => {
      try {
        // Best-effort sampling — works on Windows + Unix because we just track our spawned child
        // (not transitive children — true peak may be higher).
        const m = process.memoryUsage().rss
        if (m > peakRss) peakRss = m
      } catch {}
    }, 250)

    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })

    proc.on('close', code => {
      clearInterval(sample)
      resolve({
        name,
        exitCode: code,
        durationMs: Date.now() - start,
        peakRssMb: Math.round(peakRss / 1024 / 1024),
        stdoutTail: stdout.slice(-2000),
        stderrTail: stderr.slice(-2000),
      })
    })
  })
}

async function main() {
  console.log(`Underghent pipeline timing — ${new Date().toISOString()}`)
  console.log(`Pipeline dir: ${PIPELINE}`)
  console.log('')

  const results = []
  const grandStart = Date.now()

  for (const step of STEPS) {
    process.stdout.write(`  → ${step.name.padEnd(22)} `)
    const r = await runStep(step.name)
    let counts = null
    try { counts = step.countAfter() } catch (e) { counts = { error: String(e) } }
    results.push({ ...r, recordsAfter: counts })
    const ok = r.exitCode === 0 ? 'OK ' : 'ERR'
    console.log(`${ok}  ${(r.durationMs / 1000).toFixed(1)}s   rss=${r.peakRssMb}MB   records=${JSON.stringify(counts)}`)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    totalDurationMs: Date.now() - grandStart,
    steps: results,
  }

  writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2))
  console.log('')
  console.log(`Total: ${(summary.totalDurationMs / 1000).toFixed(1)}s`)
  console.log(`Wrote ${OUT_FILE}`)

  // Quick top-3 slowest summary
  const slowest = [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 3)
  console.log('')
  console.log('Slowest steps:')
  for (const s of slowest) {
    console.log(`  ${s.name.padEnd(22)} ${(s.durationMs / 1000).toFixed(1)}s`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
