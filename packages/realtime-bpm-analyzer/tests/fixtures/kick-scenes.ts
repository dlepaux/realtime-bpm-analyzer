// Synthetic scenes with known kick times, for the kick event's tests (RBA-243). Shared by the browser tests and
// the plain-Node measurement script (Node strips the types), so it must stay import-free.

/** A rendered scene: mono samples, and the time each kick starts, in seconds from the first sample */
export type KickScene = {
  readonly name: string;
  readonly samples: Float32Array<ArrayBuffer>;
  readonly sampleRate: number;
  /** Ground truth: the sample where each kick's sound starts, over the sample rate. Sorted. */
  readonly kicks: readonly number[];
};

/** The scenes the tests score, by name: each one is a case the brief lists */
export const kickSceneNames = ['kicks-alone', 'full-mix', 'breakdown', 'tempo-change', 'silence', 'noise'] as const;
export type KickSceneName = typeof kickSceneNames[number];

/**
 * Deterministic uniform noise in [-1, 1), Numerical Recipes' LCG, so every run renders the same samples
 * @param seed Any 32-bit integer
 * @returns The next value, each call
 */
function noiseSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = ((state * 1_664_525) + 1_013_904_223) >>> 0;
    return (2 * state / 4_294_967_296) - 1;
  };
}

/**
 * Adds one kick at `start`: a sine whose pitch falls from 150 to 50 Hz in about 30 ms, under an exponential decay,
 * plus a 3 ms click. The usual electronic kick. Its first sample is at `start` exactly: the phase starts at 0 and the
 * attack is one sample, so the ground truth is where the sound begins, not where it peaks.
 * @param out The buffer, mixed into
 * @param start First sample of the kick
 * @param sampleRate Sample rate in Hz
 * @param gain Peak amplitude, at most 1
 */
function addKick(out: Float32Array, start: number, sampleRate: number, gain: number): void {
  const length = Math.min(out.length - start, Math.round(0.35 * sampleRate));
  const click = noiseSource(start);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const frequency = 50 + (100 * Math.exp(-t / 0.03));
    const body = Math.sin(phase) * Math.exp(-t / 0.12);
    const transient = t < 0.003 ? 0.3 * click() * (1 - (t / 0.003)) : 0;
    out[start + i] += gain * (body + transient);
    phase += (2 * Math.PI * frequency) / sampleRate;
  }
}

/**
 * Adds a closed hi-hat: noise through a first difference (a highpass), 25 ms decay. Nothing under 1 kHz to speak of.
 */
function addHat(out: Float32Array, start: number, sampleRate: number, gain: number): void {
  const length = Math.min(out.length - start, Math.round(0.08 * sampleRate));
  const noise = noiseSource(start + 11);
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    const value = noise();
    out[start + i] += gain * (value - previous) * Math.exp(-(i / sampleRate) / 0.025);
    previous = value;
  }
}

/**
 * Adds a snare: a 190 Hz body and broadband noise, 90 ms decay. Its body sits just above the kick's band, which is
 * what makes it a test: a detector listening too high fires on it.
 */
function addSnare(out: Float32Array, start: number, sampleRate: number, gain: number): void {
  const length = Math.min(out.length - start, Math.round(0.25 * sampleRate));
  const noise = noiseSource(start + 23);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t / 0.09);
    out[start + i] += gain * envelope * ((0.5 * Math.sin(2 * Math.PI * 190 * t)) + (0.6 * noise()));
  }
}

/**
 * Adds a bass note: a sawtooth's first three partials at `frequency`, 8 ms attack, held then released. It sits in
 * the kick's band, and its notes start between the kicks: the hard case for a kick detector.
 */
function addBass(out: Float32Array, start: number, seconds: number, frequency: number, sampleRate: number, gain: number): void {
  const length = Math.min(out.length - start, Math.round(seconds * sampleRate));
  const attack = 0.008 * sampleRate;
  const release = 0.03 * sampleRate;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, i / attack, (length - i) / release);
    const wave = Math.sin(2 * Math.PI * frequency * t) + (Math.sin(4 * Math.PI * frequency * t) / 2) + (Math.sin(6 * Math.PI * frequency * t) / 3);
    out[start + i] += gain * envelope * wave;
  }
}

/**
 * Adds a pad: a minor chord of sines from 220 Hz up, with a 0.4 s attack and release. Above the kick's band, and
 * with no attack a kick could be mistaken for.
 */
function addPad(out: Float32Array, start: number, seconds: number, sampleRate: number, gain: number): void {
  const length = Math.min(out.length - start, Math.round(seconds * sampleRate));
  const fade = 0.4 * sampleRate;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, i / fade, (length - i) / fade);
    out[start + i] += gain * envelope * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t)) / 3;
  }
}

/**
 * Beat times of a steady pulse, in seconds
 * @param bpm Tempo
 * @param from First beat
 * @param to End, excluded
 * @returns The beats
 */
function beats(bpm: number, from: number, to: number): number[] {
  const times: number[] = [];
  for (let n = 0; from + (n * 60 / bpm) < to - 1e-9; n += 1) {
    times.push(from + (n * 60 / bpm));
  }

  return times;
}

/**
 * The drums and bass of one bar-long groove on the beats given: hats on every eighth, the snare on beats 2 and 4,
 * a bass note on every offbeat. Kicks are added by the caller, so a breakdown can drop them alone.
 */
