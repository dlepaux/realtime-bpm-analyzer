import {RealTimeBpmAnalyzer} from '../../src/core/realtime-bpm-analyzer';
import {createTempogramDetector} from '../../src/core/tempogram';
import type {TempogramTuning} from '../../src/core/tempogram';
import {chunkAggregator} from '../../src/core/utils';
import type {ProcessorOutputEvent, RealTimeBpmAnalyzerParameters} from '../../src/core/types';
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
 * Feeds PCM through the same steps as `RealTimeBpmProcessor.process()`, a render quantum at a
 * time, and records the events in the order a listener would have got them.
 * @param pcm Mono samples as the worklet would receive them
 * @param sampleRate Sample rate in Hz
 * @param options The analyzer options
 * @param onEvent Called with each event and the seconds of audio heard so far
 * @param tuning Tempogram overrides, for tuning runs on dev
 */
export async function streamPcm(
  pcm: Float32Array,
  sampleRate: number,
  options: RealTimeBpmAnalyzerParameters,
  onEvent: (event: ProcessorOutputEvent, heard: number) => void,
  tuning?: Partial<TempogramTuning>,
): Promise<void> {
  const analyzer = new RealTimeBpmAnalyzer(options);

  if (tuning) {
    analyzer.tempogram = createTempogramDetector({sampleRate, tempoRange: options.tempoRange, tuning});
  }

  const aggregate = chunkAggregator();

  for (let start = 0; start + renderQuantum <= pcm.length; start += renderQuantum) {
    const {isBufferFull, buffer, bufferSize} = aggregate(pcm.subarray(start, start + renderQuantum));

    if (isBufferFull) {
      const heard = (start + renderQuantum) / sampleRate;

      await analyzer.analyzeChunk({
        audioSampleRate: sampleRate,
        channelData: buffer,
        bufferSize,
        postMessage: event => {
          onEvent(event, heard);
        },
      });
    }
  }
}

export type Reading = readonly [heard: number, tempo: number, confidence: number];

/** Candidates kept from the last `bpm` event: enough to see the other metrical level, not the tail */
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
 * @returns What the listener saw
 */
export async function listen(
  track: Track,
  pcm: Float32Array,
  sampleRate: number,
  options: RealTimeBpmAnalyzerParameters,
  tuning?: Partial<TempogramTuning>,
): Promise<TrackResult> {
  let final: number | null = null;
  let firstReadingAt: number | null = null;
  let firstCorrectAt: number | null = null;
  let candidates: ReadonlyArray<readonly [number, number]> = [];
  let readings: readonly Reading[] = [];
  const stable: Array<readonly [number, number]> = [];

  await streamPcm(pcm, sampleRate, options, (event, heard) => {
    if (event.type !== 'bpm' && event.type !== 'bpmStable') {
      return;
    }

    const top = event.data.bpm[0]?.tempo;

    if (top === undefined) {
      return;
    }

    if (event.type === 'bpmStable') {
      stable.push([heard, top]);
      return;
    }

    final = top;
    firstReadingAt ??= heard;
    candidates = event.data.bpm.slice(0, keptCandidates).map(({tempo, confidence}) => [tempo, confidence] as const);
    readings = withReading(readings, [heard, top, event.data.bpm[0].confidence]);

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
    readings,
  };
}
