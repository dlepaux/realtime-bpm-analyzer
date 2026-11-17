// Shared by the browser parity tests and the plain-Node tests (Node strips the types),
// so it must stay import-free.

/**
 * Tempos the click-track tests cover: both ends of the default 90–180 range and common
 * genre tempos in between
 */
export const clickTrackTempos = [90, 100, 120, 128, 140, 174];

/**
 * Synthesises a kick-like click track: a decaying 60 Hz burst on every beat, which survives
 * the 200 Hz lowpass the analysis applies.
 * @param bpm Tempo of the clicks
 * @param sampleRate Sample rate in Hz
 * @param seconds Duration of the track
 * @param jitterSeconds Each click moves by up to this much either way, as a human player's would
 * @returns Mono PCM samples
 */
export function createClickTrack(bpm: number, sampleRate = 44_100, seconds = 30, jitterSeconds = 0): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const samplesPerBeat = (60 / bpm) * sampleRate;
  const clickLength = Math.round(0.08 * sampleRate);
  const jitter = createNoise(Math.ceil(samples.length / samplesPerBeat) + 1, 7);

  for (let beat = 0; beat * samplesPerBeat < samples.length; beat += 1) {
    // Noise is in [-0.5, 0.5]: twice it spans the whole jitter both ways
    const offset = 2 * jitter[beat] * jitterSeconds * sampleRate;
    const start = Math.max(0, Math.round((beat * samplesPerBeat) + offset));
    if (start >= samples.length) {
      break;
    }

    const end = Math.min(start + clickLength, samples.length);

    for (let i = start; i < end; i += 1) {
      const t = (i - start) / sampleRate;
      samples[i] = 0.9 * Math.exp(-t * 40) * Math.sin(2 * Math.PI * 60 * t);
    }
  }

  return samples;
}

/**
 * Deterministic white noise in [-0.5, 0.5], so filter comparisons are reproducible
 * @param length Number of samples
 * @param seed Any 32-bit integer
 * @returns Noise samples
 */
export function createNoise(length: number, seed = 42): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  let state = seed >>> 0;

  for (let i = 0; i < length; i += 1) {
    // Numerical Recipes LCG constants
    state = ((state * 1_664_525) + 1_013_904_223) >>> 0;
    samples[i] = (state / 4_294_967_296) - 0.5;
  }

  return samples;
}
