// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UNINSTALL_REASONS,
  compareVersions,
  isUninstallReason,
  parseVersion,
  readExtensionQuery,
  splitReleases,
  type ExtensionRelease,
} from '../.vitepress/tools/extension-pages.ts'
import { extensionReleases } from '../.vitepress/data/extension-releases.ts'

test('parseVersion: accepts the extension version format and normalises it', () => {
  assert.equal(parseVersion('1.2.3'), '1.2.3')
  assert.equal(parseVersion('1'), '1.0.0')
  assert.equal(parseVersion('1.1'), '1.1.0')
  assert.equal(parseVersion(' 2.0.1 '), '2.0.1')
  assert.equal(parseVersion('1.2.3.4'), '1.2.3.4')
  assert.equal(parseVersion('1.2.3.0'), '1.2.3')
  assert.equal(parseVersion('65535.0.0'), '65535.0.0')
})

test('parseVersion: rejects anything else, including markup', () => {
  for (const raw of [
    null, undefined, '', '.', '1.', '.1', '1..2', 'v1.2.3', '1.2.3-beta', '1.2.3+build',
    '1.2.3.4.5', '01.2.3', '1.02', '65536.0.0', '-1.0.0', '1e3', '0x10',
    '<script>alert(1)</script>', '1.2.3"><img src=x onerror=alert(1)>', '1.2.3\n<b>',
  ]) {
    assert.equal(parseVersion(raw), null, String(raw))
  }
})

test('compareVersions: orders numerically, not as text', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0)
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0.0', '1.0.0'), 0)
  assert.ok(compareVersions('2.0.0', '1.99.99.99') > 0)
  assert.throws(() => compareVersions('nope', '1.0.0'))
})

test('readExtensionQuery: reads v and from, drops invalid values', () => {
  assert.deepEqual(readExtensionQuery('?v=1.2.0&from=1.1.3'), { version: '1.2.0', from: '1.1.3' })
  assert.deepEqual(readExtensionQuery('?v=1.2.0'), { version: '1.2.0', from: null })
  assert.deepEqual(readExtensionQuery(''), { version: null, from: null })
  assert.deepEqual(readExtensionQuery('?v=%3Cb%3E&from=latest'), { version: null, from: null })
  // A repeated key keeps the first value, as URLSearchParams.get does.
  assert.deepEqual(readExtensionQuery('?v=1.0.0&v=9.9.9'), { version: '1.0.0', from: null })
})

const release = (version: string): ExtensionRelease => ({ version, title: version, notes: [] })
const versions = (list: readonly ExtensionRelease[]) => list.map((r) => r.version)
const RELEASES = [release('1.0.0'), release('1.2.0'), release('1.1.0'), release('2.0.0')]

test('splitReleases: shows what arrived after from, newest first', () => {
  const { fresh, earlier } = splitReleases(RELEASES, { version: '1.2.0', from: '1.0.0' })
  assert.deepEqual(versions(fresh), ['1.2.0', '1.1.0'])
  assert.deepEqual(versions(earlier), ['1.0.0'])
})

test('splitReleases: leaves out releases newer than the installed version', () => {
  const { fresh, earlier } = splitReleases(RELEASES, { version: '1.1.0', from: '1.0.4' })
  assert.deepEqual(versions(fresh), ['1.1.0'])
  assert.deepEqual(versions(earlier), ['1.0.0'])
})

test('splitReleases: without a valid from, every shipped release is new', () => {
  assert.deepEqual(versions(splitReleases(RELEASES, { version: null, from: null }).fresh),
    ['2.0.0', '1.2.0', '1.1.0', '1.0.0'])
  assert.deepEqual(versions(splitReleases(RELEASES, { version: '1.1.0', from: null }).fresh),
    ['1.1.0', '1.0.0'])
})

test('splitReleases: nothing new when from is already the latest', () => {
  const { fresh, earlier } = splitReleases(RELEASES, { version: '2.0.0', from: '2.0.0' })
  assert.deepEqual(versions(fresh), [])
  assert.equal(earlier.length, 4)
})

test('extension releases: every entry is a valid, unique version with notes, newest first', () => {
  const seen = new Set<string>()
  for (const entry of extensionReleases) {
    assert.equal(parseVersion(entry.version), entry.version, entry.version)
    assert.ok(!seen.has(entry.version), `duplicate ${entry.version}`)
    seen.add(entry.version)
    assert.ok(entry.title.length > 0 && entry.notes.length > 0, entry.version)
  }
  const sorted = [...extensionReleases].sort((a, b) => compareVersions(b.version, a.version))
  assert.deepEqual(versions(extensionReleases), versions(sorted))
})

test('uninstall reasons: a fixed list of distinct snake_case values', () => {
  const values = UNINSTALL_REASONS.map((r) => r.value)
  assert.equal(new Set(values).size, values.length)
  for (const value of values) {
    assert.match(value, /^[a-z]+(_[a-z]+)*$/)
    assert.equal(isUninstallReason(value), true)
  }
  assert.equal(isUninstallReason('free text'), false)
  assert.equal(isUninstallReason(undefined), false)
})
