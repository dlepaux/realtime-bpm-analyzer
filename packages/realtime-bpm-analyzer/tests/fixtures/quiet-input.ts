// RBA-218: does a quiet or bass-light file make the detector return no tempo? Generated, licence-clean
// sources and the level and bass variants the probe runs through the site's file path. It uses only Web Audio
// and no library code, so the variants don't depend on what they test.
import {createClickTrack, createNoise} from './click-track';

export const sampleRate = 44_100;
const seconds = 30;

/** The benchmark's tolerance (benchmark/lib/metrics.ts): a reading within 4% of the truth is correct */
const toleranceRatio = 0.04;

export type Source = {
  readonly name: string;
  /**
   * The tempo the source was built at. Null for the committed fixture, which has no ground truth (125 is only
   * what peaks reads, pinned): there each variant must read what the same engine reads on the original.
   */
  readonly truth: number | null;
  readonly channels: readonly Float32Array[];
};

export type Variant = {
  readonly name: string;
  /** Gain in dB, 0 or negative */
  readonly gainDb: number;
  /** Highpass corner in Hz, 24 dB per octave, or 0 for none */
  readonly highpassHz: number;
};

export const variants: readonly Variant[] = [
  {name: 'original', gainDb: 0, highpassHz: 0},
  {name: '-6 dB', gainDb: -6, highpassHz: 0},
  {name: '-14 dB', gainDb: -14, highpassHz: 0},
  {name: '-24 dB', gainDb: -24, highpassHz: 0},
  {name: 'hp 150 Hz', gainDb: 0, highpassHz: 150},
  {name: 'hp 300 Hz', gainDb: 0, highpassHz: 300},
  {name: '-14 dB + hp 150', gainDb: -14, highpassHz: 150},
  {name: '-14 dB + hp 300', gainDb: -14, highpassHz: 300},
  {name: '-24 dB + hp 150', gainDb: -24, highpassHz: 150},
  {name: '-24 dB + hp 300', gainDb: -24, highpassHz: 300},
];

/** Scales the samples so the loudest is at -1 dBFS, as a mastered release peaks */
function master(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let peak = 0;

  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  const scale = peak > 0 ? 0.891 / peak : 1;

  return samples.map(sample => sample * scale);
}

/** Adds `voice(t)` for `length` seconds at `start` seconds */
function mixIn(target: Float32Array, start: number, length: number, voice: (t: number) => number): void {
  const first = Math.round(start * sampleRate);
  const end = Math.min(target.length, first + Math.round(length * sampleRate));

  for (let i = first; i < end; i += 1) {
    target[i] += voice((i - first) / sampleRate);
  }
}

type Kit = {kick: boolean[]; snare: boolean[]; hat: boolean[]};

/** One bar of eighth notes, repeated: a kick that sweeps 150 to 50 Hz, a noise snare, a noise hat */
function drums(bpm: number, kit: Kit, level = 1): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(seconds * sampleRate);
  const noise = createNoise(sampleRate, 7);
  const eighth = 30 / bpm;

  for (let step = 0; step * eighth < seconds; step += 1) {
    const start = step * eighth;
    const slot = step % 8;

    if (kit.kick[slot]) {
      mixIn(samples, start, 0.3, t => level * 0.9 * Math.exp(-t * 12) * Math.sin(2 * Math.PI * ((50 * t) + ((100 / 25) * (1 - Math.exp(-t * 25))))));
    }

    if (kit.snare[slot]) {
      mixIn(samples, start, 0.2, t => level * ((0.5 * Math.exp(-t * 20) * noise[Math.floor(t * sampleRate)]) + (0.3 * Math.exp(-t * 30) * Math.sin(2 * Math.PI * 180 * t))));
    }

    if (kit.hat[slot]) {
      // The difference of two noise samples is a crude highpass: a hat has no bass
      mixIn(samples, start, 0.05, t => {
        const i = Math.floor(t * sampleRate);
        return level * 0.3 * Math.exp(-t * 60) * (noise[i + 1] - noise[i]);
      });
    }
  }

  return samples;
}

const on = (...slots: number[]): boolean[] => Array.from({length: 8}, (_, i) => slots.includes(i));

/** A four-on-the-floor loop: kick on every beat, snare on 2 and 4, hats on the offbeats */
export function createDrumLoop(bpm: number): Float32Array<ArrayBuffer> {
  return master(drums(bpm, {kick: on(0, 2, 4, 6), snare: on(2, 6), hat: on(1, 3, 5, 7)}));
}

/**
 * A full mix: a rock beat (kick on 1 and 3 only), a bass line on the eighths and a sustained chord pad,
 * so the bass is busy between the kicks and the pad fills the spectrum
 */
