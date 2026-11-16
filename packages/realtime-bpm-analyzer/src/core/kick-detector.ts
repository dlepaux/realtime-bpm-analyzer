// The live kick detector (RBA-243). Import-free, so the plain-Node measurement script runs the code the worklet runs.

/**
 * Called once per kick, with its time on the clock `process` was given, and its strength: its peak in the band over
 * the loudest kick's of the last seconds, from 0 to 1, so a kick 6 dB softer than the loudest is 0.5
 */
export type OnKick = (time: number, strength: number) => void;

export type KickDetector = {
  /**
   * Consumes a block of samples, synchronously, and calls `onKick` for each kick it confirms in it
   * @param samples The block, any length: the worklet passes one render quantum
   * @param startTime The time of `samples[0]`, in seconds, on the caller's clock
   * @param onKick Called with each kick, in time order
   */
  readonly process: (samples: Float32Array, startTime: number, onKick: OnKick) => void;
  /** Forgets everything heard: the next kick is judged against silence */
  readonly reset: () => void;
};

export type KickTuning = {
  /** The band a kick is heard in, in Hz */
  readonly lowHz: number;
  readonly highHz: number;
  /** How often the band's energy is read, in seconds */
  readonly hopSeconds: number;
  /** The energy is a mean over this much audio, in seconds */
  readonly windowSeconds: number;
  /** A jump is judged this long after it starts, in seconds */
  readonly confirmSeconds: number;
  /** The level a jump is measured against: the mean energy of this much audio before it, in seconds */
  readonly referenceSeconds: number;
  /** How far the energy must jump over the reference, in dB */
  readonly riseDb: number;
  /** How close to the loudest recent kick's peak a jump's peak must be, in dB */
  readonly gateDb: number;
  /** Under this energy in the band, in dB relative to a full-scale sine, nothing counts */
  readonly floorDb: number;
  /** Half-life of the loudest recent kick's peak, in seconds */
  readonly memorySeconds: number;
  /** After a kick, none for this long, in seconds */
  readonly refractorySeconds: number;
};

/**
 * The detector's settings, each chosen from what a kick is and what the ear and eye resolve, not fitted to the
 * tests' scenes:
 * - `lowHz` / `highHz`: a kick's body falls from about 150 Hz to its 40 to 60 Hz fundamental, and a snare's body
 *   starts near 180 Hz. Under 30 Hz is rumble, wind and a mic's handling noise. Two Butterworth sections over the
 *   top, 24 dB per octave, put a snare's body about 6 dB down at 190 Hz and remove the hats; one first-order section
 *   under the bottom keeps the delay low.
 * - `hopSeconds`: the energy is read every 2.5 ms or so, rounded to whole samples.
 * - `windowSeconds`: each reading is the mean of the last 10 ms, one period of the ripple a 50 Hz tone's energy has.
 *   A shorter mean follows that ripple instead of the sound.
 * - `confirmSeconds`: a jump is judged 7.5 ms after it starts, once the window holds mostly the new sound. A kick's
 *   body lasts 100 ms and more, while noise jumps for a moment, so this keeps noise from counting. With the filters'
 *   delay it is most of the event's delay.
 * - `referenceSeconds`: the jump is measured against the mean of the 60 ms before the window. That holds a bass
 *   note's level, and the tail of the previous kick.
 * - `riseDb`: the jump a kick needs, 10.5 dB. A 10 ms mean of a 120 Hz-wide band is a rough estimate of its level, so
 *   noise alone swings it by several dB: under 10 dB, white and pink noise counted several times a minute. A kick
 *   that follows silence or a bass note's tail jumps 20 dB and more.
 * - `gateDb`: a jump counts only if its peak is within 6 dB of the loudest kick's of the last seconds, so a bass note,
 *   a fill or a ghost note under the kicks does not. A bass note that starts as sharp and within 6 dB of the kick
 *   counts: in the band, nothing tells them apart. The loudest peak's energy halves every `memorySeconds` (its
 *   amplitude every 8 s), so after the music drops by 10 dB at once no kick counts for about 5 s, and after 20 dB
 *   about 19 s, until the loud ones are forgotten. `reset()` forgets them at once.
 * - `floorDb`: under -60 dB in the band nothing counts: silence, or a mic's hiss.
 * - `refractorySeconds`: after a kick, 80 ms with none, a sixteenth note at 187 BPM: music plays no kicks closer,
 *   and a kick's own decay never jumps again in that time.
 */
