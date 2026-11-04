import {resolveEngine} from '../../src/core/engine';
import {createSession} from '../../src/core/session';
import type {TempogramTuning} from '../../src/core/tempogram';
import {chunkAggregator} from '../../src/core/utils';
import type {CandidateRelation, WorkletMessage} from '../../src/contract/types';
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
 */
export async function streamPcm(
  pcm: Float32Array,
  sampleRate: number,
  options: BenchmarkOptions,
  onMessage: (message: WorkletMessage, heard: number) => void,
  tuning?: Partial<TempogramTuning>,
): Promise<void> {
  const {engine, tempoRange} = resolveEngine(options.engine, options.tempoRange);
  // restartAfterSeconds and tuning are internal: the rows that measure them set them here, past the public option
  const session = createSession({
    engine: {...engine, restartAfterSeconds: options.restartAfterSeconds ?? engine.restartAfterSeconds, tuning},
    tempoRange,
    debug: false,
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
