import type {LowpassOption, OfflineOptions, OfflineResult} from '../contract/types';
import {resolveLowpass} from './lowpass';
import {analyzeSamples} from './offline';

/**
 * Creates a biquad lowpass filter for audio processing.
 *
 * This filter helps isolate low-frequency components (bass) from the audio signal. The `peaks` engine reads
 * the bass, so it runs behind this filter; the default `tempogram` engine takes the full band and needs none.
 *
 * @param context - The AudioContext or OfflineAudioContext to create the filter in
 * @param options - The cutoff and Q, the same settings as the offline `engine: {name: 'peaks', lowpass}`
 * @returns A configured BiquadFilterNode ready to use in an audio graph
 * @throws {TypeError} When the settings are not an object, `null` or `undefined`, carry a key other than `frequency`
 * and `q` (such as a 5.x name or the DOM's `Q`), or hold a setting that is not a number
 * @throws {RangeError} When a setting is `NaN` or infinite, the frequency is not above 0 and below half the
 * context's sample rate, where Web Audio would clamp it silently, or `q` is not from -758 to 770 dB, where Web
 * Audio's 32-bit resonance term stops being a normal, finite float
 *
 * @example
 * ```typescript
 * const audioContext = new AudioContext();
 * const filter = getBiquadFilter(audioContext, {
 *   frequency: 150, // Hz: frequencies above this are attenuated
 *   q: 1,           // dB: the resonance at the cutoff
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
 * - A higher `q` raises a resonant peak at the cutoff, and steepens the roll-off just past it
 *
 * @see {@link analyzeFullBuffer} which uses this filter internally with `engine: 'peaks'`
 * @see {@link LowpassOption} for the settings and their defaults
 *
 * @group Functions
 */
export function getBiquadFilter(
  context: OfflineAudioContext | AudioContext,
  options?: LowpassOption,
): BiquadFilterNode {
  const {frequency, q} = resolveLowpass(options, context.sampleRate);
  const lowpass = context.createBiquadFilter();

  lowpass.type = 'lowpass';
  lowpass.frequency.value = frequency;
  lowpass.Q.value = q;

  return lowpass;
}

/**
 * Apply to the source a biquad lowpass filter
 * @param buffer - Audio buffer
 * @param options - The lowpass settings, checked at the buffer's sample rate as `getBiquadFilter` checks them
 * @returns A Promise that resolves an AudioBuffer instance
 * @throws {TypeError} As `getBiquadFilter` does
 * @throws {RangeError} As `getBiquadFilter` does, the frequency against half the buffer's sample rate, and `q`
 * outside -758 to 770 dB
 * @internal
 */
export async function getOfflineLowPassSource(
  buffer: AudioBuffer,
  options?: LowpassOption,
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
 * @returns A promise of the reading, the same shape as a realtime one, or null when no tempo was found. The function
 * itself never throws: each error below rejects the promise.
 * @throws {Error} When the buffer is empty or its sample rate is not positive
 * @throws {RangeError} When `engine` or `tempoRange` is invalid
 * @throws {TypeError} When an option has its 5.x name, the `engine` object carries a key other than `name` and
 * `lowpass`, or `engine.lowpass` is not an object, `null` or `undefined`, carries a key other than `frequency` and
 * `q`, or holds a setting that is not a number
 * @throws {RangeError} When an `engine.lowpass` setting is `NaN` or infinite, its frequency is not above 0 and
 * below half the buffer's sample rate, or its `q` is not from -758 to 770 dB
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
