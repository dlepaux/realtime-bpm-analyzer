// Run with `npm test`. The strobe's demo track (RBA-237) is rendered in the page from a score, so
// its kicks are known: they are the ground truth of the browser measurement. These check the score
// has the shape the card asks for (a clear kick, a breakdown with none, then the drop), and that
// the renderer plays a kick at each of the score's times and nowhere else.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_BPM, DEMO_SECONDS, KICK_HZ, demoScore, renderDemo, type DemoContext } from '../.vitepress/tools/demo-track.ts'

const BEAT = 60 / DEMO_BPM
const score = demoScore()

test('about 30 s: an intro with a kick on every beat, a breakdown with none, then the drop', () => {
  assert.ok(DEMO_SECONDS >= 28 && DEMO_SECONDS <= 32, `${DEMO_SECONDS} s`)
  const { breakdown } = score
  assert.ok(breakdown.start > 8 && breakdown.end - breakdown.start >= 6, JSON.stringify(breakdown))
  assert.equal(score.kicks.filter((t) => t >= breakdown.start && t < breakdown.end).length, 0, 'no kick in the breakdown')
  const beats = (from: number, to: number) => Math.round((to - from) / BEAT)
  assert.equal(score.kicks.filter((t) => t < breakdown.start).length, beats(0, breakdown.start), 'every beat before it')
  assert.equal(score.kicks.filter((t) => t >= breakdown.end).length, beats(breakdown.end, DEMO_SECONDS), 'every beat after it')
  for (const t of score.kicks) assert.ok(Math.abs(t / BEAT - Math.round(t / BEAT)) < 1e-9, `${t} is on a beat`)
  assert.deepEqual([...score.kicks].sort((a, b) => a - b), [...score.kicks], 'in order')
})

test('nothing else in the score sits under a kick in the detector\'s band: the bass plays the offbeats', () => {
  for (const note of score.bass) {
    const offbeat = (note.time / BEAT) % 1
    assert.ok(Math.abs(offbeat - 0.5) < 1e-9, `bass at ${note.time}`)
    assert.ok(note.hz >= 50 && note.hz <= 130, `${note.hz} Hz`)
  }
})

/** A context that records when each oscillator starts and the pitch it starts at: a kick is one at KICK_HZ[0]. */
function recordingContext(): DemoContext & { kicks: number[] } {
  const kicks: number[] = []
  const param = () => {
    const made = { value: 0, first: Number.NaN, setValueAtTime(value: number) { if (Number.isNaN(made.first)) made.first = value; return made }, linearRampToValueAtTime: () => made, exponentialRampToValueAtTime: () => made }
    return made
  }
  const node = () => {
    const made = {
      gain: param(), frequency: param(), Q: param(), detune: param(), type: '', buffer: null, loop: false,
      connect: (target: unknown) => target,
      start: (when: number) => { if (made.frequency.first === KICK_HZ[0]) kicks.push(when) },
      stop: () => undefined,
    }
    return made
  }
  return {
    kicks,
    sampleRate: 48_000,
    destination: node(),
    createOscillator: node,
    createGain: node,
    createBiquadFilter: node,
    createBufferSource: node,
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    startRendering: async () => ({}),
  } as unknown as DemoContext & { kicks: number[] }
}

test('the renderer starts one kick at each of the score\'s times, and no other', async () => {
  const context = recordingContext()
  await renderDemo(context, score)
  assert.deepEqual(context.kicks, score.kicks)
})
