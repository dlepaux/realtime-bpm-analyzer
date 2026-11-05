import {createEngine, resolveEngine, toReading} from '../../src/core/engine';
import {createSession} from '../../src/core/session';
import {createTracker} from '../../src/core/tracker';
import {defaultTempogramTuning} from '../../src/core/tempogram';
import type {TempogramTuning} from '../../src/core/tempogram';
import {chunkAggregator} from '../../src/core/utils';
import type {ActiveStatus, CandidateRelation, EngineReason, Hysteresis, WorkletMessage} from '../../src/contract/types';
import type {BenchmarkOptions} from './detectors';
import {isCorrect} from './metrics';
import type {Track, TrackResult} from './types';

/** Web Audio's render quantum: what `process()` receives */
const renderQuantum = 128;

/**
 * @param pcm One pass of a loop
 * @param length Samples wanted
 * @returns Whole passes of the loop, at least `length` samples, so the seam stays where the loop has it
 */
export function repeatTo(pcm: Float32Array, length: number): Float32Array {
  const repeated = new Float32Array(Math.ceil(length / pcm.length) * pcm.length);

  for (let start = 0; start < repeated.length; start += pcm.length) {
    repeated.set(pcm, start);
  }

  return repeated;
}

/**
 * Feeds PCM through the same steps as `RealTimeBpmProcessor.process()`, a render quantum at a time, into the
 * session the worklet runs, and records its messages in the order the main thread would get them.
 * @param pcm Mono samples as the worklet would receive them
 * @param sampleRate Sample rate in Hz
 * @param options The analyzer options
 * @param onMessage Called with each message and the seconds of audio heard so far
 * @param tuning Tempogram overrides, for tuning runs on dev
 * @param hysteresis Hysteresis overrides, for RBA-106's sweep on dev: the contract's values otherwise
 */
export async function streamPcm(
  pcm: Float32Array,
  sampleRate: number,
  options: BenchmarkOptions,
  onMessage: (message: WorkletMessage, heard: number) => void,
  tuning?: Partial<TempogramTuning>,
  hysteresis?: Hysteresis,
): Promise<void> {
  const {engine, tempoRange} = resolveEngine(options.engine, options.tempoRange);
  // restartAfterSeconds and tuning are internal: the rows that measure them set them here, past the public option
  const session = createSession({
    engine: {...engine, restartAfterSeconds: options.restartAfterSeconds ?? engine.restartAfterSeconds, tuning},
    tempoRange,
    debug: false,
    hysteresis,
  });
  const aggregate = chunkAggregator();

  for (let start = 0; start + renderQuantum <= pcm.length; start += renderQuantum) {
    const {isBufferFull, buffer, bufferSize} = aggregate(pcm.subarray(start, start + renderQuantum));

    if (isBufferFull) {
      const heard = (start + renderQuantum) / sampleRate;
      const messages = await session.analyze(buffer, bufferSize, sampleRate);
      messages.forEach(message => {
        onMessage(message, heard);
      });
    }
  }
}

export type Reading = readonly [heard: number, tempo: number, confidence: number];

/** Candidates kept from the last reading: enough to see the other metrical level, not the tail */
const keptCandidates = 5;

/**
 * Keeps a timeline of what a listener saw without one entry per event: only the changes of the top tempo
 * @param readings The timeline so far
 * @param reading The newest top candidate
 * @returns The timeline, the same one when the top tempo did not change
 */
export function withReading(readings: readonly Reading[], reading: Reading): readonly Reading[] {
  return readings.at(-1)?.[1] === reading[1] ? readings : [...readings, reading];
}

/**
 * Listens to a whole track through the streaming path
 * @param track The track and its label
 * @param pcm Mono samples as the worklet would receive them
 * @param sampleRate Sample rate in Hz
 * @param options The analyzer options
 * @param tuning Tempogram overrides, for tuning runs on dev
 * @returns What the listener saw: `stable` holds each move to `locked`, `final` the last reading
 */
