// Run with `npm test -w docs`. The docs embed every example, and CI builds them through build-examples.ts.
// Two things the build alone wouldn't catch (RBA-231): an embed that blocks the microphone, which
// only shows in docs dev where the examples are on another origin, and an example whose types
// drift from the library's, which vite strips without checking.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const EMBED = read('../.vitepress/components/ExampleEmbed.vue')
const BUILD = read('./build-examples.ts')
const EXAMPLES = readdirSync(new URL('../../examples/', import.meta.url), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

test('the embed lets the microphone examples ask for the microphone', () => {
  const iframe = EMBED.match(/<iframe[\s\S]*?>/)?.[0]
  assert.ok(iframe, 'ExampleEmbed has no iframe')
  const allow = iframe.match(/\sallow="([^"]*)"/)?.[1] ?? ''
  assert.ok(allow.split(';').map(s => s.trim()).includes('microphone'), `allow="${allow}"`)
})

test('the docs build builds every example through its own build script', () => {
  // A source check, loose on purpose: a bare `vite build` here would skip the type-check below.
  assert.ok(BUILD.includes('npm run build'), 'build-examples.ts no longer runs the examples\' build script')
  for (const example of EXAMPLES) {
    assert.ok(BUILD.includes(`'${example}'`), `build-examples.ts does not build ${example}`)
  }
})

test('every example type-checks before vite bundles it', () => {
  assert.equal(EXAMPLES.length, 9)
  for (const example of EXAMPLES) {
    const { scripts } = JSON.parse(read(`../../examples/${example}/package.json`))
    assert.match(scripts.build, /^(tsc|vue-tsc) && vite build$/, `${example}: "${scripts.build}"`)
  }
})
