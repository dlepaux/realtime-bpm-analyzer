// Run with `npm test`. The strobe's demo track (RBA-237) is rendered in the page from a score, so
// its kicks are known: they are the ground truth of the browser measurement. These check the score
// has the shape the card asks for (a clear kick, a breakdown with none, then the drop), and that
// the renderer plays a kick at each of the score's times and nowhere else.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEMO_BPM, DEMO_LEVELS, DEMO_SECONDS, KICK_HZ, demoScore, renderDemo, type DemoContext } from '../.vitepress/tools/demo-track.ts'

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

test('the bass, the only other part in the detector\'s band, plays the offbeats and stays well under the kick', () => {
  // A sawtooth's fundamental is 2/π of its peak (its second harmonic, also in band, adds about
  // 3 dB); the library takes a jump within 6 dB of the loudest recent kick for a kick, so the
  // bass's fundamental keeps at least 8 dB under it.
  const db = 20 * Math.log10((DEMO_LEVELS.bass * 2) / Math.PI / DEMO_LEVELS.kick)
  assert.ok(db <= -8, `the bass is ${db.toFixed(1)} dB under the kick`)
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

/** A context that records the graph: which node connects to which, and each gain's first set value. */
function graphContext() {
  type Made = { kind: string; started: boolean; gain: { value: number; first: number }; edges: Made[] }
  const nodes: Made[] = []
  const param = () => {
    const made = { value: 1, first: Number.NaN, setValueAtTime(value: number) { if (Number.isNaN(made.first)) made.first = value; return made }, linearRampToValueAtTime: () => made, exponentialRampToValueAtTime: () => made }
    return made
  }
  const node = (kind: string) => () => {
    const made = {
      kind, started: false, edges: [] as Made[], gain: param(), frequency: param(), Q: param(), detune: param(), type: '', buffer: null, loop: false,
      connect: (target: Made) => { made.edges.push(target); return target },
      start: () => { made.started = true },
      stop: () => undefined,
    }
    nodes.push(made)
    return made
  }
  const destination = node('destination')()
  const context = {
    sampleRate: 48_000, destination,
    createOscillator: node('oscillator'), createGain: node('gain'), createBiquadFilter: node('filter'), createBufferSource: node('source'),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    startRendering: async () => ({}),
  } as unknown as DemoContext
  return { context, nodes, destination }
}

test('every sound reaches the speakers, and only through an envelope that starts silent: a kick has an attack to hear', async () => {
  const { context, nodes, destination } = graphContext()
  await renderDemo(context, score)
  type Made = (typeof nodes)[number]
  // Each path from a source to the destination, as the nodes it passes through.
  const paths = (from: Made, seen: Made[] = []): Made[][] =>
    from === destination ? [seen] : from.edges.flatMap((to) => paths(to, [...seen, from]))
  const silentAtFirst = (n: Made) => n.kind === 'gain' && n.gain.first < 1e-3
  const sources = nodes.filter((n) => n.started)
  assert.ok(sources.length > score.kicks.length, `${sources.length} sources`)
  for (const source of sources) {
    const reaching = paths(source)
    assert.ok(reaching.length > 0, `a ${source.kind} reaches the destination`)
    for (const path of reaching) assert.ok(path.some(silentAtFirst), `a ${source.kind} reaches it through ${path.map((n) => n.kind).join(' → ')}, with no envelope`)
  }
})
