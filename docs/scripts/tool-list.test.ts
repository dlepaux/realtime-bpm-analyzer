// Run with `npm test`. The free tools' list, which the home's grid renders and rba-web can reuse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { FREE_TOOL_ROWS, GRID_COLUMNS, freeTools } from '../.vitepress/tools/tool-list.ts'

test('the tools come in order of use: Tap Tempo, Metronome, BPM to ms, then the video tools', () => {
  assert.deepEqual(freeTools().map((tool) => tool.link), ['/tap-tempo', '/metronome', '/bpm-to-ms', '/video-bpm', '/bpm-to-frames'])
})

test('every row fills the grid evenly, so no tile is left alone on a row', () => {
  for (const row of FREE_TOOL_ROWS) {
    assert.ok(row.length > 0)
    assert.equal(GRID_COLUMNS % row.length, 0, `a row of ${row.length} does not divide ${GRID_COLUMNS} columns`)
    // home.css styles these spans only: a row of another length would get a class with no rule.
    assert.ok([2, 3].includes(GRID_COLUMNS / row.length), `a row of ${row.length} has no span rule in home.css`)
  }
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
