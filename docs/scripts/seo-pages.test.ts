// Run with `npm test`. What the page sources must say for search engines and AI readers:
// the unpublished guides stay out of every list (RBA-122), home has one h1 (RBA-129),
// and the titles and snippets this repo has tuned stay within what results show.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** A `key: value` line of a page's frontmatter, unquoted. Enough for title and description. */
function field(source: string, key: string): string | undefined {
  const frontmatter = source.split(/^---$/m)[1] ?? ''
  const line = frontmatter.match(new RegExp(`^${key}: *(.+)$`, 'm'))?.[1]
  return line?.trim().replace(/^(["'])(.*)\1$/, '$2')
}

const SUFFIX = ' | Realtime BPM Analyzer'
// Pages whose title and description were measured against these limits. Add a page once
// its copy fits; /video-bpm's title is left as it is while its ranking is measured.
const MEASURED = {
  'index.md': { title: true },
  'guide/node.md': { title: true, description: true },
  'guide/beat-detection-web-audio.md': { description: true },
  'guide/realtime-bpm-detection.md': { description: true },
  'bpm-to-frames.md': { title: true, description: true },
} as const

test('titles fit in about 60 characters with the suffix, descriptions in 155', () => {
  for (const [path, limits] of Object.entries(MEASURED)) {
    const source = read(`../${path}`)
    const title = field(source, 'title')
    const description = field(source, 'description')
    assert.ok(title && description, `${path}: no title or description`)
    if ('title' in limits) assert.ok(`${title}${SUFFIX}`.length <= 60, `${path}: title ${`${title}${SUFFIX}`.length} characters`)
    if ('description' in limits) assert.ok(description.length <= 155, `${path}: description ${description.length} characters`)
  }
})

test('the guides whose openings answer first still do', () => {
  const opening = (path: string) => read(`../${path}`).split(/^# .+$/m)[1]?.trim().split('\n\n')[0] ?? ''
  assert.match(opening('bpm-to-frames.md'), /^Frames per beat equals the frame rate times 60, divided by the BPM\./)
  assert.match(opening('guide/beat-detection-web-audio.md'), /^Beat detection is three tasks/)
  assert.match(opening('guide/realtime-bpm-detection.md'), /^To detect BPM in real time/)
  assert.match(opening('guide/bpm-from-microphone.md'), /^To detect BPM from the microphone/)
})

test('the CLI and MCP guides are out of the sidebar, llms.txt and every other page', () => {
  const unpublished = /\/guide\/(cli|mcp)\b|\]\(\.\/(cli|mcp)\b/
  assert.ok(!unpublished.test(read('../.vitepress/config.ts')), 'config.ts')
  assert.ok(!unpublished.test(read('../public/llms.txt')), 'llms.txt')
  const pages = ['index.md', 'bpm-to-frames.md', 'video-bpm.md', 'tap-tempo.md', 'bpm-to-ms.md', 'metronome.md']
  const guides = readdirSync(new URL('../guide/', import.meta.url))
    .filter((name) => name.endsWith('.md') && name !== 'cli.md' && name !== 'mcp.md')
    .map((name) => `guide/${name}`)
  for (const path of [...pages, ...guides]) assert.ok(!unpublished.test(read(`../${path}`)), path)
  for (const name of ['cli', 'mcp']) assert.equal(field(read(`../guide/${name}.md`), 'search'), 'false', name)
  assert.ok(unpublished.test('[the CLI](/guide/cli)') && unpublished.test('[CLI](./cli#x)'), 'the check must catch a link')
})

test('llms.txt lists the tutorials and calls the home tool the BPM Finder', () => {
  const llms = read('../public/llms.txt')
  for (const path of ['realtime-bpm-detection', 'bpm-from-microphone', 'react-bpm-hook']) {
    assert.ok(llms.includes(`https://www.realtime-bpm-analyzer.com/guide/${path})`), path)
  }
  assert.ok(llms.includes('- [BPM Finder](https://www.realtime-bpm-analyzer.com/)'))
  assert.ok(!/CLI|MCP/.test(llms), 'llms.txt names a package that is not on npm')
})

test('home: one h1, holding only the hero text, at every width', () => {
  const home = read('../index.md')
  // A `hero:` key would bring back VitePress's own hero and its h1 next to HomeHero's (RBA-66).
  assert.ok(!/^hero:$/m.test(home), 'VitePress would render a second hero')
  const hero = home.split(/^homeHero:$/m)[1]?.split(/^\S/m)[0] ?? ''
  assert.equal(field(`---\n${hero.replace(/^ {2}/gm, '')}\n---`, 'text'), field(home, 'title'))
  assert.ok(!/<h1\b/.test(read('../.vitepress/theme/Layout.vue')), 'Layout.vue renders a second h1')
  const heroView = read('../.vitepress/components/HomeHero.vue')
  assert.equal(heroView.match(/<h1\b/g)?.length, 1)
  assert.match(heroView, /<h1[^>]*>\s*\{\{ hero\.text \}\}\s*<\/h1>/, 'the h1 holds the hero text and nothing else')
})

test('home and the guides link where readers go next', () => {
  const home = read('../index.md')
  for (const link of ['(/guide/beat-detection-web-audio)', '(/guide/node)']) assert.ok(home.includes(link), link)
  assert.ok(read('../bpm-to-frames.md').includes('[BPM finder](/)'), 'bpm-to-frames to the home BPM finder')
  assert.ok(read('../guide/bpm-from-microphone.md').includes('(/guide/beat-detection-web-audio)'), 'microphone guide')
})