function addGroove(out: Float32Array, beatTimes: readonly number[], bpm: number, sampleRate: number, bass = true): void {
  const beat = 60 / bpm;
  const notes = [55, 55, 65.4, 49];
  beatTimes.forEach((time, index) => {
    const at = (seconds: number) => Math.round(seconds * sampleRate);
    addHat(out, at(time), sampleRate, 0.12);
    addHat(out, at(time + (beat / 2)), sampleRate, 0.12);
    if (index % 2 === 1) {
      addSnare(out, at(time), sampleRate, 0.12);
    }

    if (bass) {
      addBass(out, at(time + (beat / 2)), beat * 0.45, notes[index % notes.length], sampleRate, 0.12);
    }
  });
}

/**
 * Renders a scene. Kicks are placed on whole samples, so the ground truth is exact.
 * @param name Which case
 * @param sampleRate Sample rate in Hz
 * @returns The samples and the kick times
 */
export function createKickScene(name: KickSceneName, sampleRate = 48_000): KickScene {
  const render = (seconds: number) => new Float32Array(Math.round(seconds * sampleRate));
  const place = (out: Float32Array, times: readonly number[], gain: (index: number) => number) => times.map((time, index) => {
    const start = Math.round(time * sampleRate);
    addKick(out, start, sampleRate, gain(index));
    return start / sampleRate;
  });

  switch (name) {
    case 'kicks-alone': {
      // 128 BPM, every fourth kick 4 dB softer, so the tests can check that strength follows the level
      const out = render(16);
      const kicks = place(out, beats(128, 0.5, 15.5), index => (index % 4 === 3 ? 0.5 : 0.8));
      return {name, samples: out, sampleRate, kicks};
    }
    case 'full-mix': {
      const out = render(20);
      const times = beats(124, 0.5, 19.5);
      addGroove(out, times, 124, sampleRate);
      const kicks = place(out, times, () => 0.7);
      return {name, samples: out, sampleRate, kicks};
    }
    case 'breakdown': {
      // A breakdown as dance music builds one: 8 s of groove, then 8 s where the kick and the bass stop, the hats
      // and a pad play on, and a snare roll rises over the last 2 s, then the drop: everything again
      const out = render(26);
      const times = beats(126, 0.5, 25.5);
      const isBreak = (time: number) => time >= 8.5 && time < 16.5;
      addGroove(out, times.filter(time => !isBreak(time)), 126, sampleRate);
      addGroove(out, times.filter(isBreak), 126, sampleRate, false);
      addPad(out, Math.round(8.5 * sampleRate), 8, sampleRate, 0.12);
      for (let time = 14.5; time < 16.5; time += 60 / 126 / 4) {
        addSnare(out, Math.round(time * sampleRate), sampleRate, 0.1 + (0.15 * (time - 14.5)));
      }

      const kicks = place(out, times.filter(time => !isBreak(time)), () => 0.7);
      return {name, samples: out, sampleRate, kicks};
    }
    case 'tempo-change': {
      // 100 BPM, then 150 BPM from 10 s: the kick event follows no tempo, so both halves read the same
      const out = render(20);
      const slow = beats(100, 0.5, 10);
      const fast = beats(150, 10, 19.5);
      addGroove(out, slow, 100, sampleRate);
      addGroove(out, fast, 150, sampleRate);
      const kicks = place(out, [...slow, ...fast], () => 0.7);
      return {name, samples: out, sampleRate, kicks};
    }
    case 'silence':
      return {name, samples: render(10), sampleRate, kicks: []};
    case 'noise': {
      // White noise at -15 dBFS RMS, then brown noise, which puts most of its energy in the kick's band. The two
      // cross over 1 s: a cut from one to the other would be a step in the low band, which is an onset, not noise
      const out = render(16);
      const noise = noiseSource(97);
      let brown = 0;
      for (let i = 0; i < out.length; i += 1) {
        const white = noise();
        brown = (0.995 * brown) + (0.05 * white);
        const mix = Math.min(1, Math.max(0, (i / sampleRate) - 9.5));
        out[i] = ((1 - mix) * 0.3 * white) + (mix * 1.2 * brown);
      }

      return {name, samples: out, sampleRate, kicks: []};
    }
  }
}

/** How a scene scored: each detected time matched to at most one true kick, nearest first */
export type KickScore = {
  readonly kicks: number;
  readonly hits: number;
  readonly misses: number;
  readonly falseKicks: number;
  /** Detected minus true, in seconds, one per hit */
  readonly errors: readonly number[];
};

/**
 * Scores detected kicks against the truth, greedily: each true kick takes the nearest unmatched detection within
 * `window` seconds either way. The detections are sorted, so this is the usual onset scoring (MIREX).
 * @param truth True kick times, sorted
 * @param detected Detected times, sorted, on the same clock
 * @param window The hit window, in seconds either way
 * @returns The score
 */
export function scoreKicks(truth: readonly number[], detected: readonly number[], window: number): KickScore {
  const used = new Array<boolean>(detected.length).fill(false);
  const errors: number[] = [];
  for (const kick of truth) {
    let best = -1;
    for (let j = 0; j < detected.length; j += 1) {
      const gap = Math.abs(detected[j] - kick);
      if (!used[j] && gap <= window && (best === -1 || gap < Math.abs(detected[best] - kick))) {
        best = j;
      }
    }

    if (best !== -1) {
      used[best] = true;
      errors.push(detected[best] - kick);
    }
  }

  return {kicks: truth.length, hits: errors.length, misses: truth.length - errors.length, falseKicks: used.filter(match => !match).length, errors};
}

/**
 * A percentile of absolute values, nearest-rank
 * @param values The values
 * @param fraction 0.5 for the median, 0.9 for p90, 1 for the max
 * @returns The percentile, 0 for no values
 */
export function absolutePercentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}
