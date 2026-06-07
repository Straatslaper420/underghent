// Generates a two-level genre taxonomy from musicmap master-genrelist.json.
// Produces:  pipeline/data/genres.generated.json  (STAGING — does NOT overwrite config)
//            pipeline/data/genres-report.md         (human report)
// Run:  node pipeline/scripts/gen-genres.mjs
//
// KEYWORD DERIVATION RULES (no word-level fragment splitting):
//   R1 names without &// → one whole-phrase keyword (never split on spaces)
//   R2 split ONLY on `&` and `/`; each segment kept as its whole phrase
//   R3 drop ALL parentheticals entirely (no alias emission)
//   R4 drop bare SINGLE-word keywords in DENY (subgenres only)
//   R5 non-underground subgenres: full-name keyword only (falls out of R1–R4)
//   R6 super-genres are EXEMPT from the DENY drop (keep catch-all short token)
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')                       // pipeline/
const raw  = JSON.parse(readFileSync(resolve(ROOT, 'data/musicmap-raw.json'), 'utf-8'))

const SUPER = ['inl','met','rnr','gld','pwv','hcp','alt','con','pop','cou','rnb','gos','blu','jaz','jam','rap','brb','dnb','hct','tec','hou','tra','dtp']

// Weight tiers (HIGHER = preferred on ties; unchanged)
const HIGH = 3, NORMAL = 2, LOW = 1
const WEIGHT = {
  tec:HIGH, hou:HIGH, tra:HIGH, dnb:HIGH, brb:HIGH, hct:HIGH, dtp:HIGH, jam:HIGH, rap:HIGH, inl:HIGH,
  met:NORMAL, pwv:NORMAL, hcp:NORMAL, alt:NORMAL, pop:NORMAL, rnb:NORMAL, jaz:NORMAL,
  rnr:LOW, gld:LOW, con:LOW, cou:LOW, blu:LOW, gos:LOW,
}

// Matcher-time backstop (unchanged): dangerous bare tokens that never match alone.
const STOPWORDS = ['dub','trap','electro','core','rave','wave','bass','edm','raw','go','acid','tek']

// R4 denylist: bare single-word keywords to DROP from SUBGENRES (supers exempt via R6).
const DENY = new Set([
  'rock','pop','beat','revival','early','instrumental','soul','funk','disco','blues','jazz',
  'country','metal','punk','indie','wave','house','techno','trance','dub','electro','core','rave',
  'bass','edm','raw','go','acid','tek','grime','garage','hardcore','ambient','breaks','swing',
  'gospel','ska','reggae','jungle','snap','crunk','bounce','twee','motown','juke','wonky',
  'emo','screamo',
  // NOTE: 'schranz' intentionally NOT denylisted — unambiguously techno; tec04 needs it (per review).
])

// Subgenres whose name is malformed by parens-in-word → drop ALL auto keywords, rely on curated.
const DROP_AUTO = new Set(['tec02']) // (Free)tek(k)no / Hardtek

// Curated, approved keywords (bypass the DENY denylist).
const CURATED_KEYWORDS = {
  // super-genre level
  dnb:   ['dnb','d&b','drum and bass'],
  rnb:   ['rnb','r&b'],
  tec:   ['acid techno','dub techno','psychedelic techno','trance techno'],
  // subgenre level
  tec08: ['hard techno'],                                   // Hardtechno (Schranz II)
  dnb08: ['dubstep'],                                       // also from name
  // restored no-keyword records (approved): name-word was dropped by denylist/paren rules
  jam02: ['ska'],                                           // Ska
  jam04: ['roots reggae'],                                  // (Roots) Reggae
  rnb07: ['disco'],                                         // Disco
  rnb08: ['go-go','bounce beat'],                           // Go-Go (& Bounce Beat)
  tec02: ['freetekno','free tekno','tekno','hardtek'],      // (Free)tek(k)no / Hardtek
}
// Curated, approved aliases (bypass DENY).
const CURATED_ALIASES = {
  jam05: ['dub reggae','dub soundsystem','dub sound system','steppers','king tubby','roots dub',
          'stepping','steppa','kingstep','dub circus','rockers'], // DUB
}

