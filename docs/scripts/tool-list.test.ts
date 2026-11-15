// Run with `npm test`. The free tools' list, which the home's grid renders and rba-web can reuse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { FREE_TOOL_GROUPS, GRID_COLUMNS, freeTools } from '../.vitepress/tools/tool-list.ts'

const HOME_CSS = readFileSync(new URL('../.vitepress/theme/home.css', import.meta.url), 'utf8')

test('the tools come grouped by what a visitor wants to do: play and perform, then edit video', () => {
  assert.deepEqual(FREE_TOOL_GROUPS.map((group) => group.tools.map((tool) => tool.link)), [
    ['/tap-tempo', '/metronome', '/bpm-to-ms', '/strobe-light'],
    ['/video-bpm', '/bpm-to-frames', '/beat-markers'],
  ])
  assert.deepEqual(freeTools(), FREE_TOOL_GROUPS.flatMap((group) => group.tools))
})

test('each group has a title and fills its row of the grid evenly', () => {
  for (const group of FREE_TOOL_GROUPS) {
    assert.ok(group.title.length > 0 && !group.title.includes('\n'))
    assert.ok(group.tools.length > 0)
    assert.equal(GRID_COLUMNS % group.tools.length, 0, `a row of ${group.tools.length} does not divide ${GRID_COLUMNS} columns`)
    // home.css must style the span, or the row's tiles get a class with no rule.
    const span = GRID_COLUMNS / group.tools.length
    assert.match(HOME_CSS, new RegExp(`\\.home-tool-span-${span} \\{ grid-column: span ${span}; \\}`), `no span rule for a row of ${group.tools.length}`)
  }
  assert.match(HOME_CSS, new RegExp(`grid-template-columns: repeat\\(${GRID_COLUMNS}, minmax\\(0, 1fr\\)\\)`), 'home.css has the same column count')
  const titles = FREE_TOOL_GROUPS.map((group) => group.title)
  assert.equal(new Set(titles).size, titles.length, 'no title twice')
})

test('each tool has a name, one line and an icon, and its page exists', () => {
  for (const tool of freeTools()) {
    assert.ok(tool.name.length > 0 && tool.line.length > 0)
    assert.ok(!tool.line.includes('\n'))
    assert.match(tool.line, /\.$/, `${tool.name}: one sentence`)
    assert.ok(existsSync(new URL(`..${tool.link}.md`, import.meta.url)), `${tool.link} has no page`)
  }
  const links = freeTools().map((tool) => tool.link)
  assert.equal(new Set(links).size, links.length, 'no tool twice')
})
