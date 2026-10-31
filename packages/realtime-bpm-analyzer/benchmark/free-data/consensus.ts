import {fnv1a} from '../lib/split';
import type {Confidence, TempoVote} from './manifest';

/** The tolerance every tempo number in this repo uses (Gouyon et al. 2006) */
const tolerance = 0.04;

export type TempoRelation = 'same' | 'half' | 'double' | 'other';

/**
 * How a tempo reads against a reference.
 * @param tempo The tempo judged
 * @param reference What it is judged against
 * @returns `half` when the tempo is half the reference, `double` when it is twice it
 */
export function relationOf(tempo: number, reference: number): TempoRelation {
  const within = (ratio: number) => Math.abs(tempo / (reference * ratio) - 1) <= tolerance;

  if (within(1)) {
    return 'same';
  }

  if (within(0.5)) {
    return 'half';
  }

  return within(2) ? 'double' : 'other';
}

export type TempoConsensus = {
  readonly bpm: number | null;
  readonly confidence: Confidence;
  /** Trackers read one tempo at different octaves, the error this whole set exists to measure */
  readonly octaveSplit: boolean;
  /**
   * With no label, what the first vote read, for counting what a person could still confirm. It is
   * never a label: the first vote is the tracker with no tempo prior, which is a reason to listen
   * to it first, not a reason to believe it alone.
   */
  readonly candidateBpm: number | null;
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * The label independent trackers support, with no hint among them: a hint that voted could not be
 * measured against the result. Agreement is not truth, as two trackers can share a bias towards one
 * octave, which is why a random sample goes to a person whatever the agreement.
 * @param votes One reading per tracker
 * @returns The tempo, with how far to trust it
 */
export function tempoConsensus(votes: readonly TempoVote[]): TempoConsensus {
  const readings = votes.flatMap(vote => (vote.bpm !== null && vote.bpm > 0 ? [vote.bpm] : []));
  const first = votes[0]?.bpm ?? null;
  const octaveSplit = readings.some(a => readings.some(b => relationOf(a, b) === 'half'));
  const best = readings
    .map(reading => readings.filter(other => relationOf(other, reading) === 'same'))
    .sort((a, b) => b.length - a.length)[0] ?? [];

  if (best.length < 2) {
    return {bpm: null, confidence: 'unresolved', octaveSplit, candidateBpm: first !== null && first > 0 ? first : null};
  }

  return {
    bpm: Math.round(median(best) * 100) / 100,
    confidence: best.length === votes.length ? 'trackers-all' : 'trackers-two',
    octaveSplit,
    candidateBpm: null,
  };
}

export type HintVerdict = TempoRelation | 'no-hint' | 'no-label';

/**
 * How the uploader's tempo reads against the label: half and double stay apart, as the report needs.
 * @param hint Uploader's tempo
 * @param label The label
 * @returns The verdict
 */
export function hintVerdict(hint: number | null, label: number | null): HintVerdict {
  if (hint === null) {
    return 'no-hint';
  }

  return label === null ? 'no-label' : relationOf(hint, label);
}

/**
 * Keys in one spelling, so two trackers can be compared: sharps, and `minor` or `major` spelled out.
 * @param key Key as a tracker gives it
 * @returns Normal form, or null when it says nothing
 */
export function normaliseKey(key: string): string | null {
  const match = /^\s*([A-Ga-g])([#b♯♭]?)[\s:_-]*(major|minor|maj|min|m)?\s*$/.exec(key);

  if (!match) {
    return null;
  }

  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const natural = notes.indexOf(match[1].toUpperCase());
  const shift = /[#♯]/.test(match[2]) ? 1 : (/[b♭]/.test(match[2]) ? -1 : 0);
  const mode = match[3] === undefined || match[3].startsWith('maj') ? 'major' : 'minor';

  return `${notes[(natural + shift + 12) % 12]} ${mode}`;
}

/**
 * A key candidate only when every tracker agrees exactly. Key has no human or expert label here, so
 * anything short of full agreement stays open.
 * @param votes One key per tracker, in any spelling
 * @returns The key, or null
 */
export function keyConsensus(votes: readonly string[]): string | null {
  const keys = votes.map(key => normaliseKey(key));

  return keys.length >= 2 && keys[0] !== null && keys.every(key => key === keys[0]) ? keys[0] : null;
}

export type ConfirmationInput = {
  readonly id: string;
  readonly confidence: Confidence;
  readonly octaveSplit: boolean;
  readonly band: string;
};

/**
 * What a person should listen to: a random sample, drawn blind to the result, which measures how
 * good agreement really is, and the disagreements, fast bands first, capped so the ask stays small.
 * Rows named both ways count once, as `random`, so the sample stays representative.
 * @param rows Real tracks
 * @param seed Fixed seed
 * @param sampleSize Tracks in the random sample
 * @param disagreementCap Most disagreements to ask about
 * @returns Ids with why each was picked
 */
export function pickForConfirmation(
  rows: readonly ConfirmationInput[],
  seed: string,
  sampleSize: number,
  disagreementCap: number,
): ReadonlyArray<{readonly id: string; readonly why: 'random' | 'disagreement'}> {
  const shuffled = [...rows].sort((a, b) => fnv1a(`${seed}:${a.id}`) - fnv1a(`${seed}:${b.id}`) || (a.id < b.id ? -1 : 1));
  const random = shuffled.slice(0, sampleSize);
  const inSample = new Set(random.map(row => row.id));
  const isOpen = (row: ConfirmationInput) => row.confidence === 'unresolved' || row.octaveSplit;
  const rank = (row: ConfirmationInput) => (row.band === '165+' ? 0 : (row.band === '140-165' ? 1 : 2));
  const open = shuffled
    .filter(row => isOpen(row) && !inSample.has(row.id))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, disagreementCap);

  return [
    ...random.map(row => ({id: row.id, why: 'random' as const})),
    ...open.map(row => ({id: row.id, why: 'disagreement' as const})),
  ];
}
