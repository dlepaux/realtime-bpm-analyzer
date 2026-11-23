// Run with `npm test`. When the BPM tool counts as seen (RBA-298): once per page view, when its
// input area is at least half on screen, and whether that took a scroll. The browser half, a real
// IntersectionObserver, is in analytics-contract.e2e.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENTS, PARAMS } from '../.vitepress/tools/analytics-events.ts'
import { gateEvent } from '../.vitepress/tools/analytics-gate.ts'
import { SEEN_RATIO, toolPageOf, watchToolSeen, type SeenOn, type ToolSeenEnv } from '../.vitepress/tools/tool-seen.ts'

type Entry = { isIntersecting: boolean; intersectionRatio: number }

/** A stand-in for IntersectionObserver and the window's scroll, driven by the test. */
function fakeEnv() {
  const state = {
    callback: null as ((entries: readonly Entry[]) => void) | null,
    threshold: -1,
    observed: [] as unknown[],
    disconnects: 0,
    scrollListeners: new Set<() => void>(),
  }
  const env: ToolSeenEnv = {
    observer: (callback, options) => {
      state.callback = callback
      state.threshold = options.threshold
      return { observe: (target) => state.observed.push(target), disconnect: () => { state.disconnects += 1 } }
    },
    scroll: {
      addEventListener: (_type, listener) => { state.scrollListeners.add(listener) },
      removeEventListener: (_type, listener) => { state.scrollListeners.delete(listener) },
    },
  }
  const report = (ratio: number) => state.callback?.([{ isIntersecting: ratio > 0, intersectionRatio: ratio }])
  const scroll = () => { for (const listener of [...state.scrollListeners]) listener() }
  return { env, state, report, scroll }
}

const target = {} as Element

function watch(env: ToolSeenEnv) {
  const seen: SeenOn[] = []
  const stop = watchToolSeen(target, (on) => seen.push(on), env)
  return { seen, stop }
}

test('it watches the target at half visibility, with no polling', () => {
  const { env, state } = fakeEnv()
  watch(env)
  assert.equal(SEEN_RATIO, 0.5)
  assert.equal(state.threshold, 0.5)
  assert.deepEqual(state.observed, [target])
})

test('half visible in the first report is seen on load, once, and the watch ends', () => {
  const { env, state, report, scroll } = fakeEnv()
  const { seen } = watch(env)
  report(0.8)
  report(0.2)
  report(0.9)
  assert.deepEqual(seen, ['load'])
  assert.equal(state.disconnects, 1)
  assert.equal(state.scrollListeners.size, 0)
  scroll()
  assert.deepEqual(seen, ['load'])
})

test('reached after a scroll is seen on scroll', () => {
  const { env, report, scroll } = fakeEnv()
  const { seen } = watch(env)
  report(0.1)
  scroll()
  report(0.3)
  report(0.5)
  assert.deepEqual(seen, ['scroll'])
})

test('moved into view by the layout alone, with no scroll, is still seen on load', () => {
  const { env, report } = fakeEnv()
  const { seen } = watch(env)
  report(0)
  report(0.6)
  assert.deepEqual(seen, ['load'])
})

test('a scroll before the first report does not make a tool on screen a scroll', () => {
  // A reload restores the scroll position before the observer's first report.
  const { env, report, scroll } = fakeEnv()
  const { seen } = watch(env)
  scroll()
  report(1)
  assert.deepEqual(seen, ['load'])
})

test('stopping before it is seen sends nothing and releases the observer and the listener', () => {
  const { env, state, report } = fakeEnv()
  const { seen, stop } = watch(env)
  report(0.2)
  stop()
  assert.equal(state.disconnects, 1)
  assert.equal(state.scrollListeners.size, 0)
  report(1)
  assert.deepEqual(seen, [])
})

test('the page is named from the address, never sent as one', () => {
  assert.equal(toolPageOf('/'), 'home')
  assert.equal(toolPageOf('/index.html'), 'home')
  assert.equal(toolPageOf('/video-bpm'), 'video-bpm')
  assert.equal(toolPageOf('/video-bpm.html'), 'video-bpm')
  assert.equal(toolPageOf('/video-bpm/'), 'video-bpm')
  assert.equal(toolPageOf('/somewhere/else'), 'other')
})

test('bpm_tool_seen carries the page and how it was seen, and nothing else', () => {
  assert.deepEqual(EVENTS.bpm_tool_seen.params, { page: 'required', seen_on: 'required' })
  assert.deepEqual(PARAMS.seen_on.values, ['load', 'scroll'])
  assert.deepEqual(PARAMS.page.values, ['home', 'video-bpm', 'other'])
  assert.deepEqual(gateEvent('bpm_tool_seen', { page: toolPageOf('/'), seen_on: 'scroll' }), { params: { page: 'home', seen_on: 'scroll' }, problems: [] })
  assert.equal(gateEvent('bpm_tool_seen', { page: '/video-bpm', seen_on: 'load' }).params.page, 'invalid')
})