export async function listen(
  track: Track,
  pcm: Float32Array,
  sampleRate: number,
  options: BenchmarkOptions,
  tuning?: Partial<TempogramTuning>,
): Promise<TrackResult> {
  let final: number | null = null;
  let firstReadingAt: number | null = null;
  let firstCorrectAt: number | null = null;
  let candidates: ReadonlyArray<readonly [number, CandidateRelation]> = [];
  let confidence: number | null = null;
  let readings: readonly Reading[] = [];
  const stable: Array<readonly [number, number]> = [];

  await streamPcm(pcm, sampleRate, options, (message, heard) => {
    if (message.type !== 'step' || message.status === 'listening') {
      return;
    }

    const {reading} = message;
    const top = reading.bpm;
    if (message.status === 'locked' && message.reason === 'locked') {
      stable.push([heard, top]);
    }

    final = top;
    firstReadingAt ??= heard;
    candidates = reading.candidates.slice(0, keptCandidates).map(({bpm, relation}) => [bpm, relation] as const);
    confidence = reading.confidence;
    readings = withReading(readings, [heard, top, reading.confidence]);

    if (firstCorrectAt === null && isCorrect(top, track.bpm)) {
      firstCorrectAt = heard;
    }
  }, tuning);

  return {
    set: track.set,
    id: track.id,
    genre: track.genre,
    group: track.group,
    ...(track.label === undefined ? {} : {label: track.label}),
    truth: track.bpm,
    duration: pcm.length / sampleRate,
    final,
    firstReadingAt,
    firstCorrectAt,
    stable,
    candidates,
    confidence,
    readings,
  };
}

/** One fresh step of the tempogram, as the session hands it to the tracker, with what its stable rule read */
export type EngineTraceStep = {
  /** Seconds of audio analysed, as the session counts them */
  readonly now: number;
  readonly bpm: number | null;
  /** The confidence `toReading` emits for this step, null without a reading */
  readonly confidence: number | null;
  readonly pulse: boolean;
  readonly lockOffered: boolean;
  /** The frame's own best tempo, 0 when none stands out */
  readonly frameTempo: number;
  /** Salience and lead hold: the stable rule less its agreement over time */
  readonly leads: boolean;
};

const isTempogramDebug = (data: unknown): data is {frameTempo: number; leads: boolean} =>
  typeof data === 'object' && data !== null && 'frameTempo' in data && 'leads' in data;

/**
 * Runs the tempogram alone, the way `createSession` drives it, and keeps what it hands the tracker on each fresh
 * step. Only the tempogram: its steps do not depend on the tracker (its `onReadingLost` does nothing), while peaks'
 * do, so peaks is swept through `streamPcm`. Tests hold the replay of this equal to the session.
 * @param pcm Mono samples as the worklet would receive them
 * @param sampleRate Sample rate in Hz
 * @param options The analyzer options, without a restart: the replay has none
 * @param tuning Tempogram overrides
 * @returns The fresh steps, in order
 */
export async function traceEngine(
  pcm: Float32Array,
  sampleRate: number,
  options: BenchmarkOptions,
  tuning?: Partial<TempogramTuning>,
): Promise<EngineTraceStep[]> {
  const {engine: resolved, tempoRange} = resolveEngine(options.engine, options.tempoRange);
  if (resolved.name !== 'tempogram' || resolved.restartAfterSeconds !== undefined || options.restartAfterSeconds !== undefined) {
    throw new Error('traceEngine replays the tempogram without restarts only: its steps do not depend on the tracker');
  }

  // Debug only adds the engine's detail to each step: what it measures is the same
  const engine = createEngine({...resolved, tuning}, tempoRange, true);
  const aggregate = chunkAggregator();
  const steps: EngineTraceStep[] = [];
  let seconds = 0;

  for (let start = 0; start + renderQuantum <= pcm.length; start += renderQuantum) {
    const {isBufferFull, buffer, bufferSize} = aggregate(pcm.subarray(start, start + renderQuantum));
    if (!isBufferFull) {
      continue;
    }

    const step = await engine.analyze(buffer, bufferSize, sampleRate);
    seconds += bufferSize / sampleRate;
    if (step.fresh) {
      const reading = toReading(step.candidates, {from: 0, to: seconds, contextTime: null}, 'tempogram');
      const detail = isTempogramDebug(step.debug) ? step.debug : {frameTempo: 0, leads: false};
      steps.push({
        now: seconds,
        bpm: reading?.bpm ?? null,
        confidence: reading?.confidence ?? null,
        pulse: step.pulse,
        lockOffered: step.lockOffered,
        frameTempo: detail.frameTempo,
        leads: detail.leads,
      });
    }
  }

  return steps;
}

