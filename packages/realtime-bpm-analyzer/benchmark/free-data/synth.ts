/**
 * Music generated from code: no sample, no third-party audio, no generative model, so nothing but
 * this file decides the tempo and the key, and both are exact. Deterministic per seed. It covers the
 * fast styles real data lacks. It proves nothing about real music, so it never counts towards the
 * real-track target and never sits in a held-out split.
 */

export const sampleRate = 44_100;

const stepsPerBar = 16;

export type Mode = 'major' | 'minor';

export type Style = {
  readonly name: string;
  readonly bpmRange: readonly [number, number];
  /** Steps of a 16-step bar holding a kick, a snare, a closed hat */
  readonly kick: readonly number[];
  readonly snare: readonly number[];
  readonly hat: readonly number[];
  readonly bass: readonly number[];
  /** Scale degrees, one chord per two bars */
  readonly progression: readonly number[];
};

const even = [0, 2, 4, 6, 8, 10, 12, 14];
const offbeat = [2, 6, 10, 14];

export const styles: readonly Style[] = [
  {name: 'drum-and-bass', bpmRange: [165, 180], kick: [0, 10], snare: [4, 12], hat: even, bass: [0, 3, 6, 10, 14], progression: [0, 5, 3, 4]},
  {name: 'jungle', bpmRange: [160, 175], kick: [0, 7, 10], snare: [4, 9, 12, 15], hat: even, bass: [0, 10], progression: [0, 3, 0, 4]},
  {name: 'gabber', bpmRange: [170, 200], kick: [0, 4, 8, 12], snare: [], hat: offbeat, bass: [0, 4, 8, 12], progression: [0, 0, 5, 4]},
  {name: 'hard-trance', bpmRange: [140, 155], kick: [0, 4, 8, 12], snare: [4, 12], hat: offbeat, bass: offbeat, progression: [0, 5, 2, 6]},
  // Half-time on purpose: the pulse a listener taps is ambiguous, which is the error being studied
  {name: 'dubstep', bpmRange: [140, 150], kick: [0, 10], snare: [8], hat: even, bass: [0, 3, 6, 11], progression: [0, 5, 0, 3]},
  {name: 'footwork', bpmRange: [155, 165], kick: [0, 3, 6, 10, 13], snare: [4, 12], hat: even, bass: [0, 6, 13], progression: [0, 3, 4, 0]},
  {name: 'techno', bpmRange: [140, 155], kick: [0, 4, 8, 12], snare: [], hat: offbeat, bass: [2, 6, 10, 14], progression: [0, 0, 3, 0]},
];

export type SectionKind = 'intro' | 'build' | 'breakdown' | 'drop' | 'outro';

export type SectionPlan = {readonly kind: SectionKind; readonly bars: number};

export const defaultStructure: readonly SectionPlan[] = [
  {kind: 'intro', bars: 8},
  {kind: 'build', bars: 8},
  {kind: 'drop', bars: 16},
  {kind: 'breakdown', bars: 8},
  {kind: 'build', bars: 8},
  {kind: 'drop', bars: 16},
  {kind: 'outro', bars: 8},
];

const parts: Readonly<Record<SectionKind, {readonly drums: boolean; readonly kick: boolean; readonly bass: boolean; readonly chords: boolean}>> = {
  intro: {drums: true, kick: true, bass: false, chords: false},
  build: {drums: true, kick: false, bass: false, chords: true},
  drop: {drums: true, kick: true, bass: true, chords: true},
  // A breakdown keeps no percussion at all: the case a tempo reading has to hold through
  breakdown: {drums: false, kick: false, bass: false, chords: true},
  outro: {drums: true, kick: true, bass: false, chords: false},
};

export type TrackSpec = {
  readonly style: Style;
  readonly bpm: number;
  readonly tonic: number;
  readonly mode: Mode;
  readonly seed: number;
  readonly structure: readonly SectionPlan[];
};

export type SectionLabel = {readonly kind: SectionKind; readonly startSeconds: number; readonly endSeconds: number};

export type GeneratedTrack = {
  readonly pcm: Float32Array;
  readonly sections: readonly SectionLabel[];
  /** Sample of each beat, for the exactness a label promises */
  readonly beatSamples: readonly number[];
  readonly key: string;
};

const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const scales: Readonly<Record<Mode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

