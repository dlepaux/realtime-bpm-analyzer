// The conformance inputs: synthetic signals only, built here from a seeded PRNG and closed-form instruments, so
// the set holds no recorded music and anyone can rebuild it. Only the JS generator runs this file: ports read the
// committed 16-bit files in ../inputs, so nothing here is part of the cross-language contract.

/**
 * mulberry32: a small, well-known 32-bit PRNG. Seeded per signal, so each signal is reproducible on its own.
 * @param {number} seed A 32-bit integer
 * @returns {() => number} Uniform values in [-1, 1)
 */
export function noiseSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2) - 1;
  };
}

/** One drum hit or click, added into the mix at a sample offset. Each takes the sample rate and the noise source */
const instruments = {
  // A pitch-dropping sine, the usual synthetic kick: the low band the peaks engine's 200 Hz lowpass keeps
  kick(sampleRate) {
    const length = Math.round(0.3 * sampleRate);
    const out = new Float64Array(length);
    let phase = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      phase += (2 * Math.PI * (50 + (100 * Math.exp(-t / 0.03)))) / sampleRate;
      out[i] = Math.sin(phase) * Math.exp(-t / 0.06);
    }

    return out;
  },
  // Noise with a 190 Hz body: broadband, as a snare is
  snare(sampleRate, noise) {
    const length = Math.round(0.2 * sampleRate);
    const out = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      out[i] = (0.6 * noise() * Math.exp(-t / 0.05)) + (0.4 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.04));
    }

    return out;
  },
  // Differenced noise, so the energy sits high, with a short decay
  hat(sampleRate, noise) {
    const length = Math.round(0.06 * sampleRate);
    const out = new Float64Array(length);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const value = noise();
      out[i] = 0.5 * (value - previous) * Math.exp(-i / sampleRate / 0.012);
      previous = value;
    }

    return out;
  },
  // A metronome's tick: a 1 kHz tone that dies in a few milliseconds, with nothing below 200 Hz (RBA-131's case)
  tick(sampleRate) {
    const length = Math.round(0.02 * sampleRate);
    const out = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      out[i] = Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-t / 0.004);
    }

    return out;
  },
};

/**
 * Hits for a drum pattern, one bar repeated. Each step is [beat within the bar, instrument, gain].
 * Swing delays every off-beat eighth to `swing` of the beat (0.5 is straight, 2/3 the triplet shuffle).
 */
const patterns = {
  fourOnTheFloor: () => [[0, 'kick', 1], [1, 'kick', 1], [2, 'kick', 1], [3, 'kick', 1]],
  rock: swing => [
    [0, 'kick', 1], [1, 'snare', 0.8], [2, 'kick', 1], [2 + swing, 'kick', 0.7], [3, 'snare', 0.8],
    ...[0, 1, 2, 3].flatMap(beat => [[beat, 'hat', 0.5], [beat + swing, 'hat', 0.35]]),
  ],
  house: () => [
    ...[0, 1, 2, 3].flatMap(beat => [[beat, 'kick', 1], [beat + 0.5, 'hat', 0.5]]),
    [1, 'snare', 0.6], [3, 'snare', 0.6],
  ],
  breakbeat: () => [
    [0, 'kick', 1], [1, 'snare', 0.9], [2.5, 'kick', 0.9], [3, 'snare', 0.9],
    ...[0, 1, 2, 3].flatMap(beat => [[beat, 'hat', 0.4], [beat + 0.5, 'hat', 0.3]]),
  ],
  metronome: () => [[0, 'tick', 1], [1, 'tick', 0.7], [2, 'tick', 0.7], [3, 'tick', 0.7]],
};

/**
 * Renders a pattern at a tempo.
 * @param {object} spec The signal's settings
 * @param {number} spec.sampleRate Hz
 * @param {number} spec.seconds Length
 * @param {number} spec.bpm Tempo, in beats per minute
 * @param {Array<[number, string, number]>} spec.steps One bar of the pattern
 * @param {number} spec.seed The noise seed
 * @param {number} [spec.gain] Gain of the whole mix, before the noise bed
 * @param {number} [spec.noiseBed] Level of white noise under the whole signal, 0 for none
 * @returns {Float64Array} The mix, unclipped
 */
