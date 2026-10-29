import type {Tempo, AnalyzeFullBufferOptions} from './core/types';
import {resolveTempoRange} from './core/tempo';
import {applyLowpass} from './core/lowpass';
import {detectTempo} from './core/detect-tempo';

// Entry point for runtimes without Web Audio (Node, Bun, Deno), published as
// `realtime-bpm-analyzer/node`. It imports nothing that touches Web Audio or the DOM:
// the OfflineAudioContext lowpass is replaced by a plain-JS biquad with the same
// coefficients, and the peak and tempo steps are the browser's own. Decoding stays
// with the caller, so this entry adds no runtime dependency.

export {applyLowpass} from './core/lowpass';
export type {
  Tempo,
  TempoRange,
  BiquadFilterOptions,
  AnalyzeFullBufferOptions,
} from './core/types';

/**
 * Detects the tempo of decoded PCM samples, without Web Audio.
 *
 * The Node counterpart of `analyzeFullBuffer`: it runs the same lowpass, peak detection and
 * tempo grouping, so it returns the same candidates for the same samples (see the parity
 * tests). `analyzeFullBuffer` analyses channel 0, so pass channel 0 to reproduce it, or a
 * mono downmix of your own.
 *
 * @param channelData - Decoded PCM samples of one channel, in [-1, 1]
 * @param sampleRate - Sample rate of `channelData` in Hz
 * @param options - Optional filter configuration and tempo range, as for `analyzeFullBuffer`
 * @returns A promise that resolves to up to 5 tempo candidates, sorted by `count`
 * @throws {Error} When `channelData` is empty or not a Float32Array
 * @throws {RangeError} When the sample rate, filter options or `options.tempoRange` are invalid
 *
 * @example
 * ```typescript
 * import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
 *
 * // channelData: Float32Array from any decoder (ffmpeg, a WAV reader, ...)
 * const tempos = await analyzeChannelData(channelData, 44100);
 * console.log('Detected BPM:', tempos[0]?.tempo);
 * ```
 *
 * @group Functions
 */
export async function analyzeChannelData(
  channelData: Float32Array,
  sampleRate: number,
  options?: AnalyzeFullBufferOptions,
): Promise<Tempo[]> {
  if (!(channelData instanceof Float32Array) || channelData.length === 0) {
    throw new Error('Invalid channel data: expected a non-empty Float32Array.');
  }

  // Validate before filtering, so a bad range fails fast on long files
  const tempoRange = resolveTempoRange(options?.tempoRange);
  const filtered = applyLowpass(channelData, sampleRate, options);

  return detectTempo(filtered, sampleRate, tempoRange);
}
