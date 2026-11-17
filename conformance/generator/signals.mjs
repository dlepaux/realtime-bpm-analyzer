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
 * The Web Audio lowpass biquad the peaks engine runs, in the order of operations of the library's applyLowpass
 * (core/lowpass.ts), with its unrounded double output, which applyLowpass then stores as float32. Only
 * {@link thresholdEdge} uses it, to place a sample; generate.mjs checks the placement against the library itself.
 * @param {Float32Array} samples The input
 * @param {number} sampleRate Hz
 * @returns {Float64Array} The filtered samples, before their rounding to float32
 */
function lowpassUnrounded(samples, sampleRate) {
  const w0 = Math.PI * (200 / (sampleRate / 2));
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * (10 ** (1 / 20)));
  const a0 = 1 + alpha;
  const [b0, b1, b2, a1, a2] = [((1 - cosW0) / 2) / a0, (1 - cosW0) / a0, ((1 - cosW0) / 2) / a0, (-2 * cosW0) / a0, (1 - alpha) / a0];
  const out = new Float64Array(samples.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < samples.length; i += 1) {
    const x0 = samples[i];
    const y0 = (b0 * x0) + (b1 * x1) + (b2 * x2) - (a1 * y1) - (a2 * y2);
    out[i] = y0;
    [x2, x1, y2, y1] = [x1, x0, y1, y0];
  }

  return out;
}

/** The threshold rung {@link thresholdEdge} sits on: 0.85 rounds up in float32, by 2.4e-8 */
export const edgeThreshold = 0.85;

/**
 * The tempogram's floor, the library's consts.tempogramMinSampleRate (RBA-261): the first double at which its FFT has
 * a bin above DC. A floor moved up makes the case at it throw, and generate.mjs refuses to write the set
 */
export const tempogramFloor = 122.97509238026915;

/**
 * The peaks engine compares each lowpassed sample, stored as float32, with its threshold as a double. 15 kicks at
 * 100 BPM: 14 whose lowpassed peak is 0.875, and a last one whose lowpassed peak rounds to exactly
 * Math.fround(0.85), which is 2.4e-8 above 0.85. Compared as doubles, as the reference compares, it is over 0.85, so
 * that rung holds the 15 peaks a reading needs. Compared as float32 it equals the threshold, the rung falls one
 * short, and the reading comes from the 0.8 rung, where the last kick's crossing lands elsewhere: bpmExact moves by
 * 0.05. Unrounded, its peak is 2.7e-8 above 0.85 and 2.6e-8 under the next float32 rounding boundary, so a port that
 * keeps the lowpass output as doubles reads it as the reference does.
 * @returns {Float64Array} The signal, every sample a whole multiple of 1/32768, so toPcm16 keeps it exactly
 */
function thresholdEdge() {
  const sampleRate = 4_000;
  const kicks = 15;
  const kickLength = Math.round(0.3 * sampleRate);
  const starts = Array.from({length: kicks}, (_, beat) => Math.round(beat * 0.6 * sampleRate));
  const shape = instruments.kick(sampleRate);
  const pcm = new Int16Array(starts[kicks - 1] + Math.round(1.1 * sampleRate));
  const decoded = () => Float32Array.from(pcm, value => value / 32_768);
  const place = (start, gain) => {
    for (let i = 0; i < kickLength; i += 1) {
      pcm[start + i] = Math.max(-32_768, Math.min(32_767, Math.round(gain * shape[i] * 32_768)));
    }
  };

  const peakOf = start => {
    const filtered = lowpassUnrounded(decoded(), sampleRate);
    let index = start;
    for (let i = start; i < start + kickLength; i += 1) {
      index = filtered[i] > filtered[index] ? i : index;
    }

    return {value: filtered[index], index};
  };

  // Each gain is scaled until its kick's lowpassed peak converges on the target: 30 rounds is far past convergence
  const fit = (start, gain, target) => {
    let fitted = gain;
    for (let round = 0; round < 30; round += 1) {
      place(start, fitted);
      fitted *= target / peakOf(start).value;
    }

    return fitted;
  };

  const loud = fit(starts[0], 0.8, 0.875);
  for (const start of starts.slice(0, -1)) {
    place(start, loud);
  }

  // Halfway between 0.85 and the float32 rounding boundary above Math.fround(0.85)
  const target = (edgeThreshold + Math.fround(edgeThreshold) + (2 ** -25)) / 2;
  const last = starts[kicks - 1];
  fit(last, loud * 0.85 / 0.875, target);
  // Then single samples before the peak, each moved by whole steps of 1/32768, where the filter's response to them
  // is small enough to land within 2e-9 of the target
  const impulse = new Float32Array(300);
  impulse[0] = 1;
  const response = lowpassUnrounded(impulse, sampleRate);
  let peak = peakOf(last);
  for (let round = 0; round < 50 && Math.abs(target - peak.value) > 2e-9; round += 1) {
    const residual = target - peak.value;
    let lag = -1;
    for (let candidate = 1; candidate < response.length && peak.index - candidate >= last; candidate += 1) {
      const step = Math.abs(response[candidate] / 32_768);
      if (step > 1e-12 && step <= Math.abs(residual) && (lag < 0 || step > Math.abs(response[lag] / 32_768))) {
        lag = candidate;
      }
    }

    if (lag < 0) {
      break;
    }

    const index = peak.index - lag;
    pcm[index] = Math.max(-32_768, Math.min(32_767, pcm[index] + Math.round(residual / (response[lag] / 32_768))));
    peak = peakOf(last);
  }

  return Float64Array.from(pcm, value => value / 32_768);
}