function render({sampleRate, seconds, bpm, steps, seed, gain = 0.7, noiseBed = 0}) {
  const length = Math.round(seconds * sampleRate);
  const mix = new Float64Array(length);
  const noise = noiseSource(seed);
  const beatSeconds = 60 / bpm;
  const bars = Math.ceil(seconds / (4 * beatSeconds));
  for (let bar = 0; bar < bars; bar += 1) {
    for (const [beat, name, level] of steps) {
      const start = Math.round(((bar * 4) + beat) * beatSeconds * sampleRate);
      const hit = instruments[name](sampleRate, noise);
      for (let i = 0; i < hit.length && start + i < length; i += 1) {
        mix[start + i] += gain * level * hit[i];
      }
    }
  }

  if (noiseBed > 0) {
    for (let i = 0; i < length; i += 1) {
      mix[i] += noiseBed * noise();
    }
  }

  return mix;
}

/**
 * Quantises to 16-bit PCM, clipping at full scale. Ports read these integers and divide by 32768.
 * @param {Float64Array} mix Samples nominally in [-1, 1]
 * @returns {Int16Array} The PCM
 */
export function toPcm16(mix) {
  const pcm = new Int16Array(mix.length);
  for (let i = 0; i < mix.length; i += 1) {
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mix[i] * 32768)));
  }

  return pcm;
}

/**
 * A signal at a tempo, from a pattern.
 * @param {string} id File name in ../inputs
 * @param {string} description What it is and why it is in the set
 * @param {object} spec The settings {@link render} takes
 * @returns {{id: string, description: string, sampleRate: number, build: () => Float64Array}} The signal
 */
const pattern = (id, description, spec) => ({id, description, sampleRate: spec.sampleRate, build: () => render(spec)});

/**
 * The input set. Each id is the file name in ../inputs. Rates vary so that every rate-dependent size in both
 * engines (FFT size, hop, filter coefficients, interval binning) is exercised at more than one value. Lengths are
 * as short as a reading needs, to keep the committed files under their size budget (see ../readme.md).
 * @type {ReadonlyArray<{id: string, description: string, sampleRate: number, build: () => Float64Array}>}
 */
