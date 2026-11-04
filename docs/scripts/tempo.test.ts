// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_TAPS,
  TAP_TIMEOUT_MS,
  clickKind,
  estimateTapTempo,
  msToBpm,
  noteMs,
  parseBpmParam,
  pushTap,
  tempoMarking,
  withBpmParam,
  writeBpmToUrl,
} from '../.vitepress/tools/tempo.ts'

const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not ${expected}`)

test('noteMs: a quarter at 120 BPM is 500 ms, and the feels scale it', () => {
  close(noteMs(120, 4), 500)
  close(noteMs(120, 1), 2000)
  close(noteMs(120, 8, 'dotted'), 375)
  close(noteMs(120, 8, 'triplet'), 500 / 3)
  close(noteMs(128, 16), 117.1875)
})

test('msToBpm inverts noteMs for every note value and feel', () => {
  for (const division of [1, 2, 4, 8, 16, 32, 64] as const) {
    for (const feel of ['straight', 'dotted', 'triplet'] as const) {
      close(msToBpm(noteMs(97.5, division, feel), division, feel), 97.5)
    }
  }
})

test('estimateTapTempo: steady taps give the exact tempo and zero jitter', () => {
  const taps = Array.from({ length: 8 }, (_, i) => 1000 + i * 500)
  const estimate = estimateTapTempo(taps)
  assert.ok(estimate)
  close(estimate.bpm, 120)
  close(estimate.jitter, 0)
})

test('estimateTapTempo: one late tap moves the estimate less than the last interval would', () => {
  const taps = [0, 500, 1000, 1500, 2000, 2500, 3000, 3600]
  const estimate = estimateTapTempo(taps)
  assert.ok(estimate)
  const lastIntervalBpm = 60_000 / 600
  assert.ok(Math.abs(estimate.bpm - 120) < Math.abs(lastIntervalBpm - 120))
  assert.ok(estimate.jitter > 0)
})

test('estimateTapTempo needs two taps', () => {
  assert.equal(estimateTapTempo([]), null)
  assert.equal(estimateTapTempo([42]), null)
})

test('pushTap starts over after a pause and keeps a sliding window', () => {
  assert.deepEqual(pushTap([], 10), [10])
  assert.deepEqual(pushTap([0, 500], 1000), [0, 500, 1000])
  assert.deepEqual(pushTap([0, 500], 500 + TAP_TIMEOUT_MS + 1), [500 + TAP_TIMEOUT_MS + 1])
  // A clock that went backwards (or a duplicate event) cannot extend a sequence.
  assert.deepEqual(pushTap([0, 500], 500), [500])

  let taps: number[] = []
  for (let i = 0; i < MAX_TAPS + 5; i++) taps = pushTap(taps, i * 400)
  assert.equal(taps.length, MAX_TAPS)
  assert.equal(taps[taps.length - 1], (MAX_TAPS + 4) * 400)
})

test('parseBpmParam clamps to the supported range and rejects junk', () => {
  assert.equal(parseBpmParam(null), null)
  assert.equal(parseBpmParam(''), null)
  assert.equal(parseBpmParam('fast'), null)
  assert.equal(parseBpmParam('Infinity'), null)
  assert.equal(parseBpmParam('128'), 128)
  assert.equal(parseBpmParam('127.856'), 127.86)
  assert.equal(parseBpmParam('5'), 20)
  assert.equal(parseBpmParam('900'), 300)
})

test('tempoMarking covers the edges', () => {
  assert.equal(tempoMarking(20), 'Grave')
  assert.equal(tempoMarking(40), 'Largo')
  assert.equal(tempoMarking(119.9), 'Moderato')
  assert.equal(tempoMarking(120), 'Allegro')
  assert.equal(tempoMarking(300), 'Prestissimo')
})

test('clickKind accents the downbeat and marks subdivisions', () => {
  // 3/4 with eighth-note subdivision: ticks 0..5 are one bar.
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((tick) => clickKind(tick, 3, 2)),
    ['accent', 'sub', 'beat', 'sub', 'beat', 'sub', 'accent'],
  )
  assert.deepEqual([0, 1, 2, 3].map((tick) => clickKind(tick, 1, 1)), ['accent', 'accent', 'accent', 'accent'])
})

test('withBpmParam: the tempo in ?bpm=, within the parseBpmParam bounds, other params kept', () => {
  assert.equal(withBpmParam('', 128), '?bpm=128')
  assert.equal(withBpmParam('?bpm=90', 127.856), '?bpm=127.86')
  assert.equal(withBpmParam('?utm_source=x&bpm=90', 140), '?utm_source=x&bpm=140')
  assert.equal(withBpmParam('?bpm=90', 900), '?bpm=300')
  assert.equal(withBpmParam('?bpm=90', 5), '?bpm=20')
  // No valid tempo: the param goes, the rest stays.
  assert.equal(withBpmParam('?bpm=90', null), '')
  assert.equal(withBpmParam('?a=1&bpm=90', Number.NaN), '?a=1')
  for (const bpm of [20, 64.5, 128, 300]) assert.equal(parseBpmParam(new URLSearchParams(withBpmParam('', bpm)).get('bpm')), bpm)
})

function fakeWindow(search: string, replaceState: (url: string) => void) {
  return {
    location: { pathname: '/bpm-to-frames', search, hash: '#chart' },
    history: { state: { kept: true }, replaceState: (_state: unknown, _unused: string, url: string) => replaceState(url) },
  }
}

test('writeBpmToUrl: replaces the address with the tempo, keeping the path and hash', () => {
  const urls: string[] = []
  assert.equal(writeBpmToUrl(fakeWindow('?utm_source=x', (url) => urls.push(url)), 128), true)
  assert.deepEqual(urls, ['/bpm-to-frames?utm_source=x&bpm=128#chart'])
})

test('writeBpmToUrl: no call when the address already holds the tempo', () => {
  let calls = 0
  assert.equal(writeBpmToUrl(fakeWindow('?bpm=128', () => calls++), 128), true)
  assert.equal(calls, 0)
})

test('writeBpmToUrl: a refused replaceState (Safari rate limit) is caught, not thrown', () => {
  const refuse = () => { throw new Error('SecurityError: Attempt to use history.replaceState() more than 100 times per 30 seconds') }
  assert.equal(writeBpmToUrl(fakeWindow('', refuse), 128), false)
})