/**
 * The tempogram's stable rule (`agreesOverTime` in core/tempogram.ts) replayed for another lock band and dwell
 * time: the frame leads, and at least `stableAgreement` of the frames of the last `lockAfterSeconds` agree with its
 * top tempo within `lockBand`. One fresh step is one frame. Tests and the sweep hold it equal to the engine's own.
 * @param steps The tempogram's fresh steps
 * @param lockBand The band
 * @param lockAfterSeconds The dwell time
 * @returns Whether a lock is offered on each step
 */
export function offersOf(steps: readonly EngineTraceStep[], lockBand: number, lockAfterSeconds: number): boolean[] {
  const frames = Math.max(1, Math.round(lockAfterSeconds / defaultTempogramTuning.updateSeconds));

  return steps.map((step, index) => {
    if (!step.leads || step.bpm === null || index + 1 < frames) {
      return false;
    }

    let agreeing = 0;
    for (let i = index + 1 - frames; i <= index; i += 1) {
      agreeing += Math.abs(steps[i].frameTempo - step.bpm) <= lockBand * step.bpm ? 1 : 0;
    }

    return agreeing >= defaultTempogramTuning.stableAgreement * frames;
  });
}

/** What the main thread's state was after one fresh step: its status, the reading it shows, and why it moved */
export type Observation = {
  readonly now: number;
  readonly status: ActiveStatus;
  /** The tempo of the message this step sent, null when it sent none or a listening one */
  readonly bpm: number | null;
  readonly reason?: EngineReason;
};

/**
 * The library's own tracker, fed the steps of `traceEngine` as `createSession` feeds it
 * @param steps The tempogram's fresh steps
 * @param hysteresis The bands and dwell times to replay
 * @param offers The lock offers to replay, the engine's own by default
 * @param visit Called with each step's observation, in order: the sweep scores a row without keeping them
 */
export function visitReplay(
  steps: readonly EngineTraceStep[],
  hysteresis: Hysteresis,
  offers: readonly boolean[] | undefined,
  visit: (observation: Observation, index: number) => void,
): void {
  const tracker = createTracker(hysteresis);

  for (const [index, step] of steps.entries()) {
    const lockOffered = offers?.[index] ?? step.lockOffered;
    const moved = tracker.step({now: step.now, bpm: step.bpm, pulse: step.pulse, lockOffered, acceptLock: () => true});
    // The session sends a settling or locked step only with a reading
    const bpm = moved.status === 'listening' ? null : step.bpm;
    visit({now: step.now, status: moved.status, bpm, ...(moved.reason === undefined ? {} : {reason: moved.reason})}, index);
  }
}

/**
 * `visitReplay`, collected
 * @param steps The tempogram's fresh steps
 * @param hysteresis The bands and dwell times to replay
 * @param offers The lock offers to replay, the engine's own by default
 * @returns One observation per step
 */
export function replayTracker(steps: readonly EngineTraceStep[], hysteresis: Hysteresis, offers?: readonly boolean[]): Observation[] {
  const observations: Observation[] = [];
  visitReplay(steps, hysteresis, offers, observation => observations.push(observation));
  return observations;
}
