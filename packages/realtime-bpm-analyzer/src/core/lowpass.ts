import type {LowpassOption} from '../contract/types';
import * as consts from './consts';

/** The only keys a lowpass settings object may carry */
const settingNames: ReadonlySet<string> = new Set(['frequency', 'q']);

/**
 * The settings take `frequency` and `q` and nothing else, so a key the filter would not apply fails at once
 * instead of being dropped. TypeScript lets such keys through: the DOM's `BiquadFilterOptions` shares
 * `frequency`, so one of those objects passes as a `LowpassOption`, and so does any variable holding a typo.
 * Refusing a key after 6.1.0 would break callers, while accepting one later would not. These are the names a
 * caller is likely to reach for, each with what to use instead; any other key gets {@link unknownSetting}.
 */
const refusedSettings: ReadonlyMap<string, string> = new Map([
  ['frequencyValue', 'was removed in v6: use frequency'],
  ['qualityValue', 'was removed in v6: use q'],
  ['Q', "is the DOM's spelling: use q"],
  ['detune', "is the DOM's, and has no equivalent here: fold it into frequency (frequency × 2^(detune/1200))"],
  ['type', "is the DOM's: this filter is always a lowpass, so drop it"],
  ['gain', "is the DOM's: a lowpass has no gain, so drop it"],
]);

const unknownSetting = 'is unknown: the settings are frequency and q';

/**
 * What a value is, for an error message that names the type and never echoes the caller's data
 * @param value Any value
 * @returns `null`, `an array`, or the `typeof` with its article, such as `a number`
 */
function kindOf(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'an array';
  }

  const type = typeof value;
  return `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}`;
}

/**
 * The settings as an object, or none for the defaults. `null` means the defaults as `undefined` does, as in 5.x.
 * Any other non-object (an array included, which `typeof` calls an object) would otherwise be read as having no
 * keys and silently give the defaults.
 * @param options The caller's settings
 * @returns The settings, empty for the defaults
 * @throws {TypeError} When the settings are not an object, `null` or `undefined`
 */
function settingsObject(options: unknown): Readonly<Record<string, unknown>> {
  if (options === undefined || options === null) {
    return {};
  }

  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(`The lowpass settings are an object with frequency and q, not ${kindOf(options)}.`);
  }

  return options as Record<string, unknown>;
}

/**
 * One setting, or its default when it is absent or `undefined`
 * @param name The setting's name
 * @param value The caller's value
 * @param fallback The default
 * @returns A finite number
 * @throws {TypeError} When the value is not a number, a numeric string included
 * @throws {RangeError} When the value is `NaN` or infinite
 */
function finiteSetting(name: string, value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number') {
    throw new TypeError(`The lowpass setting ${name} is ${kindOf(value)}: it must be a finite number.`);
  }

  if (!Number.isFinite(value)) {
    throw new RangeError(`The lowpass setting ${name} ${value} is not a finite number.`);
  }

  return value;
}

/**
 * The lowpass settings with their defaults, checked once for every path that builds the filter (the
 * BiquadFilterNode, the OfflineAudioContext render and the plain-JS biquad, and `engine.lowpass` before either), so
 * all of them refuse the same input. A key is refused by its presence, whatever its value, `undefined` included, so
 * whether a call throws doesn't depend on the data. The keys checked are the object's own enumerable string keys,
 * those `Object.keys` lists.
 *
 * The cutoff must lie strictly between 0 and Nyquist. Web Audio, and 5.x after it, clamps it there instead: 0 or
 * below gives silence and Nyquist or above turns the filter off, both without a word. Refusing such a value after
 * 6.1.0 would break callers, while accepting one later would not. The defaults pass at any rate above 400 Hz, so at
 * every rate a Web Audio context takes (3 kHz and up in Chrome; the spec requires 8 to 96 kHz). `q` has no range:
 * any finite value is a filter, if an extreme one.
 * @param options The caller's settings, from TypeScript or plain JS
 * @param sampleRate The rate the filter runs at, in Hz
 * @returns The cutoff in Hz and the Q in dB
 * @throws {TypeError} When the settings are not an object, `null` or `undefined`, carry a key other than `frequency`
 * and `q` (naming it), or hold a setting that is not a number
 * @throws {RangeError} When the sample rate is not positive, a setting is `NaN` or infinite, or the frequency is not
 * above 0 and below half the sample rate
 */
export function resolveLowpass(options: unknown, sampleRate: number): {frequency: number; q: number} {
  const settings = settingsObject(options);
  const refused = Object.keys(settings).find(key => !settingNames.has(key));
  if (refused !== undefined) {
    throw new TypeError(`The lowpass setting ${refused} ${refusedSettings.get(refused) ?? unknownSetting}.`);
  }

  const frequency = finiteSetting('frequency', settings.frequency, consts.lowpassFrequency);
  const q = finiteSetting('q', settings.q, consts.lowpassQ);

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError(`Invalid sample rate: ${sampleRate}. Sample rate must be positive.`);
  }

  const nyquist = sampleRate / 2;
  if (!(frequency > 0 && frequency < nyquist)) {
    throw new RangeError(`The lowpass setting frequency ${frequency} is out of range: at a sample rate of ${sampleRate} Hz, `
      + `it must be above 0 and below ${nyquist} Hz.`);
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
  // resolveLowpass keeps the cutoff strictly inside (0, Nyquist), so the ends Web Audio clamps and special-cases
  // never reach this formula
  const w0 = Math.PI * (frequency / (sampleRate / 2));
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
 * @throws {TypeError} When the settings are not an object, `null` or `undefined`, carry a key other than `frequency`
 * and `q`, or hold a setting that is not a number
 * @throws {RangeError} When the sample rate is not positive, a setting is `NaN` or infinite, or the frequency is not
 * above 0 and below half the sample rate
 */
export function applyLowpass(
  channelData: Float32Array,
  sampleRate: number,
  options?: LowpassOption,
): Float32Array {
  const {frequency, q} = resolveLowpass(options, sampleRate);
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
