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
    analyzer.tempogram = createTempogramDetector({sampleRate, tuning});
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

    if (firstCorrectAt === null && isCorrect(top, track.bpm)) {
      firstCorrectAt = heard;
    }
  }, tuning);

  return {
    set: track.set,
    id: track.id,
    genre: track.genre,
    truth: track.bpm,
    duration: pcm.length / sampleRate,
    final,
    firstReadingAt,
    firstCorrectAt,
    stable,
  };
}