export const kickTuning: KickTuning = Object.freeze({
  lowHz: 30,
  highHz: 150,
  hopSeconds: 0.0025,
  windowSeconds: 0.01,
  confirmSeconds: 0.0075,
  referenceSeconds: 0.06,
  riseDb: 10.5,
  gateDb: 6,
  floorDb: -60,
  memorySeconds: 4,
  refractorySeconds: 0.08,
});

/** The frequency a kick's time is corrected at: the filters delay its fundamental, about 60 Hz, this much */
const kickFundamentalHz = 60;

/** One filter section, normalised so a0 is 1 (b2 and a2 are 0 for a first-order one), with its state */
type Section = {b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number};

const section = (b0: number, b1: number, b2: number, a1: number, a2: number): Section => ({b0, b1, b2, a1, a2, x1: 0, x2: 0, y1: 0, y2: 0});

/**
 * A Butterworth lowpass section (Q = 1/√2), from the Audio EQ Cookbook
 * @param cutoff Cutoff in Hz
 * @param sampleRate Sample rate in Hz
 * @returns The section, at rest
 */
function lowpass(cutoff: number, sampleRate: number): Section {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const alpha = Math.sin(w0) / Math.SQRT2;
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  return section((1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0);
}

/**
 * A first-order highpass, by the bilinear transform
 * @param cutoff Cutoff in Hz
 * @param sampleRate Sample rate in Hz
 * @returns The section, at rest
 */
function highpass(cutoff: number, sampleRate: number): Section {
  const k = Math.tan((Math.PI * cutoff) / sampleRate);
  return section(1 / (1 + k), -1 / (1 + k), 0, (k - 1) / (k + 1), 0);
}

function run(s: Section, x: number): number {
  const y = (s.b0 * x) + (s.b1 * s.x1) + (s.b2 * s.x2) - (s.a1 * s.y1) - (s.a2 * s.y2);
  s.x2 = s.x1;
  s.x1 = x;
  s.y2 = s.y1;
  s.y1 = y;
  return y;
}

function rest(s: Section): void {
  s.x1 = 0;
  s.x2 = 0;
  s.y1 = 0;
  s.y2 = 0;
}

/**
 * A section's phase at one frequency
 * @param s The section
 * @param w The frequency, in radians per sample
 * @returns The phase of its response, in radians
 */
function phase(s: Section, w: number): number {
  // H(e^jw) = (b0 + b1 e^-jw + b2 e^-2jw) / (1 + a1 e^-jw + a2 e^-2jw)
  const re = (b0: number, b1: number, b2: number) => b0 + (b1 * Math.cos(w)) + (b2 * Math.cos(2 * w));
  const im = (b1: number, b2: number) => -((b1 * Math.sin(w)) + (b2 * Math.sin(2 * w)));
  return Math.atan2(im(s.b1, s.b2), re(s.b0, s.b1, s.b2)) - Math.atan2(im(s.a1, s.a2), re(1, s.a1, s.a2));
}

/**
 * How long the sections delay a tone, from their own coefficients: the derivative of their phase
 * @param sections The cascade
 * @param frequency The tone, in Hz
 * @param sampleRate Sample rate in Hz
 * @returns The group delay, in seconds
 */
function groupDelay(sections: readonly Section[], frequency: number, sampleRate: number): number {
  const w = (2 * Math.PI * frequency) / sampleRate;
  const dw = 1e-6;
  const total = (at: number) => sections.reduce((sum, s) => sum + phase(s, at), 0);
  // Unwrapped over so small a step: the difference stays far under π
  let difference = total(w + dw) - total(w);
  difference -= 2 * Math.PI * Math.round(difference / (2 * Math.PI));
  return -difference / dw / sampleRate;
}

/** An energy ratio from dB */
const fromDb = (db: number) => 10 ** (db / 10);

/**
 * Creates a detector for one stream of samples
 * @param sampleRate Sample rate in Hz
 * @param overrides Other settings, for the measurement script only: no public option sets them
 * @returns The detector. Every buffer is allocated here: `process` allocates nothing per sample, only one small
 * object per kick it confirms
 */
export function createKickDetector(sampleRate: number, overrides: Partial<KickTuning> = {}): KickDetector {
  const tuning: KickTuning = {...kickTuning, ...overrides};
  // Under a quarter of the rate the sections stay stable and their delay small, at any rate Web Audio allows
  const top = Math.min(tuning.highHz, sampleRate / 4);
  const sections = [highpass(Math.min(tuning.lowHz, top / 2), sampleRate), lowpass(top, sampleRate), lowpass(top, sampleRate)];
  const delay = groupDelay(sections, kickFundamentalHz, sampleRate);
  const hop = Math.max(1, Math.round(tuning.hopSeconds * sampleRate));
  const windowHops = Math.max(1, Math.round(tuning.windowSeconds * sampleRate / hop));
  const confirmHops = Math.max(1, Math.round(tuning.confirmSeconds * sampleRate / hop));
  const referenceHops = Math.max(1, Math.round(tuning.referenceSeconds * sampleRate / hop));
  // Hop energies, enough for the reference before the window of the onset hop, and the hops that confirm it
  const size = referenceHops + windowHops + confirmHops + 1;
  const ring = new Float64Array(size);
  // Each hop's peak sample, in magnitude
  const peaks = new Float64Array(size);
  const rise = fromDb(tuning.riseDb);
  const gate = fromDb(-tuning.gateDb);
  // Relative to a full-scale sine, whose energy is 1/2
  const floor = fromDb(tuning.floorDb) / 2;
  const decay = 0.5 ** (hop / (tuning.memorySeconds * sampleRate));
  const refractoryHops = Math.ceil(tuning.refractorySeconds * sampleRate / hop);

  let sum = 0;
  let peak = 0;
  let inHop = 0;
  let hops = 0;
  let loudest = 0;
  let sinceKick = refractoryHops;
  // Whether the previous hop's window had jumped over its own reference
  let wasAbove = false;

  /** The energy of the hop `back` hops before the newest, which is 1 */
  const energy = (back: number) => ring[(hops - back) % size];

  /** The window's mean energy as it was at the hop `back` hops before the newest */
  function windowAt(back: number): number {
    let total = 0;
    for (let i = back; i < back + windowHops; i += 1) {
      total += energy(i);
    }

    return total / windowHops;
  }

  /**
   * Judges whether a kick started `confirmHops` hops before the newest one
   * @returns How far into the onset hop's window the kick started, from 0 (its start) to 1 (its end), and its
   * strength, or null
   */
  function judge(): {readonly strength: number; readonly entered: number} | null {
    loudest *= decay;
    sinceKick += 1;
    if (hops < size) {
      return null;
    }

    const onsetBack = confirmHops + 1;
    let before = 0;
    for (let back = onsetBack + windowHops; back < size + 1; back += 1) {
      before += energy(back);
    }

    before /= size - onsetBack - windowHops + 1;
    const threshold = rise * before;
    const onset = windowAt(onsetBack);
    const level = windowAt(1);
    // The onset hop must be the first whose window jumped, as the previous hop judged it against its own reference,
    // so a sound that swells, such as a bass note's attack, is judged once, at its start, and never again further
    // into the swell, where it would be louder
    const first = !wasAbove;
    wasAbove = onset > threshold;
    if (!wasAbove || !first || sinceKick < refractoryHops || level <= threshold || level <= floor) {
      return null;
    }

    // The window fills linearly as the kick enters it: how full it was at the onset hop says when the kick came in
    const entered = Math.min(1, Math.max(0, (onset - before) / (level - before)));
    // The kick's own level: its peak since the onset hop, as a peak does not depend on where the hops fall
    let own = 0;
    for (let back = 1; back <= onsetBack + windowHops; back += 1) {
      own = Math.max(own, peaks[(hops - back) % size]);
    }

    own *= own;
    if (own <= gate * loudest) {
      return null;
    }

    sinceKick = 0;
    loudest = Math.max(loudest, own);
    return {strength: Math.sqrt(own / loudest), entered};
  }

  return {
    process(samples, startTime, onKick) {
      for (let i = 0; i < samples.length; i += 1) {
        let y = samples[i];
        for (let k = 0; k < sections.length; k += 1) {
          y = run(sections[k], y);
        }

        sum += y * y;
        peak = Math.max(peak, Math.abs(y));
        inHop += 1;
        if (inHop < hop) {
          continue;
        }

        ring[hops % size] = sum / hop;
        peaks[hops % size] = peak;
        hops += 1;
        sum = 0;
        peak = 0;
        inHop = 0;
        const kick = judge();
        if (kick !== null) {
          // Sample i ends the newest hop, and the onset hop ends `confirmHops` hops before it. The kick came in
          // `entered` of a window before that end, and the filters had delayed it by `delay`
          const onsetEnd = i + 1 - (confirmHops * hop);
          const start = onsetEnd - (kick.entered * windowHops * hop);
          onKick(startTime + (start / sampleRate) - delay, Math.min(1, kick.strength));
        }
      }
    },
    reset() {
      sections.forEach(rest);
      ring.fill(0);
      peaks.fill(0);
      sum = 0;
      peak = 0;
      inHop = 0;
      hops = 0;
      loudest = 0;
      sinceKick = refractoryHops;
      wasAbove = false;
    },
  };
}
