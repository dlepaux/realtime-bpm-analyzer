// Run with `npm test` (node --test, Node's own type stripping; no test framework).
// The frame rate remembered across the video tools, and the store door it goes through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXPORT_TIMECODES, timecodeChoice } from '../.vitepress/tools/beat-markers.ts'
import { FRAME_RATES } from '../.vitepress/tools/frames.ts'
import {
  DEFAULT_TIMECODE,
  FRAME_RATE_STORAGE_KEY,
  loadFrameRate,
  parseRememberedRate,
  rateForLabel,
  saveFrameRate,
} from '../.vitepress/tools/frame-rate-memory.ts'
import { browserStore, readItem, writeItem, type KeyValueStore } from '../.vitepress/tools/local-store.ts'

function memoryStore(): KeyValueStore & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value) },
  }
}

// Safari with cookies blocked throws on every access; a full store throws on write.
const refusingStore: KeyValueStore = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('QuotaExceededError') },
}

const byId = (id: string) => EXPORT_TIMECODES.find((entry) => entry.id === id)!

test('nothing remembered is 24 fps, as the tools assumed before', () => {
  assert.equal(DEFAULT_TIMECODE.id, '24')
  assert.equal(loadFrameRate(memoryStore()), DEFAULT_TIMECODE)
  assert.equal(loadFrameRate(null), DEFAULT_TIMECODE)
})

test('a saved rate is the one every video tool loads next time', () => {
  const store = memoryStore()
  assert.equal(saveFrameRate(store, byId('29.97 NDF')), true)
  assert.equal(store.items.get(FRAME_RATE_STORAGE_KEY), '29.97 NDF')
  assert.equal(loadFrameRate(store), byId('29.97 NDF'))
})

test('every export timecode survives the store', () => {
  for (const entry of EXPORT_TIMECODES) assert.equal(parseRememberedRate(entry.id), entry)
})

test('a garbage or hand-edited stored rate falls back to 24 fps', () => {
  for (const raw of [null, '', '23', '24 ', ' 25', '29.97', '29.97 df', '48', 'NaN', '{"id":"25"}', 'x'.repeat(1000)]) {
    assert.equal(parseRememberedRate(raw), DEFAULT_TIMECODE, String(raw))
  }
})

test('rateForLabel: a /bpm-to-frames row remembers its rate, keeping a remembered timecode kind', () => {
  assert.equal(rateForLabel(DEFAULT_TIMECODE, '25'), byId('25'))
  // A new 29.97 is drop-frame, the broadcast norm; a remembered non-drop 29.97 stays non-drop.
  assert.equal(rateForLabel(DEFAULT_TIMECODE, '29.97'), byId('29.97 DF'))
  assert.equal(rateForLabel(byId('29.97 NDF'), '29.97'), byId('29.97 NDF'))
  assert.equal(rateForLabel(byId('29.97 NDF'), '59.94'), byId('59.94 DF'))
  // A custom rate can't be exported, so it isn't remembered.
  assert.equal(rateForLabel(DEFAULT_TIMECODE, '48'), null)
})

test('every /bpm-to-frames preset has an export timecode, so any row can be remembered', () => {
  for (const rate of FRAME_RATES) assert.equal(rateForLabel(DEFAULT_TIMECODE, rate.label)?.rate.label, rate.label)
})

test('a remembered 59.94 DF opens the Premiere export, which has none, on 59.94 NDF', () => {
  assert.equal(timecodeChoice('fcp7xml', loadFrameRateFrom('59.94 DF').id).id, '59.94 NDF')
  assert.equal(timecodeChoice('edl', loadFrameRateFrom('59.94 DF').id).id, '59.94 DF')
})

function loadFrameRateFrom(id: string) {
  const store = memoryStore()
  writeItem(store, FRAME_RATE_STORAGE_KEY, id)
  return loadFrameRate(store)
}

test('a refused or missing store never throws: reads are empty, writes report false', () => {
  assert.equal(readItem(refusingStore, 'k'), null)
  assert.equal(writeItem(refusingStore, 'k', 'v'), false)
  assert.equal(readItem(null, 'k'), null)
  assert.equal(writeItem(null, 'k', 'v'), false)
  assert.equal(loadFrameRate(refusingStore), DEFAULT_TIMECODE)
  assert.equal(saveFrameRate(refusingStore, byId('25')), false)
  // Prerendering has no window, so no store.
  assert.equal(browserStore(), null)
})
