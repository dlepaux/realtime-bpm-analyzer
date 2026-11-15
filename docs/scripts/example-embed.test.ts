// Run with `npm test -w docs`. The docs embed every example, and CI builds them through build-examples.ts.
// Two things the build alone wouldn't catch (RBA-231): an embed that blocks the microphone, which
// only shows in docs dev where the examples are on another origin, and an example whose types
// drift from the library's, which vite strips without checking.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  EXAMPLE_DEV_PORTS,
  EXAMPLES_DEV_COMMAND,
  probeDevServer,
  type ProbeFetch,
} from '../.vitepress/tools/example-dev-server.ts'

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

// The file examples take video too (RBA-231): the browser decodes a video's sound track like any
// audio file, as /video-bpm does. The three say it in the same words, so a reader can compare them.
// The limits are the page's FAQ, plus the iOS .mov failure measured on the site (RBA-219).
const FILE_FORMATS = 'Audio or video files. For a video, its sound track is analyzed: MP4 with AAC sound and WebM usually work, MOV and MKV depend on the browser and the codec inside, and iPhone .mov files don’t decode on iOS.'
const DECODE_ERROR = 'This file could not be decoded. Try an MP3, WAV, OGG or FLAC file, or an MP4 or WebM video.'
const FILE_EXAMPLES = {
  '01-vanilla-basic': read('../../examples/01-vanilla-basic/index.html') + read('../../examples/01-vanilla-basic/src/main.ts'),
  '04-react-basic': read('../../examples/04-react-basic/src/components/bpm-analyzer.tsx'),
  '07-vue-basic': read('../../examples/07-vue-basic/src/components/bpm-analyzer.vue'),
}

test('the file examples accept video files, as /video-bpm does', () => {
  const page = read('../.vitepress/components/BpmHeroTool.vue').match(/type="file"\s+accept="([^"]*)"/)?.[1]
  assert.equal(page, 'audio/*,video/*')
  for (const [example, source] of Object.entries(FILE_EXAMPLES)) {
    const accepts = [...source.matchAll(/type="file"[\s\S]*?accept="([^"]*)"/g)].map(m => m[1])
    assert.deepEqual(accepts, [page], `${example}: accept=${JSON.stringify(accepts)}`)
  }
})

test('the file examples state the same formats and limits, iOS .mov included', () => {
  for (const [example, source] of Object.entries(FILE_EXAMPLES)) {
    assert.ok(source.includes(FILE_FORMATS), `${example} lacks the formats line`)
    assert.ok(source.includes(DECODE_ERROR), `${example} lacks the decode error`)
  }
  assert.match(FILE_FORMATS, /MP4[\s\S]*WebM[\s\S]*MOV[\s\S]*iPhone[\s\S]*iOS/)
})

test('the examples readme and Basic Usage say a video works the same way', () => {
  assert.match(read('../../examples/readme.md'), /An audio or video file, analyzed at once/)
  const basic = read('../examples/basic-usage.md')
  assert.match(basic, /video file works the same way/)
  assert.match(basic, /iPhone `\.mov` files don’t decode on iOS/)
})

// In docs dev the embeds load each example's own dev server, which `npm run docs:dev` doesn't start.
// The embed checks that server first, and names the command instead of showing a blank frame.
test('every example has a dev port, the one its vite config falls back to', () => {
  assert.deepEqual(Object.keys(EXAMPLE_DEV_PORTS).sort(), [...EXAMPLES].sort())
  for (const example of EXAMPLES) {
    const config = read(`../../examples/${example}/vite.config.ts`)
    assert.match(config, new RegExp(`: ${EXAMPLE_DEV_PORTS[example]},`), example)
  }
  assert.ok(read('./dev-examples.ts').includes('EXAMPLE_DEV_PORTS'), 'dev-examples.ts keeps its own port list')
})

test('the dev command the embed names is a root script that starts the examples', () => {
  const { scripts } = JSON.parse(read('../../package.json'))
  const name = EXAMPLES_DEV_COMMAND.replace(/^npm run /, '')
  assert.equal(scripts[name], 'npm run dev:examples -w docs')
  assert.ok(EMBED.includes('EXAMPLES_DEV_COMMAND'), 'the embed does not name the command')
})

test('the probe says up when the dev server answers, down when nothing listens', async () => {
  const calls: Array<[string, RequestInit | undefined]> = []
  const answering: ProbeFetch = async (url, init) => { calls.push([url, init]); return {} }
  assert.equal(await probeDevServer('http://localhost:3001', answering), 'up')
  assert.equal(calls[0][1]?.mode, 'no-cors', 'a cross-origin probe must not need CORS headers')
  const refusing: ProbeFetch = async () => { throw new TypeError('Failed to fetch') }
  assert.equal(await probeDevServer('http://localhost:3001', refusing), 'down')
})

test('the embed probes only in dev, so production keeps its plain iframe', () => {
  assert.match(EMBED, /import\.meta\.env\.DEV \? 'checking' : 'up'/)
  assert.match(EMBED, /return `\/examples\/\$\{props\.example\}\/`/)
})
