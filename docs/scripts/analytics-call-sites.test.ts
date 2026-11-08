// Run with `npm test`. Every track() call against the catalogue (RBA-154): a name the catalogue
// doesn't know never reaches a report, and an event nobody sends is a report that stays empty.
// Markdown can't be type-checked, so it never calls track(): a component does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EVENTS } from '../.vitepress/tools/analytics-events.ts'

const DOCS = fileURLToPath(new URL('..', import.meta.url))
// Generated or not the site: dependencies, build output, TypeDoc's pages and these tests.
const SKIP = new Set(['node_modules', 'dist', 'cache', '.temp', 'api', 'scripts'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sourceFiles(path)
    return /\.(vue|ts|md)$/.test(entry.name) ? [path] : []
  })
}

type Call = { file: string; line: number; name: string | null }

// `track(` followed by an argument: prose such as "track() runs" is not a call.
function callsIn(file: string): Call[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/\btrack\((?!\))/g)].map((match) => {
    const after = text.slice(match.index + match[0].length)
    const literal = /^\s*'([a-z0-9_]+)'/.exec(after)
    return { file: relative(DOCS, file), line: text.slice(0, match.index).split('\n').length, name: literal?.[1] ?? null }
  })
}

const files = sourceFiles(DOCS)
const calls = files.flatMap(callsIn)

test('the scan sees the site\'s components and pages', () => {
  assert.ok(files.some((file) => file.endsWith('BpmHeroTool.vue')))
  assert.ok(files.some((file) => file.endsWith('index.md')))
  assert.ok(calls.length > 20, `${calls.length} calls found`)
})

test('every track() call names its event with a literal from the catalogue', () => {
  for (const call of calls) {
    const where = `${call.file}:${call.line}`
    assert.ok(call.name !== null, `${where}: the event name must be a string literal`)
    assert.ok(Object.hasOwn(EVENTS, call.name), `${where}: ${call.name} is not in analytics-events.ts`)
  }
})

test('every catalogue event has at least one call site', () => {
  const called = new Set(calls.map((call) => call.name))
  for (const name of Object.keys(EVENTS)) assert.ok(called.has(name), `${name} is declared but never sent`)
})

test('no markdown page calls track()', () => {
  for (const call of calls.filter((entry) => entry.file.endsWith('.md'))) {
    assert.fail(`${call.file}:${call.line}: move the call into a typed component`)
  }
  for (const file of files.filter((path) => path.endsWith('.md'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /useAnalytics/, relative(DOCS, file))
  }
})