export const signals = [
  pattern('kick-120-22k', 'Four-on-the-floor kick at 120 BPM, 22.05 kHz, 8 s.',
    {sampleRate: 22_050, seconds: 8, bpm: 120, steps: patterns.fourOnTheFloor(), seed: 1}),
  pattern('house-128-48k', 'House pattern (kick on every beat, off-beat hats, snare on 2 and 4) at 128 BPM, 48 kHz, 8 s.',
    {sampleRate: 48_000, seconds: 8, bpm: 128, steps: patterns.house(), seed: 2}),
  pattern('rock-95-44k', 'Rock pattern with straight eighth hats at 95 BPM, 44.1 kHz, 10 s.',
    {sampleRate: 44_100, seconds: 10, bpm: 95, steps: patterns.rock(0.5), seed: 3}),
  pattern('swing-110-44k', 'Rock pattern with triplet swing (off-beats at 2/3 of the beat) at 110 BPM, 44.1 kHz, 10 s.',
    {sampleRate: 44_100, seconds: 10, bpm: 110, steps: patterns.rock(2 / 3), seed: 4}),
  pattern('breakbeat-174-44k', 'Breakbeat at 174 BPM, near the top of the default range, 44.1 kHz, 8 s.',
    {sampleRate: 44_100, seconds: 8, bpm: 174, steps: patterns.breakbeat(), seed: 5}),
  pattern('house-127.5-44k', 'House pattern at a fractional 127.5 BPM, for the unrounded tempo, 44.1 kHz, 8 s.',
    {sampleRate: 44_100, seconds: 8, bpm: 127.5, steps: patterns.house(), seed: 6}),
  pattern('rock-75-22k', 'Rock pattern at 75 BPM, below the default range: read at its double, or at 75 on a range that holds it. 22.05 kHz, 12 s.',
    {sampleRate: 22_050, seconds: 12, bpm: 75, steps: patterns.rock(0.5), seed: 7}),
  pattern('kick-89-16k', 'Kick on every beat at 89 BPM, just below the default range, 16 kHz, 10 s.',
    {sampleRate: 16_000, seconds: 10, bpm: 89, steps: patterns.fourOnTheFloor(), seed: 8}),
  // 122.5 BPM is exactly 21600 samples a beat at 44.1 kHz, so the peaks engine's whole-BPM rounding meets a tie
  // (half up gives 123, half to even 122), and 9.3 s makes audio.to a fraction no float32 or integer division gives
  pattern('kick-122.5-44k', 'Kick on every beat at 122.5 BPM, 44.1 kHz, 9.3 s: a tempo halfway between two whole BPM, and a length that is not a whole number of seconds.',
    {sampleRate: 44_100, seconds: 9.3, bpm: 122.5, steps: patterns.fourOnTheFloor(), seed: 21}),
  pattern('kick-200-22k', 'Kick on every beat at 200 BPM, above the default range: read at its half. 22.05 kHz, 8 s.',
    {sampleRate: 22_050, seconds: 8, bpm: 200, steps: patterns.fourOnTheFloor(), seed: 9}),
  pattern('house-92-16k', 'House pattern at 92 BPM, near the bottom of the default range, 16 kHz, 10 s.',
    {sampleRate: 16_000, seconds: 10, bpm: 92, steps: patterns.house(), seed: 10}),
  pattern('kick-140-96k', 'Four-on-the-floor kick at 140 BPM, 96 kHz, 8 s.',
    {sampleRate: 96_000, seconds: 8, bpm: 140, steps: patterns.fourOnTheFloor(), seed: 11}),
  pattern('breakbeat-100-8k', 'Breakbeat at 100 BPM, 8 kHz, the lowest rate a Web Audio context must take, 10 s.',
    {sampleRate: 8_000, seconds: 10, bpm: 100, steps: patterns.breakbeat(), seed: 12}),
  pattern('house-124-noisy-22k', 'House pattern at 124 BPM over a white-noise bed about 20 dB below the hits, 22.05 kHz, 8 s.',
    {sampleRate: 22_050, seconds: 8, bpm: 124, steps: patterns.house(), seed: 13, noiseBed: 0.05}),
  pattern('house-122-quiet-44k', 'House pattern at 122 BPM, quiet: peaks near -52 dBFS, 49 dB below the other patterns. 44.1 kHz, 8 s.',
    {sampleRate: 44_100, seconds: 8, bpm: 122, steps: patterns.house(), seed: 14, gain: 0.0025}),
  pattern('metronome-100-44k', 'Metronome ticks (1 kHz, nothing below 200 Hz) at 100 BPM, 44.1 kHz, 8 s.',
    {sampleRate: 44_100, seconds: 8, bpm: 100, steps: patterns.metronome(), seed: 15}),
  pattern('noise-8k', 'White noise at -12 dBFS, no pulse, 8 kHz, 6 s.',
    {sampleRate: 8_000, seconds: 6, bpm: 120, steps: [], seed: 16, noiseBed: 0.25}),
  pattern('house-128-short-44k', 'House pattern at 128 BPM cut to 3 s, 44.1 kHz.',
    {sampleRate: 44_100, seconds: 3, bpm: 128, steps: patterns.house(), seed: 17}),
  pattern('kick-120-tiny-44k', 'Kick at 120 BPM cut to 0.3 s, a single hit, 44.1 kHz.',
    {sampleRate: 44_100, seconds: 0.3, bpm: 120, steps: patterns.fourOnTheFloor(), seed: 18}),
  {id: 'silence-44k', description: 'Digital silence, 44.1 kHz, 8 s.', sampleRate: 44_100, build: () => new Float64Array(352_800)},
  {id: 'empty', description: 'No samples at all, for the error case.', sampleRate: 44_100, build: () => new Float64Array(0)},
];