/**
 * A 4th-order Butterworth highpass, as two RBJ cookbook biquads in double precision: the bass cut of RBA-218's
 * bass-light variants, which leave the peaks engine's 200 Hz lowpass little to read
 * @param {Float64Array} mix The signal
 * @param {number} sampleRate Hz
 * @param {number} frequency The corner, in Hz
 * @returns {Float64Array} The filtered signal
 */
function highpass(mix, sampleRate, frequency) {
  let out = mix;
  // The two section Qs of a 4th-order Butterworth filter, as RBA-218's probe set them
  for (const q of [0.5412, 1.3066]) {
    const w0 = (2 * Math.PI * frequency) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const [b0, b1, b2, a1, a2] = [((1 + cosW0) / 2) / a0, -(1 + cosW0) / a0, ((1 + cosW0) / 2) / a0, (-2 * cosW0) / a0, (1 - alpha) / a0];
    const input = out;
    out = new Float64Array(input.length);
    let [x1, x2, y1, y2] = [0, 0, 0, 0];
    for (let i = 0; i < input.length; i += 1) {
      const x0 = input[i];
      const y0 = (b0 * x0) + (b1 * x1) + (b2 * x2) - (a1 * y1) - (a2 * y2);
      out[i] = y0;
      [x2, x1, y2, y1] = [x1, x0, y1, y0];
    }
  }

  return out;
}

/**
 * A pattern made quiet or bass-light, as RBA-218's probe made its variants: RBA-221's fallback reads these, where the
 * peaks engine's fixed thresholds find no beat
 * @param {string} id File name in ../inputs
 * @param {string} description What it is and why it is in the set
 * @param {object} spec The settings {@link render} takes
 * @param {{gainDb?: number, highpassHz?: number}} change A gain in dB on the mix's default 0.7, and a highpass corner
 * @returns {{id: string, description: string, sampleRate: number, build: () => Float64Array}} The signal
 */
function quieter(id, description, spec, {gainDb = 0, highpassHz = 0}) {
  const build = () => {
    const mix = render({...spec, gain: 0.7 * (10 ** (gainDb / 20))});
    return highpassHz > 0 ? highpass(mix, spec.sampleRate, highpassHz) : mix;
  };

  return {id, description, sampleRate: spec.sampleRate, build};
}

/**
 * Kicks one sample long, on the beat: a click a low rate keeps, where a hop is one sample
 * @param {number} sampleRate Hz
 * @param {number} bpm Tempo
 * @param {number} seconds Length
 * @returns {Float64Array} The signal
 */
function impulses(sampleRate, bpm, seconds) {
  const out = new Float64Array(Math.round(seconds * sampleRate));
  for (let beat = 0; Math.round(beat * (60 / bpm) * sampleRate) < out.length; beat += 1) {
    out[Math.round(beat * (60 / bpm) * sampleRate)] = 0.9;
  }

  return out;
}

