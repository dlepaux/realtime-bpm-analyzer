import type {LowpassOption} from '../contract/types';
import * as consts from './consts';

/** The 5.x setting names, with their v6 names: unrefused, they would be ignored without a word */
const removedSettings: Readonly<Record<string, string>> = Object.freeze({
  frequencyValue: 'frequency',
  qualityValue: 'q',
});

/**
 * The lowpass settings with their defaults, checked once for every path that builds the filter (the
 * BiquadFilterNode, the OfflineAudioContext render and the plain-JS biquad), so all three refuse the same input
 * @param options The caller's settings
 * @returns The cutoff in Hz and the Q in dB
 * @throws {TypeError} When a 5.x setting name is set
 * @throws {RangeError} When the frequency or Q is not a finite number
 */
export function resolveLowpass(options: LowpassOption | undefined): {frequency: number; q: number} {
  const given: Record<string, unknown> = options ?? {};
  const removed = Object.keys(removedSettings).find(name => given[name] !== undefined);
  if (removed !== undefined) {
    throw new TypeError(`The lowpass setting ${removed} was removed in v6: use ${removedSettings[removed]}.`);
  }

  const frequency = options?.frequency ?? consts.lowpassFrequency;
  const q = options?.q ?? consts.lowpassQ;
  if (!Number.isFinite(frequency) || !Number.isFinite(q)) {
    throw new RangeError(`Invalid lowpass settings: frequency ${frequency}, q ${q}. Both must be finite numbers.`);
  }

  return {frequency, q};
}

/**
 * Normalised biquad coefficients (a0 divided out)
 */
type BiquadCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

/**
 * Lowpass coefficients exactly as the Web Audio spec defines them for a BiquadFilterNode
 * of type `lowpass`, so the plain-JS path reproduces what `getBiquadFilter` renders.
 * Unlike the Audio EQ Cookbook, Web Audio reads the lowpass Q in dB.
 * @see https://webaudio.github.io/web-audio-api/#filters-characteristics
 * @param frequency Cutoff in Hz
 * @param q Resonance in dB
 * @param sampleRate Sample rate in Hz
 * @returns Normalised coefficients
 */
export function lowpassCoefficients(
  frequency: number,
  q: number,
  sampleRate: number,
): BiquadCoefficients {
  // Web Audio clamps the cutoff to [0, Nyquist] and special-cases both ends
  const normalised = Math.min(Math.max(frequency / (sampleRate / 2), 0), 1);

  if (normalised === 1) {
    return {b0: 1, b1: 0, b2: 0, a1: 0, a2: 0};
  }

  if (normalised === 0) {
    return {b0: 0, b1: 0, b2: 0, a1: 0, a2: 0};
  }

  const w0 = Math.PI * normalised;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * (10 ** (q / 20)));
  const a0 = 1 + alpha;

  return {
    b0: ((1 - cosW0) / 2) / a0,
    b1: (1 - cosW0) / a0,
    b2: ((1 - cosW0) / 2) / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
}

/**
 * Applies the same biquad lowpass the browser pipeline renders through an OfflineAudioContext,
 * in plain JavaScript, so tempo detection runs where Web Audio does not exist (Node).
 * @param channelData PCM samples of one channel
 * @param sampleRate Sample rate in Hz
 * @param options The cutoff and Q, as `getBiquadFilter` takes them, defaulting to the browser pipeline's values
 * @returns A new filtered array, the input is left untouched
 * @throws {TypeError} When a 5.x setting name is set
 * @throws {RangeError} When the sample rate, frequency or Q is not a usable number
 */
export function applyLowpass(
  channelData: Float32Array,
  sampleRate: number,
  options?: LowpassOption,
): Float32Array {
  const {frequency, q} = resolveLowpass(options);

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`Invalid sample rate: ${sampleRate}. Sample rate must be positive.`);
  }

  const {b0, b1, b2, a1, a2} = lowpassCoefficients(frequency, q, sampleRate);
  const output = new Float32Array(channelData.length);
  // Double-precision state, as browsers keep it, so the long recursion does not drift
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < channelData.length; i += 1) {
    const x0 = channelData[i];
    const y0 = (b0 * x0) + (b1 * x1) + (b2 * x2) - (a1 * y1) - (a2 * y2);
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}
