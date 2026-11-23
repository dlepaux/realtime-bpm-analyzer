// The strobe's demo track: 30 s of techno at 128 BPM, rendered in the page from the
// score below with an OfflineAudioContext. Rendering beats shipping a file: no encoder, no
// download, no rights question, and the kick times are the score's, so the browser measurement
// has its ground truth. Its shape shows the feature: a clear kick, a breakdown where the kicks
// and the flashes stop, then the drop. Types are the slice of Web Audio used here, so the score
// and the scheduling are tested in Node (scripts/demo-track.test.ts).

export const DEMO_BPM = 128
const BEAT = 60 / DEMO_BPM
const BAR = 4 * BEAT
const INTRO_BARS = 6
const BREAKDOWN_BARS = 4
const DROP_BARS = 6
export const DEMO_SECONDS = (INTRO_BARS + BREAKDOWN_BARS + DROP_BARS) * BAR
/** The reverb-free tail after the last bar, so the last kick and the pad ring out. */
const TAIL_SECONDS = 1.5

/**
 * Peak levels before the master gain. The bass shares the kick's band (30 to 150 Hz) on the
 * offbeats, so it stays well under the kick: the library takes a jump within 6 dB of the loudest
 * recent kick for a kick, and the score's kicks are the measurement's ground truth.
 */
export const DEMO_LEVELS = { kick: 1, bass: 0.32 } as const

/** The kick's pitch sweep: a click at its top, the body at its bottom, all under 150 Hz. */
export const KICK_HZ = [150, 48] as const

type Note = { time: number; hz: number; length: number }
export type DemoScore = {
  kicks: number[]
  hats: { time: number; open: boolean }[]
  claps: number[]
  bass: Note[]
  pad: Note[]
  breakdown: { start: number; end: number }
}

// A minor, one chord a bar: Am, F, C, G. Bass roots stay in 50 to 130 Hz; the pad sits above 170.
const BASS = [55, 87.31, 65.41, 98]
const PAD = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [196, 261.63, 329.63],
  [196, 246.94, 293.66],
]

/** The track as data: every event's time in seconds from the start. */
export function demoScore(): DemoScore {
  const score: DemoScore = { kicks: [], hats: [], claps: [], bass: [], pad: [], breakdown: { start: INTRO_BARS * BAR, end: (INTRO_BARS + BREAKDOWN_BARS) * BAR } }
  for (let bar = 0; bar < INTRO_BARS + BREAKDOWN_BARS + DROP_BARS; bar++) {
    const at = bar * BAR
    const chord = bar % 4
    const inBreakdown = bar >= INTRO_BARS && bar < INTRO_BARS + BREAKDOWN_BARS
    const inDrop = bar >= INTRO_BARS + BREAKDOWN_BARS
    if (inBreakdown || inDrop) score.pad.push(...(PAD[chord] as number[]).map((hz) => ({ time: at, hz, length: BAR })))
    if (inBreakdown) continue
    for (let beat = 0; beat < 4; beat++) {
      const time = at + beat * BEAT
      score.kicks.push(time)
      if (bar >= 1) score.hats.push({ time: time + BEAT / 2, open: true })
      if (inDrop) score.hats.push({ time: time + BEAT / 4, open: false }, { time: time + (3 * BEAT) / 4, open: false })
      if ((inDrop || bar >= 4) && beat % 2 === 1) score.claps.push(time)
      if (bar >= 2) score.bass.push({ time: time + BEAT / 2, hz: BASS[chord] as number, length: BEAT * 0.4 })
    }
  }
  return score
}

// ── Rendering ───────────────────────────────────────────────────────────────────────────────

type Param = {
  value: number
  setValueAtTime(value: number, time: number): unknown
  linearRampToValueAtTime(value: number, time: number): unknown
  exponentialRampToValueAtTime(value: number, time: number): unknown
}
type Node = { connect(target: never): unknown }
type Scheduled = Node & { start(when: number): void; stop(when: number): void }
type Oscillator = Scheduled & { type: string; frequency: Param; detune: Param }
type Gain = Node & { gain: Param }
type Filter = Node & { type: string; frequency: Param; Q: Param }
type Noise = Scheduled & { buffer: unknown; loop: boolean }

/** The part of an OfflineAudioContext the renderer uses; `R` is what its rendering resolves to. */
export type DemoContext<R = unknown> = {
  sampleRate: number
  destination: unknown
  createOscillator(): Oscillator
  createGain(): Gain
  createBiquadFilter(): Filter
  createBufferSource(): Noise
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array }
  startRendering(): Promise<R>
}

