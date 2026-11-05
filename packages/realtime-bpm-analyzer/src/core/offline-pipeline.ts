import type {BiquadFilterOptions} from './types';
import type {OfflineOptions, OfflineResult} from '../contract/types';
import * as consts from './consts';
import {analyzeSamples} from './offline';

/**
 * Creates a biquad lowpass filter for audio processing.
 *
 * This filter helps isolate low-frequency components (bass) from the audio signal. The `peaks` engine reads
 * the bass, so it runs behind this filter; the default `tempogram` engine takes the full band and needs none.
 *
 * @param context - The AudioContext or OfflineAudioContext to create the filter in
 * @param options - Optional configuration for the filter's frequency and quality
 * @returns A configured BiquadFilterNode ready to use in an audio graph
 *
 * @example
 * ```typescript
 * const audioContext = new AudioContext();
 * const filter = getBiquadFilter(audioContext, {
 *   frequencyValue: 150,  // Hz - frequencies above this are attenuated
 *   qualityValue: 1       // Q factor - steepness of the filter
 * });
 *
 * // Use in an audio graph
 * source.connect(filter);
 * filter.connect(audioContext.destination);
 * ```
 *
 * @remarks
 * - Default frequency is optimized for detecting bass drum kicks
 * - The lowpass filter attenuates high frequencies while preserving low frequencies
 * - Higher Q values create a steeper filter curve
 *
 * @see {@link analyzeFullBuffer} which uses this filter internally with `engine: 'peaks'`
 * @see {@link BiquadFilterOptions} for configuration options
 *
 * @group Functions
 */
export function getBiquadFilter(
  context: OfflineAudioContext | AudioContext,
  options?: BiquadFilterOptions,
): BiquadFilterNode {
  const lowpass = context.createBiquadFilter();

  lowpass.type = 'lowpass';
  lowpass.frequency.value = options?.frequencyValue ?? consts.frequencyValue;
  lowpass.Q.value = options?.qualityValue ?? consts.qualityValue;

  return lowpass;
}

/**
 * Apply to the source a biquad lowpass filter
 * @param buffer - Audio buffer
 * @param options - Optionnal BiquadFilterOptions
 * @returns A Promise that resolves an AudioBuffer instance
 * @internal
 */
export async function getOfflineLowPassSource(
  buffer: AudioBuffer,
  options?: BiquadFilterOptions,
): Promise<AudioBuffer> {
  const {length, numberOfChannels, sampleRate} = buffer;
  const offlineAudioContext = new OfflineAudioContext(
    numberOfChannels,
    length,
    sampleRate,
  );

  /**
   * Create buffer source
   */
  const source = offlineAudioContext.createBufferSource();
  source.buffer = buffer;

  const lowpass = getBiquadFilter(offlineAudioContext, options);

  /**
   * Pipe the song into the filter, and the filter into the offline context
   */
  source.connect(lowpass);
  lowpass.connect(offlineAudioContext.destination);

  source.start(0);

  const audioBuffer = await offlineAudioContext.startRendering();

  return audioBuffer;
}

/**
 * Detects the tempo of a whole decoded file at once.
 *
 * @param originalBuffer - The decoded audio. Channel 0 is analysed.
 * @param options - The engine (default `tempogram`; lowpass settings for `peaks`) and the tempo range
 * @returns The reading, the same shape as a realtime one, or null when no tempo was found
 * @throws {Error} When the buffer is empty or its sample rate is not positive
 * @throws {RangeError} When `engine` or `tempoRange` is invalid
 *
 * @example
 * ```typescript
 * const audioBuffer = await audioContext.decodeAudioData(await (await fetch('song.mp3')).arrayBuffer());
 * const reading = await analyzeFullBuffer(audioBuffer);
 * console.log(reading?.bpm, reading?.candidates);
 * ```
 *
 * @remarks
 * The tempogram searches `tempoRange` (default 90-180); `peaks` folds into it by doubling or halving. `audio` spans
 * the whole buffer.
 *
 * @see {@link createRealtimeBpmAnalyzer} for live audio
 *
 * @group Functions
 */
export async function analyzeFullBuffer(
  originalBuffer: AudioBuffer,
  options?: OfflineOptions,
): Promise<OfflineResult> {
  if (!originalBuffer || originalBuffer.length === 0) {
    throw new Error('Invalid audio buffer: buffer is empty or undefined.');
  }

  if (originalBuffer.sampleRate <= 0) {
    throw new Error(
      `Invalid sample rate: ${originalBuffer.sampleRate}. Sample rate must be positive.`,
    );
  }

  // The lowpass runs in an OfflineAudioContext here, and in plain JS in Node: the rest is shared
  return analyzeSamples(originalBuffer.getChannelData(0), originalBuffer.sampleRate, options, async lowpass => {
    const filtered = await getOfflineLowPassSource(originalBuffer, lowpass);
    return filtered.getChannelData(0);
  });
}
