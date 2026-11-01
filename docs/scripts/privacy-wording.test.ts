// Run with `npm test`. The promises "collects nothing" and "no tracking" belong to the
// library, the CLI and the MCP server, never to the website, which measures its own pages.
// See "Privacy wording" in contributing.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { HOME_FAQ } from '../.vitepress/tools/site-schema.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// What only the website says about itself: its tool pages, what search and AI engines read,
// and the hero's copy. Guides and the extension's pages are left out because they speak for
// the library and the extension, where these words are true.
const WEBSITE_SURFACES = [
  '../index.md',
  '../tap-tempo.md',
  '../metronome.md',
  '../bpm-to-ms.md',
  '../website-privacy.md',
  '../public/llms.txt',
  '../.vitepress/tools/site-schema.ts',
  '../.vitepress/tools/extension-promo.ts',
  '../.vitepress/components/BpmHeroTool.vue',
  ...readdirSync(new URL('../examples/', import.meta.url))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `../examples/${name}`),
]

const FALSE_OF_THE_WEBSITE = [
  /\bno (tracking|analytics|cookies|telemetry|data collection)\b(?! parameters)/i,
  /\bcollects? (nothing|no data)\b/i,
  /\b(does not|doesn't) (track|collect)\b/i,
  /\b(works?|runs?|available|usable) offline\b/i,
]

// Wrong even beside another subject: the reader takes the whole product for private.
const ALWAYS_FALSE = [/\bprivate (BPM|tool|analy[sz]er|analysis)\b/i, /\b100% priva/i]

// A line that names another subject may say these words truthfully.
const NAMES_ANOTHER_SUBJECT = /\b(library|CLI|MCP server|extension)\b/i

test('website surfaces: no line promises the website collects nothing', () => {
  for (const path of WEBSITE_SURFACES) {
    for (const [index, line] of read(path).split('\n').entries()) {
      const claims = NAMES_ANOTHER_SUBJECT.test(line) ? ALWAYS_FALSE : [...ALWAYS_FALSE, ...FALSE_OF_THE_WEBSITE]
      for (const claim of claims) {
        assert.ok(!claim.test(line), `${path}:${index + 1} matches ${claim}: ${line.trim()}`)
      }
    }
  }
})

// When the snippet goes or changes (RBA-84 decides consent), this fails so the policy moves with it.
test('website privacy: names the analytics the site really loads', () => {
  assert.match(read('../.vitepress/config.ts'), /googletagmanager\.com\/gtm\.js/)
  const policy = read('../website-privacy.md')
  assert.match(policy, /Google Analytics 4/)
  assert.match(policy, /Google Tag Manager/)
})

test('website privacy: stream events are described as they are sent, with no address', () => {
  assert.doesNotMatch(read('../website-privacy.md'), /address of a stream/i)
})

test('home FAQ: the audio answer also says the website measures its pages', () => {
  const answer = HOME_FAQ.find(({ q }) => q === 'Is my audio sent to a server?')
  assert.ok(answer)
  assert.match(answer.a, /Your audio never leaves your device/)
  assert.match(answer.a, /Google Analytics/)
})

// These are published on the website too, where a reader takes "no tracking" for the site's own.
test('library documents: each one points at the website privacy page', () => {
  for (const path of ['../../readme.md', '../../privacy.md', '../../security.md']) {
    assert.match(read(path), /realtime-bpm-analyzer\.com\/website-privacy/, path)
  }
})
