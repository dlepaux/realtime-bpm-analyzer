// Run with `npm test` (node --test, Node's own type stripping; no test framework).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeAndClose, openAnalysis } from '../.vitepress/tools/audio-setup.ts'

function fakeContext(decode: () => Promise<string> = () => Promise.resolve('buffer')) {
  const calls: string[] = []
  return {
    calls,
    context: {
      resume: () => { calls.push('resume'); return Promise.resolve() },
      close: () => { calls.push('close'); return Promise.resolve() },
      decodeAudioData: (_data: ArrayBuffer) => decode(),
    },
  }
}

test('decodeAndClose: closes the context after a decode', async () => {
  const { calls, context } = fakeContext()
  assert.equal(await decodeAndClose(context, new ArrayBuffer(1)), 'buffer')
  assert.deepEqual(calls, ['close'])
})

// RBA-93: every file the browser could not decode left a running context behind.
test('decodeAndClose: closes the context when the decode fails', async () => {
  const { calls, context } = fakeContext(() => Promise.reject(new Error('undecodable')))
  await assert.rejects(decodeAndClose(context, new ArrayBuffer(1)), /undecodable/)
  assert.deepEqual(calls, ['close'])
})

test('openAnalysis: hands back the context and analyzer, and releases nothing', async () => {
  const { calls, context } = fakeContext()
  const opened = await openAnalysis(() => context, () => Promise.resolve('analyzer'), () => calls.push('release'))
  assert.equal(opened.context, context)
  assert.equal(opened.analyzer, 'analyzer')
  assert.deepEqual(calls, ['resume'])
})

// RBA-93: a worklet that failed to load left the context running and, for the mic, the track live.
test('openAnalysis: a failed analyzer closes the context and releases the input', async () => {
  const { calls, context } = fakeContext()
  await assert.rejects(
    openAnalysis(() => context, () => Promise.reject(new Error('worklet refused')), () => calls.push('release')),
    /worklet refused/,
  )
  assert.deepEqual(calls, ['resume', 'release', 'close'])
})

test('openAnalysis: a context that cannot be created still releases the input', async () => {
  const calls: string[] = []
  await assert.rejects(
    openAnalysis(() => { throw new Error('no context') }, () => Promise.resolve('analyzer'), () => calls.push('release')),
    /no context/,
  )
  assert.deepEqual(calls, ['release'])
})