// ---------- helpers ----------
function clean(html) {
  return (html || '')
    .replace(/&amp;?/g, '&')
    .replace(/&eacute;/gi, 'e')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const ACR = {
  ebm:'EBM', nrg:'NRG', 'hi-nrg':'Hi-NRG', idm:'IDM', aor:'AOR', 'a.o.r.':'A.O.R.',
  ac:'AC', 'a.c.':'A.C.', ccm:'CCM', vgm:'VGM', nwobhm:'NWOBHM', nwoahm:'NWOAHM',
  uk:'UK', us:'US', og:'OG', rnb:'RnB', dnb:'DnB', 'r&b':'R&B', 'd&b':'D&B',
  'r&r':"R'n'R", 'p-funk':'P-Funk', 'go-go':'Go-Go', psy:'Psy', "'n'":"'n'", "'n":"'n",
}
function cap(token) {
  const lw = token.toLowerCase()
  if (ACR[lw]) return ACR[lw]
  return lw.replace(/[a-z]/, c => c.toUpperCase())
}
function titleCase(s) {
  return s.split(/\s+/).map(w => {
    const lw = w.toLowerCase()
    if (ACR[lw]) return ACR[lw]
    return w.split('-').map(cap).join('-')
  }).join(' ')
}
// pipeline normalizeText (mirror of src/lib/text.ts)
function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    .replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim()
}
// paren-in-word / paren-starting-with-& edge case (report only; tec02 also dropped)
function isParenEdge(cleanName) {
  return /\w\(|\)\w/.test(cleanName) || /\(\s*&/.test(cleanName)
}
// R1–R4: derive keywords from a clean display name
function deriveKeywords(cleanName, isSuper) {
  const noParens = cleanName.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()  // R3
  const segs = noParens.split(/\s*[&/]\s*/).map(x => x.trim()).filter(Boolean)        // R2
  const out = []
  for (const seg of segs) {
    const n = norm(seg)
    if (!n) continue
    const toks = n.split(' ')
    if (toks.every(t => t.length <= 2)) continue                                       // junk acronym/fragment (e.g. "a o r", "b ii")
    const single = toks.length === 1
    if (!isSuper && single && DENY.has(n)) continue                                    // R4 (R6: supers exempt)
    out.push(n)
  }
  return [...new Set(out)]
}
function finalize(...lists) {
  const out = new Set()
  for (const list of lists) for (const k of list) { const n = norm(k); if (n) out.add(n) }
  return [...out]
}

// ---------- parse ----------
const listedIn = {}        // data_code -> [supergenres listing it]
const subName  = {}        // data_code -> clean subgenre display name
for (const sc of SUPER) {
  for (const s of (raw[sc].genrelist || [])) {
    const mm = s.match(/data-code='([^']+)'>([^<]*)<\/a>/)
    if (!mm) continue
    const code = mm[1]
    ;(listedIn[code] = listedIn[code] || []).push(sc)
    if (!subName[code]) subName[code] = clean(mm[2])
  }
}