/** The number of samples the track renders to, at `sampleRate`. */
export const demoLength = (sampleRate: number) => Math.ceil((DEMO_SECONDS + TAIL_SECONDS) * sampleRate)

const link = (from: Node, to: unknown) => from.connect(to as never)

/** An envelope on a new gain: up to `peak` in `attack`, then down to silence by `end`. */
function envelope(context: DemoContext, time: number, peak: number, attack: number, end: number): Gain {
  const amp = context.createGain()
  amp.gain.setValueAtTime(0, time)
  amp.gain.linearRampToValueAtTime(peak, time + attack)
  amp.gain.exponentialRampToValueAtTime(0.0001, end)
  return amp
}

function kick(context: DemoContext, out: Gain, time: number) {
  const body = context.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(KICK_HZ[0], time)
  body.frequency.exponentialRampToValueAtTime(KICK_HZ[1], time + 0.11)
  const amp = envelope(context, time, DEMO_LEVELS.kick, 0.002, time + 0.42)
  link(body, amp)
  link(amp, out)
  body.start(time)
  body.stop(time + 0.45)
}

/** A fixed noise buffer, filtered for hats, claps and the riser. */
function noiseBuffer(context: DemoContext) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const data = buffer.getChannelData(0)
  let seed = 1
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    data[i] = seed / 2 ** 31 - 1
  }
  return buffer
}

function noise(context: DemoContext, buffer: unknown, time: number, length: number, filter: Filter, amp: Gain, out: Gain) {
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  link(source, filter)
  link(filter, amp)
  link(amp, out)
  source.start(time)
  source.stop(time + length)
}

function filter(context: DemoContext, type: string, hz: number, q = 0.7) {
  const made = context.createBiquadFilter()
  made.type = type
  made.frequency.value = hz
  made.Q.value = q
  return made
}

function synth(context: DemoContext, out: Gain, note: Note, type: string, detune: number, cutoff: number, peak: number, attack: number) {
  const osc = context.createOscillator()
  osc.type = type
  osc.frequency.value = note.hz
  osc.detune.value = detune
  const lowpass = filter(context, 'lowpass', cutoff, 1)
  const amp = envelope(context, note.time, peak, attack, note.time + note.length)
  link(osc, lowpass)
  link(lowpass, amp)
  link(amp, out)
  osc.start(note.time)
  osc.stop(note.time + note.length + 0.05)
}

/** Schedules every event of `score` on `context`; resolves to the rendered track. */
export function renderDemo<R>(context: DemoContext<R>, score: DemoScore = demoScore()): Promise<R> {
  const master = context.createGain()
  master.gain.value = 0.55
  link(master, context.destination)
  const buffer = noiseBuffer(context)
  for (const time of score.kicks) kick(context, master, time)
  for (const { time, open } of score.hats) {
    const length = open ? 0.16 : 0.05
    noise(context, buffer, time, length, filter(context, 'highpass', open ? 7000 : 9000), envelope(context, time, open ? 0.16 : 0.08, 0.001, time + length), master)
  }
  for (const time of score.claps) {
    noise(context, buffer, time, 0.25, filter(context, 'bandpass', 1400, 1.2), envelope(context, time, 0.5, 0.004, time + 0.22), master)
  }
  for (const note of score.bass) synth(context, master, note, 'sawtooth', 0, 420, DEMO_LEVELS.bass, 0.012)
  for (const note of score.pad) {
    for (const detune of [-9, 9]) synth(context, master, note, 'sawtooth', detune, 1500, 0.05, note.time >= score.breakdown.end ? 0.02 : 0.6)
  }
  // The riser: noise opening up over the breakdown's last bar, into the drop.
  const riseFrom = score.breakdown.end - BAR
  const sweep = filter(context, 'bandpass', 400, 2)
  sweep.frequency.setValueAtTime(400, riseFrom)
  sweep.frequency.exponentialRampToValueAtTime(7000, score.breakdown.end)
  const swell = context.createGain()
  swell.gain.setValueAtTime(0.0001, riseFrom)
  swell.gain.exponentialRampToValueAtTime(0.35, score.breakdown.end - 0.02)
  swell.gain.linearRampToValueAtTime(0, score.breakdown.end)
  noise(context, buffer, riseFrom, BAR, sweep, swell, master)
  return context.startRendering()
}