/** Mulberry32, so noise and choices depend on the seed alone */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6D_2B_79_F5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);

    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function frequencyOf(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * The sample a step starts on. From the bar's count, never by adding a rounded length: rounding would
 * drift, and the tempo would stop being what the label says.
 */
function stepSample(bpm: number, step: number): number {
  return Math.round(step * (60 / bpm / 4) * sampleRate);
}

function addAt(pcm: Float32Array, start: number, length: number, voice: (index: number) => number): void {
  const end = Math.min(pcm.length, start + length);

  for (let i = start; i < end; i += 1) {
    pcm[i] += voice(i - start);
  }
}

function kick(pcm: Float32Array, start: number): void {
  let phase = 0;

  addAt(pcm, start, Math.floor(0.16 * sampleRate), index => {
    const time = index / sampleRate;

    phase += (2 * Math.PI * (50 + (120 * Math.exp(-time * 40)))) / sampleRate;

    return 0.9 * Math.sin(phase) * Math.exp(-time * 22);
  });
}

function snare(pcm: Float32Array, start: number, random: () => number): void {
  addAt(pcm, start, Math.floor(0.14 * sampleRate), index => {
    const time = index / sampleRate;

    return ((0.35 * ((random() * 2) - 1)) + (0.25 * Math.sin(2 * Math.PI * 190 * time))) * Math.exp(-time * 26);
  });
}

function hat(pcm: Float32Array, start: number, random: () => number): void {
  let previous = 0;

  addAt(pcm, start, Math.floor(0.03 * sampleRate), index => {
    const noise = (random() * 2) - 1;
    const high = noise - previous;

    previous = noise;

    return 0.12 * high * Math.exp(-(index / sampleRate) * 160);
  });
}

function saw(pcm: Float32Array, start: number, length: number, frequency: number, level: number): void {
  addAt(pcm, start, length, index => {
    const cycle = (index * frequency) / sampleRate;
    const fade = Math.min(1, index / 200, (length - index) / 200);

    return level * fade * (2 * (cycle - Math.floor(cycle)) - 1);
  });
}

function rootOf(spec: TrackSpec, degree: number, octave: number): number {
  const scale = scales[spec.mode];

  return spec.tonic + (12 * octave) + scale[degree % scale.length];
}

function renderBar(pcm: Float32Array, spec: TrackSpec, bar: number, kind: SectionKind, random: () => number): void {
  const {style, bpm} = spec;
  const part = parts[kind];
  const firstStep = bar * stepsPerBar;
  const stepAt = (step: number) => stepSample(bpm, firstStep + step);
  const degree = style.progression[Math.floor(bar / 2) % style.progression.length];

  if (part.drums) {
    style.hat.forEach(step => { hat(pcm, stepAt(step), random); });
    style.snare.forEach(step => { snare(pcm, stepAt(step), random); });
  }

  if (part.kick) {
    style.kick.forEach(step => { kick(pcm, stepAt(step)); });
  }

  if (part.bass) {
    const root = frequencyOf(rootOf(spec, degree, 2));

    style.bass.forEach(step => { saw(pcm, stepAt(step), stepAt(step + 2) - stepAt(step), root, 0.28); });
  }

  if (part.chords) {
    const scale = scales[spec.mode];
    const length = stepAt(stepsPerBar) - stepAt(0);

    for (const offset of [0, 2, 4]) {
      const octaves = Math.floor((degree + offset) / scale.length);

      saw(pcm, stepAt(0), length, frequencyOf(rootOf(spec, degree + offset, 4 + octaves)), 0.06);
    }
  }
}

/**
 * Renders one track
 * @param spec What to make
 * @returns Mono audio with its labels
 * @throws {Error} When the tempo is outside the style's range, or the structure is empty
 */
export function generateTrack(spec: TrackSpec): GeneratedTrack {
  const [low, high] = spec.style.bpmRange;

  if (spec.bpm < low || spec.bpm > high || spec.structure.length === 0) {
    throw new Error(`${spec.bpm} BPM is outside ${spec.style.name}, or the structure is empty`);
  }

  const random = randomFrom(spec.seed);
  const totalBars = spec.structure.reduce((sum, section) => sum + section.bars, 0);
  const pcm = new Float32Array(stepSample(spec.bpm, totalBars * stepsPerBar));
  const sections: SectionLabel[] = [];
  let bar = 0;

  for (const section of spec.structure) {
    for (let i = 0; i < section.bars; i += 1) {
      renderBar(pcm, spec, bar + i, section.kind, random);
    }

    sections.push({
      kind: section.kind,
      startSeconds: stepSample(spec.bpm, bar * stepsPerBar) / sampleRate,
      endSeconds: stepSample(spec.bpm, (bar + section.bars) * stepsPerBar) / sampleRate,
    });
    bar += section.bars;
  }

  const peak = pcm.reduce((max, value) => Math.max(max, Math.abs(value)), 1e-6);

  return {
    pcm: pcm.map(value => (value / peak) * 0.9),
    sections,
    beatSamples: Array.from({length: totalBars * 4}, (_, beat) => stepSample(spec.bpm, beat * 4)),
    key: `${notes[spec.tonic % 12]} ${spec.mode}`,
  };
}

/**
 * Picks a tempo, key and style from a seed. Integer tempos across each style's range, because a
 * label is only exact if it is the number the code used.
 * @param seed Which track
 * @param structure Sections to render
 * @returns The spec
 */
export function specFromSeed(seed: number, structure: readonly SectionPlan[] = defaultStructure): TrackSpec {
  const random = randomFrom(seed);
  const style = styles[Math.floor(random() * styles.length)];
  const [low, high] = style.bpmRange;

  return {
    style,
    bpm: low + Math.floor(random() * (high - low + 1)),
    tonic: Math.floor(random() * 12),
    mode: random() < 0.75 ? 'minor' : 'major',
    seed,
    structure,
  };
}

/**
 * Mono PCM as a 16-bit WAV file
 * @param pcm Samples in -1 to 1
 * @returns The file's bytes
 */
export function encodeWav(pcm: Float32Array): Uint8Array {
  const headerSize = 44;
  const bytes = new Uint8Array(headerSize + (pcm.length * 2));
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    [...value].forEach((char, index) => { view.setUint8(at + index, char.charCodeAt(0)); });
  };

  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((value, index) => {
    view.setInt16(headerSize + (index * 2), Math.round(Math.max(-1, Math.min(1, value)) * 32_767), true);
  });

  return bytes;
}