const records = []
const parenEdges = []      // [{id,label,name}]
// super-genre records
for (const sc of SUPER) {
  const cn = clean(raw[sc].name)
  if (isParenEdge(cn)) parenEdges.push({ id: sc, label: titleCase(cn), name: cn })
  const auto = deriveKeywords(cn, true)
  records.push({
    id: sc, label: titleCase(cn), parent: null,
    keywords: finalize(auto, CURATED_KEYWORDS[sc] || []),
    weight: WEIGHT[sc],
    aliases: finalize(CURATED_ALIASES[sc] || []),
    _code: sc, _super: true, _curated: [...(CURATED_KEYWORDS[sc]||[]), ...(CURATED_ALIASES[sc]||[])],
  })
}
// subgenre records (one per distinct data_code; parent = prefix)
const allCodes = Object.keys(listedIn).sort()
for (const code of allCodes) {
  const parent = code.slice(0, 3)
  if (!SUPER.includes(parent)) continue
  const cn = subName[code]
  if (isParenEdge(cn)) parenEdges.push({ id: code, label: titleCase(cn), name: cn })
  const auto = DROP_AUTO.has(code) ? [] : deriveKeywords(cn, false)
  const hybrids = listedIn[code].filter(s => s !== parent)
  records.push({
    id: code, label: titleCase(cn), parent,
    keywords: finalize(auto, CURATED_KEYWORDS[code] || []),
    weight: WEIGHT[parent],
    aliases: finalize(CURATED_ALIASES[code] || []),
    _code: code, _super: false, _hybrids: hybrids,
    _curated: [...(CURATED_KEYWORDS[code]||[]), ...(CURATED_ALIASES[code]||[])],
  })
}

// ---------- counts (before/after) ----------
function kwCount(genres) { return genres.reduce((a, g) => a + (g.keywords?.length||0) + (g.aliases?.length||0), 0) }
let beforeCount = null
try { beforeCount = kwCount(JSON.parse(readFileSync(resolve(ROOT, 'config/genres.json'), 'utf-8')).genres) } catch {}
const afterCount = kwCount(records)

// ---------- write staging genres.json ----------
const outGenres = records.map(r => ({
  id: r.id, label: r.label, parent: r.parent,
  keywords: r.keywords, weight: r.weight, aliases: r.aliases,
}))
writeFileSync(resolve(ROOT, 'data/genres.generated.json'), JSON.stringify({ stopwords: STOPWORDS, genres: outGenres }, null, 2))