/**
 * The input set. Each id is the file name in ../inputs. Rates vary so that every rate-dependent size in both
 * engines (FFT size, hop, filter coefficients, interval binning) is exercised at more than one value. Lengths are
 * as short as a reading needs, to keep the committed files under their size budget (see ../readme.md).
 * A signal runs under every option set of generate.mjs unless it names its own `optionSets` (none for an input only
 * error cases use). `nonFinite` lists the samples a harness overwrites after decoding, since 16-bit PCM holds no NaN
 * or infinity. `perturbation` replaces the generator's relative perturbation, 0 for none, for a case placed on a boundary on purpose.
 * @type {ReadonlyArray<{id: string, description: string, sampleRate: number, build: () => Float64Array,
 *   optionSets?: string[], nonFinite?: Array<{index: number, value: string}>, perturbation?: number}>}
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
  {id: 'empty', description: 'No samples at all, for the error case.', sampleRate: 44_100, build: () => new Float64Array(0), optionSets: []},
  // RBA-260: the calibration's band edges sit at 140 and 165 BPM, and kick-140-96k reads 140. These read 139, 164
  // and 165, so moving an edge by one BPM either way changes a confidence. Their low rates are the set's rates under 8 kHz
  pattern('kick-139-4k', 'Kick on every beat at 139 BPM, a BPM under the calibration band that starts at 140, 4 kHz, 10 s.',
    {sampleRate: 4_000, seconds: 10, bpm: 139, steps: patterns.fourOnTheFloor(), seed: 22}),
  pattern('kick-164-2k', 'Kick on every beat at 164 BPM, a BPM under the calibration band that starts at 165, 2 kHz, 10 s.',
    {sampleRate: 2_000, seconds: 10, bpm: 164, steps: patterns.fourOnTheFloor(), seed: 23}),
  pattern('kick-165-1k', 'Kick on every beat at 165 BPM, the first BPM of the top calibration band, 1 kHz, 10 s.',
    {sampleRate: 1_000, seconds: 10, bpm: 165, steps: patterns.fourOnTheFloor(), seed: 24}),
  // RBA-261: from 100 Hz up to the tempogram's floor its FFT had 2 points, DC and Nyquist, and 6.2 read null here
  {
    id: 'impulses-120-100hz',
    description: 'One-sample clicks at 120 BPM, 100 Hz, 12 s, for the error cases: under the tempogram\'s floor of 122.97509238026915 Hz, where its FFT would have 2 points, with no bin above DC.',
    sampleRate: 100,
    build: () => impulses(100, 120, 12),
    optionSets: [],
  },
  {
    id: 'impulses-120-tempogram-floor',
    description: 'One-sample clicks at 120 BPM, 12 s, at 122.97509238026915 Hz, the tempogram\'s floor: the lowest rate at which its FFT has a bin above DC (4 points).',
    sampleRate: tempogramFloor,
    build: () => impulses(tempogramFloor, 120, 12),
    // The peaks engine's default lowpass needs more than 400 Hz
    optionSets: ['default', 'tempogram-90-180', 'range-60-140'],
  },
  {
    id: 'peaks-threshold-edge-4k',
    description: 'Kicks at 100 BPM whose last lowpassed peak is exactly the float32 nearest 0.85, a peaks threshold: a double comparison counts it, a float32 one does not. 4 kHz, 9.5 s.',
    sampleRate: 4_000,
    build: thresholdEdge,
    optionSets: ['peaks', 'peaks-90-180'],
    // None: the case sits on a float32 boundary on purpose. Its lowpassed peak is 2.6e-8 from the boundary, about 1e8
    // times a double's rounding, so any double lowpass keeps it, while a one-step move of a 16-bit input crosses it
    perturbation: 0,
  },
  // RBA-221: the peaks engine's fixed thresholds find no beat in these, so their peaks readings come from its search
  // relative to the input's level, with confidence null
  quieter('house-118-minus14db-8k', 'House pattern at 118 BPM, 14 dB under the other patterns, 8 kHz, 10 s.',
    {sampleRate: 8_000, seconds: 10, bpm: 118, steps: patterns.house(), seed: 26}, {gainDb: -14}),
  quieter('rock-104-minus24db-11k', 'Rock pattern at 104 BPM, 24 dB under the other patterns, 11.025 kHz, 10 s.',
    {sampleRate: 11_025, seconds: 10, bpm: 104, steps: patterns.rock(0.5), seed: 27}, {gainDb: -24}),
  // A 150 Hz cut alone leaves this kick -8.6 dBFS after the lowpass, which the fixed thresholds read
  quieter('kick-126-hp150-minus10db-16k', 'Kick on every beat at 126 BPM through a 150 Hz highpass (24 dB per octave), 10 dB under the other patterns, 16 kHz, 8 s.',
    {sampleRate: 16_000, seconds: 8, bpm: 126, steps: patterns.fourOnTheFloor(), seed: 28}, {gainDb: -10, highpassHz: 150}),
  quieter('house-112-hp300-8k', 'House pattern at 112 BPM through a 300 Hz highpass (24 dB per octave), 8 kHz, 10 s.',
    {sampleRate: 8_000, seconds: 10, bpm: 112, steps: patterns.house(), seed: 29}, {highpassHz: 300}),
  quieter('house-120-near-silent-8k', 'House pattern at 120 BPM, 76 dB under the other patterns, 8 kHz, 10 s: under the peaks engine\'s silence floor after its lowpass, so still no peaks reading.',
    {sampleRate: 8_000, seconds: 10, bpm: 120, steps: patterns.house(), seed: 30}, {gainDb: -76}),
  ...[['nan', 'NaN'], ['infinity', 'Infinity'], ['negative-infinity', '-Infinity']].map(([name, value]) => ({
    ...pattern(`kick-120-${name}-8k`, `A kick at 120 BPM, 8 kHz, 0.5 s, whose last sample is ${value}, for the error cases.`,
      {sampleRate: 8_000, seconds: 0.5, bpm: 120, steps: patterns.fourOnTheFloor(), seed: 25}),
    optionSets: [],
    nonFinite: [{index: 3_999, value}],
  })),
];