export function createFullMix(bpm: number): Float32Array<ArrayBuffer> {
  const samples = drums(bpm, {kick: on(0, 4), snare: on(2, 6), hat: on(0, 1, 2, 3, 4, 5, 6, 7)}, 0.8);
  const eighth = 30 / bpm;
  const bar = 8 * eighth;
  const roots = [55, 43.65, 65.41, 49];
  const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];

  for (let step = 0; step * eighth < seconds; step += 1) {
    const root = roots[Math.floor(step / 8) % roots.length];

    mixIn(samples, step * eighth, eighth * 0.9, t => 0.35 * Math.min(1, t * 200) * Math.exp(-t * 4)
      * (Math.sin(2 * Math.PI * root * t) + (0.4 * Math.sin(2 * Math.PI * 2 * root * t))));
  }

  for (let index = 0; index * bar < seconds; index += 1) {
    const chord = chords[index % chords.length];

    mixIn(samples, index * bar, bar, t => 0.12 * Math.min(1, t * 4) * chord.reduce((sum, hz) => sum + Math.sin(2 * Math.PI * hz * t), 0));
  }

  return master(samples);
}

/** The generated sources, a click train, a drum loop and a full mix, each built only when asked for */
const generated: ReadonlyMap<string, () => Source> = new Map([
  ['click 120', () => ({name: 'click 120', truth: 120, channels: [createClickTrack(120, sampleRate, seconds)]})],
  ['drum loop 124', () => ({name: 'drum loop 124', truth: 124, channels: [createDrumLoop(124)]})],
  ['full mix 96', () => ({name: 'full mix 96', truth: 96, channels: [createFullMix(96)]})],
]);

/** The generated source of that name */
export function generatedSource(name: string): Source {
  const build = generated.get(name);

  if (!build) {
    throw new Error(`No generated source is named ${name}`);
  }

  return build();
}

/**
 * Applies a variant's gain and highpass in an OfflineAudioContext. The highpass is two biquads with the Q
 * of a 4th-order Butterworth, 24 dB per octave: at 300 Hz a 60 Hz kick drops about 56 dB.
 */
export async function renderVariant(source: Source, variant: Variant): Promise<AudioBuffer> {
  const length = source.channels[0].length;
  const context = new OfflineAudioContext(source.channels.length, length, sampleRate);
  const buffer = context.createBuffer(source.channels.length, length, sampleRate);

  source.channels.forEach((channel, index) => {
    buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, index);
  });

  const node = context.createBufferSource();
  node.buffer = buffer;

  const gain = context.createGain();
  gain.gain.value = 10 ** (variant.gainDb / 20);
  node.connect(gain);

  let last: AudioNode = gain;

  if (variant.highpassHz > 0) {
    for (const q of [0.5412, 1.3066]) {
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = variant.highpassHz;
      highpass.Q.value = 20 * Math.log10(q);
      last.connect(highpass);
      last = highpass;
    }
  }

  last.connect(context.destination);
  node.start(0);

  return context.startRendering();
}

/** Encodes as a 16-bit PCM WAV, the way a file reaches the site */
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const {numberOfChannels: channels, length} = buffer;
  const bytes = new ArrayBuffer(44 + (length * channels * 2));
  const view = new DataView(bytes);
  const text = (offset: number, value: string): void => {
    [...value].forEach((char, i) => {
      view.setUint8(offset + i, char.charCodeAt(0));
    });
  };

  text(0, 'RIFF');
  view.setUint32(4, 36 + (length * channels * 2), true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, length * channels * 2, true);

  const data = Array.from({length: channels}, (_, c) => buffer.getChannelData(c));

  for (let i = 0; i < length; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const sample = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(44 + (((i * channels) + c) * 2), Math.round(sample * 32_767), true);
    }
  }

  return bytes;
}

/** Decodes as the site's file input does: a fresh AudioContext, decodeAudioData, then closed */
export async function decodeLikeTheSite(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const context = new AudioContext();

  try {
    return await context.decodeAudioData(bytes);
  } finally {
    await context.close();
  }
}

/** Loudest sample of channel 0, in dBFS */
export function peakDb(samples: Float32Array): number {
  let peak = 0;

  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  return 20 * Math.log10(peak);
}

export type Outcome = 'correct' | 'none' | '1/2' | '2' | '1/3' | '2/3' | '3/2' | '3' | 'other';

const relations: ReadonlyArray<readonly [Outcome, number]> = [
  ['1/3', 1 / 3], ['1/2', 1 / 2], ['2/3', 2 / 3], ['3/2', 3 / 2], ['2', 2], ['3', 3],
];

/** Sorts a reading as the benchmark does: correct within 4%, else its metrical relation, halves and doubles apart */
export function classify(bpm: number | undefined, truth: number): Outcome {
  if (bpm === undefined) {
    return 'none';
  }

  const near = (factor: number): boolean => Math.abs(bpm - (truth * factor)) <= toleranceRatio * truth * factor;

  if (near(1)) {
    return 'correct';
  }

  return relations.find(([, factor]) => near(factor))?.[0] ?? 'other';
}