// ---------- matcher simulation (mirrors genre.ts) ----------
const STOP = new Set(STOPWORDS.map(norm))
function buildText(ev) {
  return norm([ev.title, ev.description, ev.details, (ev.artists||[]).join(' '), ev.collective].filter(Boolean).join(' '))
}
function matchEvent(ev) {
  const text = buildText(ev)
  let best = null, bestLen = 0, bestWeight = -Infinity
  for (const r of records) {
    let recLen = 0
    for (const n of [...r.keywords, ...r.aliases]) {
      if (!n) continue
      const single = !n.includes(' ')
      if (single && STOP.has(n)) continue
      const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`)
      if (re.test(text)) { const w = n.split(' ').length; if (w > recLen) recLen = w }
    }
    if (recLen === 0) continue
    if (recLen > bestLen || (recLen === bestLen && r.weight > bestWeight)) { best = r; bestLen = recLen; bestWeight = r.weight }
  }
  if (!best) return { genre: null, subgenre: null, via: null }
  if (best.parent) { const p = records.find(x => x.id === best.parent); return { genre: p?.label ?? best.parent, subgenre: best.label, via: best.id } }
  return { genre: best.label, subgenre: null, via: best.id }
}
const TESTS = ['Warehouse Rave w/ Surgeon','Acid Techno All Nighter','Dub Reggae Soundsystem',
  'Liquid DnB & Jungle','Technology Conference afterparty','Schranz / Hardgroove','Trap & Drill','Krautrock live set']

// ---------- forbidden-token & gabber verification ----------
const FORBIDDEN = ['rock','pop','beat','revival','early','instrumental','b ii','nu r','b i','a c','a o r']
const forbiddenHits = []
for (const r of records) for (const k of [...r.keywords, ...r.aliases]) if (FORBIDDEN.includes(k)) forbiddenHits.push(`${k} on ${r.id}`)
const gabberOn = records.filter(r => [...r.keywords, ...r.aliases].includes('gabber')).map(r => r.id)

// ---------- build report ----------
const L = []
L.push('# Generated genre taxonomy report\n')
L.push(`Source: musicmap.info/master-genrelist.json\n`)
L.push(`Super-genres: ${SUPER.length}   Subgenres: ${allCodes.length}   Total records: ${records.length}`)
L.push(`Keyword+alias count: BEFORE ${beforeCount ?? 'n/a'} → AFTER ${afterCount}\n`)

L.push('## Verification checks\n')
L.push(`- Forbidden tokens (${FORBIDDEN.join(', ')}): ${forbiddenHits.length ? '❌ '+forbiddenHits.join('; ') : '✅ none present'}`)
L.push(`- "gabber" appears on: ${gabberOn.join(', ') || 'none'}  (expected: hct04 only)`)
L.push('')

L.push('## Paren-in-word / malformed-paren edge cases (review)\n')
for (const p of parenEdges) {
  const r = records.find(x => x.id === p.id)
  const note = DROP_AUTO.has(p.id) ? ' — auto keywords DROPPED (relies on curated)' : ''
  L.push(`- ${p.id} "${p.name}" → keywords: ${[...r.keywords, ...r.aliases].join(', ') || '⚠ none'}${note}`)
}
L.push('')

L.push('## Super-genres → subgenres (FINAL keywords)\n')
for (const sc of SUPER) {
  const sup = records.find(r => r.id === sc)
  const subs = records.filter(r => r.parent === sc)
  L.push(`### ${sc} — ${sup.label}  (w${sup.weight})  [${subs.length} subs]`)
  L.push(`- keywords: ${[...sup.keywords, ...sup.aliases].join(', ') || '⚠ none'}`)
  for (const s of subs) {
    const hyb = s._hybrids?.length ? `  hybrids:[${s._hybrids.join(',')}]` : ''
    const cur = s._curated?.length ? `  (curated)` : ''
    const kw  = [...s.keywords, ...s.aliases].join(', ') || '⚠ NO KEYWORDS'
    L.push(`  - ${s.id} ${s.label}${hyb} → ${kw}${cur}`)
  }
  L.push('')
}

const noKw = records.filter(r => r.keywords.length === 0 && r.aliases.length === 0)
L.push('## Records with NO keywords (decide case by case)\n')
L.push(noKw.length ? noKw.map(r => `- ${r.id} ${r.label}  (parent ${r.parent ?? '—'})`).join('\n') : '_none_')
L.push('')

L.push('## Curated additions (approved)\n')
for (const [k,v] of Object.entries(CURATED_KEYWORDS)) L.push(`- keywords[${k}]: ${v.join(', ')}`)
for (const [k,v] of Object.entries(CURATED_ALIASES)) L.push(`- aliases[${k}]: ${v.join(', ')}`)
L.push('')

L.push('## Test-case results (simulated)\n')
for (const t of TESTS) { const r = matchEvent({ title: t, artists: [] }); L.push(`- "${t}" → genre=${r.genre ?? 'null'}, subgenre=${r.subgenre ?? 'null'}${r.via?'  [via '+r.via+']':''}`) }
L.push('')

writeFileSync(resolve(ROOT, 'data/genres-report.md'), L.join('\n'))

// ---------- console summary ----------
console.log(`Records: ${records.length}  |  keyword+alias count: ${beforeCount ?? 'n/a'} -> ${afterCount}`)
console.log('Forbidden tokens:', forbiddenHits.length ? forbiddenHits.join('; ') : 'none ✅')
console.log('gabber on:', gabberOn.join(', ') || 'none', '(expect hct04)')
console.log('No-keyword records:', noKw.map(r=>r.id+' '+r.label).join(', ') || 'none')
console.log('\nTEST CASES:')
for (const t of TESTS) { const r = matchEvent({ title: t, artists: [] }); console.log(`  "${t}" -> ${r.genre ?? 'null'} / ${r.subgenre ?? 'null'}${r.via?' [via '+r.via+']':''}`) }
console.log('\nWrote data/genres.generated.json and data/genres-report.md')
