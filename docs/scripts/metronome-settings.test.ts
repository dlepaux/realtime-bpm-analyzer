// Run with `npm test` (node --test, Node's own type stripping; no test framework).
// The metronome's remembered settings (RBA-276): the address, then the store, then the defaults.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SETTINGS,
  MAX_BEATS_PER_BAR,
  MIN_BEATS_PER_BAR,
  SUBDIVISIONS,
  loadSettings,
  readSettings,
  settingsQuery,
  subdivisionOf,
  subdivisionValue,
  withSettingsParams,
  writeSettingsToUrl,
  type MetronomeSettings,
} from '../.vitepress/tools/metronome-settings.ts'

const WALTZ: MetronomeSettings = { bpm: 72, beatsPerBar: 3, subdivision: 'triplets' }

test('readSettings: reads every field of a link', () => {
  assert.deepEqual(readSettings('?bpm=72&beats=3&sub=triplets'), WALTZ)
  assert.deepEqual(readSettings('bpm=72&beats=3&sub=triplets'), WALTZ)
})

test('readSettings: a link with only ?bpm= reads as before, the tempo alone, in whole BPM', () => {
  assert.deepEqual(readSettings('?bpm=90'), { bpm: 90 })
  assert.deepEqual(readSettings('?bpm=72.5'), { bpm: 73 })
  // Out of range clamps, as every tool page's ?bpm= does.
  assert.deepEqual(readSettings('?bpm=500'), { bpm: 300 })
  assert.deepEqual(readSettings('?bpm=3'), { bpm: 20 })
})

test('readSettings: each invalid field is left out on its own, the others kept', () => {
  assert.deepEqual(readSettings('?bpm=abc&beats=3&sub=triplets'), { beatsPerBar: 3, subdivision: 'triplets' })
  assert.deepEqual(readSettings('?bpm=72&beats=0&sub=triplets'), { bpm: 72, subdivision: 'triplets' })
  assert.deepEqual(readSettings('?bpm=72&beats=3&sub=quintuplets'), { bpm: 72, beatsPerBar: 3 })
  for (const beats of ['0', '13', '99', '-3', '3.5', '3e0', ' 3', '', '0x3', '1'.repeat(400)]) {
    assert.equal(readSettings(`?beats=${encodeURIComponent(beats)}`).beatsPerBar, undefined, `beats=${beats}`)
  }
  assert.equal(readSettings(`?beats=${MIN_BEATS_PER_BAR}`).beatsPerBar, MIN_BEATS_PER_BAR)
  assert.equal(readSettings(`?beats=${MAX_BEATS_PER_BAR}`).beatsPerBar, MAX_BEATS_PER_BAR)
  // The label is not the id, and ids are matched exactly.
  assert.equal(readSettings('?sub=Triplets').subdivision, undefined)
  assert.equal(readSettings('?sub=16ths').subdivision, undefined)
})

test('readSettings: garbage, nothing or someone else\'s format reads as no settings', () => {
  for (const raw of [null, '', '{"bpm":72}', 'undefined', '%%%', '&&&', 'bpm', 'bpm=&beats=&sub=', '\u0000']) {
    assert.deepEqual(readSettings(raw), {}, String(raw))
  }
})

test('loadSettings: nothing anywhere opens on 120, 4/4, quarters', () => {
  assert.deepEqual(loadSettings('', null), DEFAULT_SETTINGS)
  assert.deepEqual(DEFAULT_SETTINGS, { bpm: 120, beatsPerBar: 4, subdivision: 'quarters' })
})

test('loadSettings: the store fills in for a bare address, so a returning player starts where they left off', () => {
  assert.deepEqual(loadSettings('', settingsQuery(WALTZ)), WALTZ)
})

test('loadSettings: the address wins over the store, field by field', () => {
  const stored = settingsQuery(WALTZ)
  assert.deepEqual(loadSettings('?bpm=100&beats=4&sub=eighths', stored), { bpm: 100, beatsPerBar: 4, subdivision: 'eighths' })
  // A home result's ?bpm= link keeps the player's own meter.
  assert.deepEqual(loadSettings('?bpm=100', stored), { bpm: 100, beatsPerBar: 3, subdivision: 'triplets' })
  // An invalid address field gives way to the store, not to the default.
  assert.deepEqual(loadSettings('?bpm=fast&beats=40', stored), WALTZ)
})

test('loadSettings: a hand-edited store falls back per field', () => {
  assert.deepEqual(loadSettings('', 'bpm=9000&beats=-1&sub=triplets'), { bpm: 300, beatsPerBar: 4, subdivision: 'triplets' })
  assert.deepEqual(loadSettings('', 'not settings at all'), DEFAULT_SETTINGS)
})

test('settingsQuery and readSettings round-trip every setting the metronome can hold', () => {
  for (const sub of SUBDIVISIONS) {
    for (const beatsPerBar of [MIN_BEATS_PER_BAR, 7, MAX_BEATS_PER_BAR]) {
      for (const bpm of [20, 120, 300]) {
        const settings: MetronomeSettings = { bpm, beatsPerBar, subdivision: sub.id }
        assert.deepEqual(loadSettings('', settingsQuery(settings)), settings)
      }
    }
  }
  assert.equal(settingsQuery(WALTZ), 'bpm=72&beats=3&sub=triplets')
})

test('withSettingsParams: other params (a campaign tag) stay, old values are replaced', () => {
  assert.equal(withSettingsParams('?utm_source=x&bpm=90', WALTZ), '?utm_source=x&bpm=72&beats=3&sub=triplets')
  assert.equal(withSettingsParams('?sub=sixteenths&beats=7', WALTZ), '?sub=triplets&beats=3&bpm=72')
})

function fakeWindow(search: string, replaceState: (url: string) => void) {
  return {
    location: { pathname: '/metronome', search, hash: '' },
    history: { state: null, replaceState: (_state: unknown, _unused: string, url: string) => replaceState(url) },
  }
}

test('writeSettingsToUrl: puts the settings in the address, once, and survives a refusal', () => {
  const urls: string[] = []
  assert.equal(writeSettingsToUrl(fakeWindow('', (url) => urls.push(url)), WALTZ), true)
  assert.deepEqual(urls, ['/metronome?bpm=72&beats=3&sub=triplets'])
  assert.equal(writeSettingsToUrl(fakeWindow('?bpm=72&beats=3&sub=triplets', (url) => urls.push(url)), WALTZ), true)
  assert.equal(urls.length, 1, 'no call when the address already holds the settings')
  const refuse = () => { throw new Error('SecurityError') }
  assert.equal(writeSettingsToUrl(fakeWindow('', refuse), WALTZ), false)
})

test('subdivisionOf and subdivisionValue map clicks per beat to the id and back', () => {
  for (const sub of SUBDIVISIONS) {
    assert.equal(subdivisionOf(sub.value).id, sub.id)
    assert.equal(subdivisionValue(sub.id), sub.value)
  }
  assert.equal(subdivisionOf(5).id, 'quarters')
  // The ids are what analytics sends (RBA-154): renaming one changes a reported value.
  assert.deepEqual(SUBDIVISIONS.map((sub) => sub.id), ['quarters', 'eighths', 'triplets', 'sixteenths'])
})
