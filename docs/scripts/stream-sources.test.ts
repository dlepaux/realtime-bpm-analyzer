// Run with `npm test`. What the site and the examples may play (RBA-245): a third-party stream ships
// only once its station's terms have been read, and never when they forbid other websites. SomaFM's
// terms (https://somafm.com/contact/tos.html, updated 2026-09-04) forbid "Embedding the Content in
// any website, application, or platform without explicit prior written permission", and say it
// "can't grant permission for third-party SomaFM clients or applications, even noncommercial ones".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STATIONS } from '../.vitepress/tools/stream-input.ts'
import { INVALID, PARAMS } from '../.vitepress/tools/analytics-events.ts'
import { gateEvent } from '../.vitepress/tools/analytics-gate.ts'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const thisFile = fileURLToPath(import.meta.url)

// Hosts whose terms forbid playing their streams on another website. A host matches itself and
// its subdomains (ice1.somafm.com).
const FORBIDDEN_HOSTS = ['somafm.com']

// The ids the SomaFM presets sent until RBA-245. A page cached before the change can still send one.
const RETIRED_STATION_IDS = ['somafm_defcon', 'somafm_groovesalad', 'somafm_beatblender']

const isForbidden = (host: string) =>
  FORBIDDEN_HOSTS.some((forbidden) => host === forbidden || host.endsWith(`.${forbidden}`))

test('STATIONS: no station whose terms forbid other websites', () => {
  for (const { url } of STATIONS) assert.equal(isForbidden(new URL(url).hostname), false, url)
})

test('STATIONS: each one records where its terms were read, and when', () => {
  const today = new Date().toISOString().slice(0, 10)
  for (const { id, terms } of STATIONS) {
    assert.match(terms.url, /^https:\/\//, id)
    assert.match(terms.read, /^\d{4}-\d{2}-\d{2}$/, id)
    assert.ok(!Number.isNaN(Date.parse(terms.read)), `${id}: ${terms.read} is not a date`)
    assert.ok(terms.read <= today, `${id}: ${terms.read} is in the future`)
  }
})

test('analytics: the station dimension lists the stations offered and custom, nothing retired', () => {
  const spec = PARAMS.station
  assert.equal(spec.type, 'enum')
  assert.deepEqual(spec.values, [...STATIONS.map((station) => station.id), 'custom'])
  for (const id of RETIRED_STATION_IDS) assert.ok(!spec.values.includes(id), id)
})

test('analytics: a retired station id, as a cached page may send it, is sent as invalid without throwing', () => {
  for (const station of RETIRED_STATION_IDS) {
    let gated: ReturnType<typeof gateEvent> | undefined
    assert.doesNotThrow(() => {
      gated = gateEvent('bpm_stream_clicked', { station, scheme: 'https', format: 'mp3', input_method: 'url' })
    }, station)
    assert.deepEqual(gated?.params, { station: INVALID, scheme: 'https', format: 'mp3', input_method: 'url' }, station)
    assert.equal(gated?.problems.length, 1, station)
  }
})

// Directories the site and the examples ship from, and the files in them that can name a stream.
const SHIPPED_ROOTS = ['docs', 'examples']
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'cache', '.temp', 'api'])
const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.tsx', '.vue', '.js', '.md', '.html', '.json'])

/** Every source file under `dir`, skipping dependencies and build output. */
function sourceFiles(dir: string, depth = 0): string[] {
  assert.ok(depth < 12, `${dir}: deeper than any source directory should be`)
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path, depth + 1)
    return entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) && path !== thisFile ? [path] : []
  })
}

test('no page, tool or example names a stream host whose terms forbid other websites', () => {
  const files = SHIPPED_ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root)))
  assert.ok(files.some((file) => file.endsWith('stream-input.ts')), 'the scan must reach the BPM tool')
  for (const file of files) {
    const text = readFileSync(file, 'utf8').toLowerCase()
    for (const host of FORBIDDEN_HOSTS) assert.ok(!text.includes(host), `${file} names ${host}`)
  }
})

// Each streaming example, and the file that sets the URL it starts on.
const STREAMING_EXAMPLES = {
  '02-vanilla-streaming': 'src/main.ts',
  '05-react-streaming': 'src/components/bpm-analyzer.tsx',
  '08-vue-streaming': 'src/components/bpm-analyzer.vue',
} as const

// The library's own 128 BPM click track (packages/cli/tests/fixtures/readme.md says how it is made),
// so a clean clone plays it without any third-party server or licence.
const SAMPLE = 'click-128.mp3'
const SAMPLE_SOURCE = join(repoRoot, 'packages/cli/tests/fixtures', SAMPLE)

test('streaming examples: start on the click track they bundle, and name no third-party stream', () => {
  const original = readFileSync(SAMPLE_SOURCE)
  for (const [example, entry] of Object.entries(STREAMING_EXAMPLES)) {
    const dir = join(repoRoot, 'examples', example)
    const bundled = join(dir, 'public', SAMPLE)
    assert.ok(existsSync(bundled), `${example}: public/${SAMPLE} is missing`)
    assert.ok(readFileSync(bundled).equals(original), `${example}: public/${SAMPLE} differs from the library's click track`)
    assert.ok(readFileSync(join(dir, entry), 'utf8').includes(`\${import.meta.env.BASE_URL}${SAMPLE}`), `${example}: ${entry} doesn't start on the bundled sample`)

    // Until a station's terms allow other websites, an example's only addresses are placeholders.
    for (const file of [join(dir, 'index.html'), ...sourceFiles(join(dir, 'src'))]) {
      for (const [address] of readFileSync(file, 'utf8').matchAll(/https?:\/\/[^\s"'`<>)]+/g)) {
        assert.equal(new URL(address).hostname, 'example.com', `${file}: ${address}`)
      }
    }
  }
})
