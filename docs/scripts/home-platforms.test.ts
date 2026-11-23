// Run with `npm test`. The home page's "Where it runs" tabs show code copied from the
// guides, so a sample changed in a guide can't be left stale on the home page. code-blocks.test.ts
// type-checks the JavaScript and TypeScript ones; nothing here runs the Python, Java, Kotlin, C#
// or Swift samples, so this holds each of them to the guide that documents it, character for character.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { LANGUAGE_TABS, PLATFORMS } from '../.vitepress/tools/platforms.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const HOME = read('../index.md')
const COMPONENT = read('../.vitepress/components/HomePlatforms.vue')

/** The fenced code blocks of some markdown, each from its opening fence to its closing one. */
function fences(markdown: string): string[] {
  const lines = markdown.split('\n')
  const blocks: string[] = []
  for (let index = 0; index < lines.length; index++) {
    if (!/^```\w/.test(lines[index] ?? '')) {
      continue
    }
    const close = lines.findIndex((line, at) => at > index && line.startsWith('```'))
    assert.ok(close > index, `unclosed fence at line ${index + 1}`)
    blocks.push(lines.slice(index, close + 1).join('\n'))
    index = close
  }
  return blocks
}

/** Each slot index.md fills in <HomePlatforms>, by name. */
function slots(): Map<string, string> {
  const start = HOME.indexOf('\n<HomePlatforms>\n')
  const end = HOME.indexOf('\n</HomePlatforms>\n')
  assert.ok(start !== -1 && end > start, 'the home has no <HomePlatforms> block')
  const body = HOME.slice(start, end)
  const found = new Map<string, string>()
  for (const match of body.matchAll(/^<template #(\w+)>\n([\s\S]*?)^<\/template>$/gm)) {
    assert.ok(!found.has(match[1] ?? ''), `the slot ${match[1]} is filled twice`)
    found.set(match[1] ?? '', match[2] ?? '')
  }
  return found
}

/** The guide page a site path points to, and the heading its anchor names, if any. */
function guideOf(href: string): { file: string; anchor: string | undefined } {
  const match = /^\/guide\/([\w-]+)(?:#([\w-]+))?$/.exec(href)
  assert.ok(match !== null, `${href} is not a guide link`)
  return { file: `../guide/${match[1]}.md`, anchor: match[2] }
}

const slug = (heading: string) => heading.toLowerCase().replaceAll(/[^\w\s-]/g, '').trim().replaceAll(/\s+/g, '-')

test('index.md fills one slot per tab, and no other', () => {
  assert.deepEqual([...slots().keys()], LANGUAGE_TABS.map((tab) => tab.id))
})

// A shell install command, a Maven dependency, a Gradle line, or a SwiftPM dependency.
const INSTALL = /^(```bash\n((npm|pip) install|dotnet add package) |```xml\n<dependency>|```kotlin\nimplementation\(|```swift\n\.package\(url: )/

test("every tab has its install line and a sample, each copied from the tab's guides", () => {
  const filled = slots()
  for (const tab of LANGUAGE_TABS) {
    const blocks = fences(filled.get(tab.id) ?? '')
    assert.ok(blocks.length >= 2, `the ${tab.label} tab needs an install line and a sample`)
    assert.match(blocks[0] ?? '', INSTALL, `the ${tab.label} tab opens with its install line`)
    const guides = tab.sources.map((source) => fences(read(`../guide/${source}`))).flat()
    for (const block of blocks) {
      assert.ok(guides.includes(block), `the ${tab.label} tab shows a block none of ${tab.sources.join(', ')} has:\n${block}`)
    }
  }
})

test('every platform and every tab links to a guide that exists, and to a heading it has', () => {
  for (const href of [...PLATFORMS.map((platform) => platform.guide), ...LANGUAGE_TABS.map((tab) => tab.guide)]) {
    const { file, anchor } = guideOf(href)
    assert.ok(existsSync(new URL(file, import.meta.url)), `${href}: no ${file}`)
    if (anchor !== undefined) {
      const headings = read(file).split('\n').filter((line) => line.startsWith('#')).map((line) => slug(line.replace(/^#+ /, '')))
      assert.ok(headings.includes(anchor), `${href}: no heading #${anchor}`)
    }
  }
})

// Decided on 2026-11-17: the "Runs in" row shows
// names only. Some owners' terms allow no grey logo (Java's cup, Apple's marks), so a logo row would
// always mix logos with names; the tabs below show the platforms off. With no logo shown, no
// trademark credit line either.
test('the "Runs in" row shows each platform by name, with no logo and no credit line', () => {
  for (const platform of PLATFORMS) {
    assert.deepEqual(Object.keys(platform).sort(), ['guide', 'name'], platform.name)
  }
  assert.doesNotMatch(COMPONENT, /<svg|lucide|-logo|-credits/)
  assert.doesNotMatch(COMPONENT, /trademark/i)
})

// The readme's Platforms table names the Maven coordinate with its version, as the Java guide does.
test("the readme's Gradle line is the Java guide's", () => {
  const gradle = /implementation\("io\.github\.dlepaux:realtime-bpm-analyzer:[^"]+"\)/
  const readme = read('../../readme.md').match(gradle)?.[0]
  assert.ok(readme !== undefined, 'the readme has no Gradle line')
  assert.equal(readme, read('../guide/java.md').match(gradle)?.[0])
})
