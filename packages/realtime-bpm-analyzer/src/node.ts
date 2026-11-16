import type {OfflineOptions, OfflineResult} from './contract/types';
import {applyLowpass} from './core/lowpass';
import {analyzeSamples} from './core/offline';

// Entry point for runtimes without Web Audio (Node, Bun, Deno), published as
// `realtime-bpm-analyzer/node`. It imports nothing that touches Web Audio or the DOM:
// the OfflineAudioContext lowpass is replaced by a plain-JS biquad with the same
// coefficients, and the peak and tempo steps are the browser's own. Decoding stays
// with the caller, so this entry adds no runtime dependency.

export {applyLowpass} from './core/lowpass';
export {RELATION_TOLERANCE} from './contract/types';
export type {
  OfflineOptions,
  OfflineEngineOption,
  LowpassOption,
  OfflineResult,
  EngineName,
  TempoRange,
  Reading,
  Candidate,
  CandidateRelation,
  AudioSpan,
} from './contract/types';

/**
 * Detects the tempo of decoded PCM samples, without Web Audio.
 *
 * The Node counterpart of `analyzeFullBuffer`: the same lowpass coefficients, peak detection, tempogram and
 * reading, so it returns the same reading for the same samples (see the parity tests). `analyzeFullBuffer`
 * analyses channel 0, so pass channel 0 to reproduce it, or a mono downmix of your own.
 *
 * @param channelData - Decoded PCM samples of one channel, in [-1, 1]
 * @param sampleRate - Sample rate of `channelData` in Hz
 * @param options - The engine (default `tempogram`; lowpass settings for `peaks`) and the tempo range, as for
 * `analyzeFullBuffer`
 * @returns A promise of the reading, or null when no tempo was found. The function itself never throws: each error
 * below rejects the promise.
 * @throws {Error} When `channelData` is empty or not a Float32Array
 * @throws {RangeError} When the sample rate, `engine` or `tempoRange` is invalid
 * @throws {TypeError} When the options are not an object or carry a key other than `engine` and `tempoRange` (a 5.x
 * option name included, with its replacement), `tempoRange` carries a key other than `min` and `max`, the `engine`
 * object carries a key other than `name` and `lowpass`, or `engine.lowpass` is not an object, `null` or `undefined`,
 * carries a key other than `frequency` and `q`, or holds a setting that is not a number. A key's presence is the
 * error, whatever its value
 * @throws {RangeError} When an `engine.lowpass` setting is `NaN` or infinite, its frequency is not above 0 and
 * below half the samples' sample rate, or its `q` is not from -758 to 770 dB
 *
 * @example
 * ```typescript
 * import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
 *
 * // channelData: Float32Array from any decoder (ffmpeg, a WAV reader, ...)
 * const reading = await analyzeChannelData(channelData, 44100);
 * console.log('Detected BPM:', reading?.bpm);
 * ```
 *
 * @group Functions
 */
export async function analyzeChannelData(
  channelData: Float32Array,
  sampleRate: number,
  options?: OfflineOptions,
): Promise<OfflineResult> {
  if (!(channelData instanceof Float32Array) || channelData.length === 0) {
    throw new Error('Invalid channel data: expected a non-empty Float32Array.');
  }

  return analyzeSamples(channelData, sampleRate, options, async lowpass => applyLowpass(channelData, sampleRate, lowpass));
}
