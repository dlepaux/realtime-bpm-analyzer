// Run with `npm test`. The home as the site's landing page (RBA-240): the analyzer first, then every
// free tool one click away, grouped, then the extension's phone card, then the reading. Node reads
// the sources as text; the order a phone shows them in is measured in a browser on the PR's preview.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { siteNav } from '../.vitepress/tools/site-nav.ts'
import { EVENTS, PARAMS } from '../.vitepress/tools/analytics-events.ts'
import { FREE_TOOL_GROUPS, freeTools } from '../.vitepress/tools/tool-list.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const GRID = read('../.vitepress/components/HomeToolGrid.vue')
const GRID_TEMPLATE = GRID.slice(GRID.indexOf('<template>'))
const LAYOUT = read('../.vitepress/theme/Layout.vue')

type Entry = { text?: string; link?: string; items?: readonly Entry[] }

test('every tool in the Free tools menu is one click from the home', () => {
  const menu = (siteNav(null, '6.0.0') as readonly Entry[]).find((item) => item.text === 'Free tools')
  assert.ok(menu?.items)
  // The analyzer is the home itself; every other entry must be a tile.
  const menuTools = menu.items.map((item) => item.link).filter((link) => link !== '/')
  assert.deepEqual(new Set(menuTools), new Set(freeTools().map((tool) => tool.link)))
})

test('the grid renders every group under its own heading, inside one labelled region', () => {
  assert.match(GRID, /FREE_TOOL_GROUPS/)
  assert.doesNotMatch(GRID, /FREE_TOOL_ROWS/)
  assert.match(GRID_TEMPLATE, /v-for="group in groups"/)
  assert.match(GRID_TEMPLATE, /<h3[^>]*:id="group\.headingId"[^>]*>\s*\{\{ group\.title \}\}\s*<\/h3>/)
  assert.match(GRID_TEMPLATE, /<ul[^>]*:aria-labelledby="group\.headingId"/)
  assert.match(GRID_TEMPLATE, /<nav[^>]*aria-labelledby="home-tools-heading"/)
  assert.match(GRID_TEMPLATE, /<h2[^>]*id="home-tools-heading"/)
  assert.equal(FREE_TOOL_GROUPS.length > 1, true)
})

test('on a touch screen, the extension card comes after the tools', () => {
  const tools = LAYOUT.indexOf('<HomeToolGrid')
  const card = LAYOUT.indexOf('<HomeComputerCard')
  assert.ok(tools !== -1 && card !== -1 && tools < card)
})

test('analytics: a tile click is bpm_home_tool_clicked, with each tile its own catalogued id', () => {
  assert.deepEqual(EVENTS.bpm_home_tool_clicked.params, { tool: 'required' })
  assert.match(GRID, /track\('bpm_home_tool_clicked', \{ tool \}\)/)
  assert.match(GRID_TEMPLATE, /@click="onClick\(tool\.id\)"/)
  // Every tile's id is a value the catalogue accepts, so the strobe and the markers count from day one.
  const values = PARAMS.tool.type === 'enum' ? PARAMS.tool.values : []
  for (const tool of freeTools()) assert.ok(values.includes(tool.link.replace(/^\//, '')), tool.link)
})
