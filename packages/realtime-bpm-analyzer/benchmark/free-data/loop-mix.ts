import {fnv1a} from '../lib/split';
import {sampleRate} from './synth';
import type {SectionKind, SectionLabel, SectionPlan} from './synth';

/**
 * Mixes arranged from FSLD loops with exact tempo and structure. Loops come from fsld's dev side only,
 * so nothing a mix holds can also be in fsld's held-out split.
 */

export type LoopRole = 'percussion' | 'bass' | 'harmony';

export type Loop = {
  readonly id: string;
  /** The annotators' tempo, as this set's label is built on it */
  readonly bpm: number;
  readonly role: LoopRole;
  /** Null for a percussion loop, and required of the others */
  readonly key: string | null;
  readonly licence: string;
  readonly attribution: string;
  readonly uploader: string;
};

export type MixPlan = {
  readonly bpm: number;
  readonly key: string;
  readonly loops: Readonly<Record<LoopRole, Loop>>;
};

/** A larger correction is a wrong cut or a wrong label, and it would audibly bend the key */
export const mostCorrection = 0.015;

function pick(loops: readonly Loop[], seed: string): Loop | undefined {
  return [...loops].sort((a, b) => fnv1a(`${seed}:${a.id}`) - fnv1a(`${seed}:${b.id}`))[0];
}

/**
 * Plans mixes: one percussion, bass and harmony loop per mix, at one annotated tempo, with bass and
 * harmony annotated in one key. Tempos and keys come from the annotators, never from a tracker.
 * @param loops Loops of fsld's dev side
 * @param seed Fixed seed
 * @param wanted Most mixes
 * @returns Plans, fastest first
 */
export function planMixes(loops: readonly Loop[], seed: string, wanted: number): MixPlan[] {
  const tempos = [...new Set(loops.map(loop => loop.bpm))].sort((a, b) => b - a);
  const plans: MixPlan[] = [];

  for (const bpm of tempos) {
    const atTempo = loops.filter(loop => loop.bpm === bpm);
    const keys = [...new Set(atTempo.flatMap(loop => (loop.key === null ? [] : [loop.key])))].sort();

    for (const key of keys) {
      const percussion = pick(atTempo.filter(loop => loop.role === 'percussion'), `${seed}:${bpm}:${key}`);
      const bass = pick(atTempo.filter(loop => loop.role === 'bass' && loop.key === key), `${seed}:${bpm}:${key}`);
      const harmony = pick(atTempo.filter(loop => loop.role === 'harmony' && loop.key === key), `${seed}:${bpm}:${key}`);

      if (percussion && bass && harmony && plans.length < wanted) {
        plans.push({bpm, key, loops: {percussion, bass, harmony}});
      }
    }
  }

  return plans;
}

/**
 * Whole bars a loop spans at a tempo, and the speed correction that makes it exact.
 * @param samples Length of the loop
 * @param bpm Its tempo
 * @returns Bars and correction, or null when no whole-bar reading is close enough
 */
export function barFit(samples: number, bpm: number): {readonly bars: number; readonly correction: number} | null {
  const barSamples = (240 / bpm) * sampleRate;
  const bars = Math.round(samples / barSamples);

  if (bars < 1) {
    return null;
  }

  const correction = samples / (bars * barSamples);

  return Math.abs(correction - 1) <= mostCorrection ? {bars, correction} : null;
}

const heard: Readonly<Record<SectionKind, readonly LoopRole[]>> = {
  intro: ['percussion'],
  build: ['percussion', 'harmony'],
  drop: ['percussion', 'bass', 'harmony'],
  breakdown: ['harmony'],
  outro: ['percussion'],
};

/** Linear interpolation, at most 1.5% off: this corrects a cut, it is not a time-stretch */
function sampleLoop(loop: Float32Array, position: number): number {
  const wrapped = position % loop.length;
  const before = Math.floor(wrapped);
  const fraction = wrapped - before;

  return (loop[before] * (1 - fraction)) + (loop[(before + 1) % loop.length] * fraction);
}

/**
 * Renders a plan. The grid is computed from the bar count, so a mix's tempo is its label exactly.
 * @param plan What to mix
 * @param audio Mono audio of each role, at this module's sample rate
 * @param structure Sections
 * @returns Audio and section labels
 * @throws {Error} When a loop does not fit whole bars, which is reported rather than bent to fit
 */
export function renderMix(
  plan: MixPlan,
  audio: Readonly<Record<LoopRole, Float32Array>>,
  structure: readonly SectionPlan[],
): {readonly pcm: Float32Array; readonly sections: readonly SectionLabel[]} {
  const barSamples = (240 / plan.bpm) * sampleRate;
  const roles: readonly LoopRole[] = ['percussion', 'bass', 'harmony'];
  const fits = roles.map(role => {
    const fit = barFit(audio[role].length, plan.bpm);

    if (fit === null) {
      throw new Error(`${plan.loops[role].id} does not fit whole bars at ${plan.bpm} BPM`);
    }

    return {role, step: fit.correction};
  });
  const totalBars = structure.reduce((sum, section) => sum + section.bars, 0);
  const pcm = new Float32Array(Math.round(totalBars * barSamples));
  const sections: SectionLabel[] = [];
  let bar = 0;

  for (const section of structure) {
    const start = Math.round(bar * barSamples);
    const end = Math.round((bar + section.bars) * barSamples);

    for (const {role, step} of fits.filter(fit => heard[section.kind].includes(fit.role))) {
      for (let i = start; i < end; i += 1) {
        pcm[i] += sampleLoop(audio[role], i * step) / 3;
      }
    }

    sections.push({kind: section.kind, startSeconds: start / sampleRate, endSeconds: end / sampleRate});
    bar += section.bars;
  }

  const peak = pcm.reduce((max, value) => Math.max(max, Math.abs(value)), 1e-6);

  return {pcm: pcm.map(value => (value / peak) * 0.9), sections};
}

/**
 * The licence of a mix: attribution is owed if any loop owes it. CC0 alone needs none.
 * @param plan The mix
 * @returns A licence every loop allows, with an attribution line per loop
 */
export function mixLicence(plan: MixPlan): {readonly licence: string; readonly attribution: string} {
  const loops = Object.values(plan.loops);
  const owed = [...new Set(loops.map(loop => loop.licence).filter(licence => licence !== 'CC0-1.0'))].sort();

  return {
    licence: owed.length === 0 ? 'CC0-1.0' : owed.join(' AND '),
    attribution: loops.map(loop => loop.attribution).join(' ; '),
  };
}
