import {detectors} from './detectors';
import {undecodableLimit} from './look';
import {gatedBands, measure, reportedBands} from './pass-bar';
import type {Interval, Metric, Scope, TrackFilter} from './pass-bar';
import type {TrackResult} from './types';

/**
 * The pass bar of RBA-51's look at RBA-59's held-out free mixes, as code, committed before the look
 * so that its reading cannot follow the numbers. The bar is the one proposed on RBA-51 on 2026-11-03
 * (10:41Z), applied as the DECISION of 2026-11-03 (12:40Z) narrows it: the candidate is 5.5.0 as
 * shipped, so gate 3 and the half of gate 2 against 5.5.0 are void. Where the wording leaves a reading
 * open, the one taken is written beside the check. Any failure keeps peaks.
 *
 * The noise is lib/pass-bar.ts's: a 95% percentile range from a paired bootstrap, 4000 draws, fixed
 * seed, resampling whole groups, which for the free mixes are artists (`artistKey`).
 */

/** 5.5.0's tempogram as a caller gets it: `detector: 'tempogram'` and nothing else, as on the dev tables */
export const freeCandidate = 'tempogram';
/** Peaks as measured before: lowpass, its default 90 to 180, no reset timer */
export const freeReference = 'peaks';
/** What the look scores, and all it may */
export const freeLookDetectors: readonly string[] = [freeReference, freeCandidate];
/** The sets the look covers, whole: strict labels gate, contested ones are reported */
export const freeLookSets: readonly string[] = ['free-mixes', 'free-mixes-contested'];

const strictSet = 'free-mixes';
const strict: Scope = {name: 'free mixes, strict', sets: new Set([strictSet])};

export type FreeCondition = {
  /** The gate's number in the proposal */
  readonly gate: 1 | 2 | 4 | 5;
  readonly what: string;
  /** Candidate less peaks, null when the gate reads no data */
  readonly difference: Interval | null;
  readonly rule: string;
  readonly isMet: boolean;
  /** The same test at one standard error. It decides nothing */
  readonly isMetAtOneSe: boolean;
};

/** Gates the DECISION voids, printed so the verdict shows they were not forgotten */
export const voidGates: readonly string[] = [
  'Gate 2 against 5.5.0: void, the candidate is 5.5.0',
  'Gate 3 (Acc1 over 90 to 180 against 5.5.0): void, the candidate is 5.5.0',
];

/**
 * Gate 1. Read over every strict track, out-of-range labels included, as lib/pass-bar.ts read bar 1
 * and as the dev evidence beside the proposal was counted (4804 strict dev tracks). The in-range-only
 * reading is printed in the tables beside it and gates nothing.
 */
function above(results: Readonly<Record<string, readonly TrackResult[]>>, metric: Metric): FreeCondition {
  const difference = measure(results, [freeCandidate, freeReference], metric, strict);

  return {
    gate: 1,
    what: `${metric}, ${strict.name}`,
    difference,
    rule: 'above peaks: range wholly above zero',
    isMet: difference !== null && difference.low > 0,
    isMetAtOneSe: difference !== null && difference.narrowLow > 0,
  };
}

/** Gate 2, against peaks only. A band with no track fails: no evidence is no pass */
function fastBands(results: Readonly<Record<string, readonly TrackResult[]>>): FreeCondition[] {
  return gatedBands.flatMap(({name, tracks}) => (['acc1', 'acc2'] as const).map((metric): FreeCondition => {
    const difference = measure(results, [freeCandidate, freeReference], metric, {...strict, name: `${name}, ${strict.name}`, tracks});

    return {
      gate: 2,
      what: `${metric}, ${name}, ${strict.name}`,
      difference,
      rule: 'not below peaks beyond noise: range reaches zero or above',
      isMet: difference !== null && difference.high >= 0,
      isMetAtOneSe: difference !== null && difference.narrowHigh >= 0,
    };
  }));
}

/**
 * Gate 4: the point estimate decides, the proposal grants no noise. Peaks silent on the whole set would
 * read as all false and flatter the candidate, so that fails, as in lib/pass-bar.ts. Coverage is printed
 * beside it and gates nothing.
 */
function falseStable(results: Readonly<Record<string, readonly TrackResult[]>>): FreeCondition {
  const difference = measure(results, [freeCandidate, freeReference], 'falseStable', strict);
  const isPeaksSilent = results[freeReference].filter(({set}) => set === strictSet).every(({stable}) => stable.length === 0);
  const isMet = difference !== null && difference.value <= 0 && !isPeaksSilent;

  return {gate: 4, what: `falseStable, ${strict.name}`, difference, rule: 'not above peaks, point estimate', isMet, isMetAtOneSe: isMet};
}

/**
 * Gate 5 compares the candidate with 5.5.0 on the old clean sets' held-out halves. The candidate is
 * 5.5.0, so the two are one configuration and the difference is zero by construction: the gate is met
 * without reading those halves, and carries no evidence. "Is 5.5.0" is read off the detector's config:
 * the bare option, no lowpass, no tuning override. Any other candidate has no data here and fails, so
 * the shortcut cannot pass it.
 */
function noRegression(): FreeCondition {
  const {options, lowpass, tuning} = detectors[freeCandidate];
  const isSame = JSON.stringify(options) === JSON.stringify({detector: 'tempogram'}) && !lowpass && tuning === undefined;

  return {
    gate: 5,
    what: 'acc1, fsld + groove + guitarset held-out halves, clean macro, candidate less 5.5.0',
    difference: null,
    rule: 'not below 5.5.0 beyond noise. The candidate is 5.5.0: zero by construction, no data read',
    isMet: isSame,
    isMetAtOneSe: isSame,
  };
}

/**
 * @param results Peaks and the candidate on the held-out free mixes, real path, 90 to 180
 * @returns Each gate of the bar, applied
 */
export function freeLookBar(results: Readonly<Record<string, readonly TrackResult[]>>): FreeCondition[] {
  return [above(results, 'acc1'), above(results, 'acc2'), ...fastBands(results), falseStable(results), noRegression()];
}

/**
 * @param conditions The applied gates
 * @returns Whether the tempogram is eligible for David's ruling on the default: every gate met
 */
export function isFreeLookPassed(conditions: readonly FreeCondition[]): boolean {
  return conditions.length > 0 && conditions.every(({isMet}) => isMet);
}

const inRange: TrackFilter = ({truth}) => truth >= 90 && truth <= 180;

/** The rows reported beside the verdict. None of them gates anything */
export function freeLookScopes(): Scope[] {
  const contested: Scope = {name: 'free mixes, contested', sets: new Set(['free-mixes-contested'])};
  const bandsOf = (scope: Scope) => reportedBands.map(({name, tracks}): Scope => ({...scope, name: `${name}, ${scope.name}`, tracks}));

  return [
    strict,
    {...strict, name: 'free mixes, strict, labelled 90 to 180', tracks: inRange},
    ...['trackers-all', 'trackers-two'].map((label): Scope => ({...strict, name: `free mixes, strict, ${label}`, tracks: result => result.label === label})),
    contested,
    {...contested, name: 'free mixes, contested, labelled 90 to 180', tracks: inRange},
    ...['trackers-all', 'trackers-two'].map((label): Scope => ({...contested, name: `free mixes, contested, ${label}`, tracks: result => result.label === label})),
    ...bandsOf(strict),
    ...bandsOf(contested),
  ];
}

export type FreeLookFile = {
  readonly results: Readonly<Record<string, readonly TrackResult[]>>;
  readonly skipped: ReadonlyArray<{readonly set: string; readonly id: string}>;
  /** Tracks the loader gave per set, before any run: the denominator a whole look must account for */
  readonly tracks?: Readonly<Record<string, number>>;
};

/**
 * A verdict on a shrunk or lopsided run would read like one on the whole look.
 * @param file What the look wrote
 * @returns What is wrong with it, empty when it may be judged
 */
export function freeLookFaults({results, skipped, tracks}: FreeLookFile): string[] {
  const names = Object.keys(results);
  const isSame = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();

  if (!isSame(names, freeLookDetectors)) {
    return [`The look scores ${freeLookDetectors.join(', ')}, and the file holds ${names.join(', ') || 'nothing'}`];
  }

  if (tracks === undefined || !isSame(Object.keys(tracks), freeLookSets)) {
    return [`The file must count the loader's tracks for ${freeLookSets.join(', ')}`];
  }

  const counts = freeLookDetectors.flatMap(name => freeLookSets.flatMap(set => {
    const found = results[name].filter(result => result.set === set).length;
    const lost = skipped.filter(result => result.set === set).length;

    if (tracks[set] === 0) {
      return [`${set} has no track`];
    }

    return found + lost === tracks[set] ? [] : [`${name} on ${set}: ${found} tracks and ${lost} skipped, for ${tracks[set]}`];
  }));
  const keysOf = (name: string) => results[name].map(({set, id}) => `${set}/${id}`);
  const labelOf = new Map(results[freeCandidate].map(({set, id, truth}) => [`${set}/${id}`, truth]));
  const rows = freeLookDetectors.flatMap(name => [
    new Set(keysOf(name)).size === keysOf(name).length ? [] : [`${name} holds a track twice`],
    results[name].some(({group}) => group === undefined) ? [`${name} has tracks without a group`] : [],
    results[name].some(({set, id, truth}) => labelOf.get(`${set}/${id}`) !== truth) ? [`${name} disagrees with ${freeCandidate} on a label or a track`] : [],
  ].flat());
  const lost = new Set(skipped.map(({set, id}) => `${set}/${id}`)).size;

  return [...counts, ...rows, ...(lost > undecodableLimit ? [`${lost} tracks skipped, over the limit of ${undecodableLimit}`] : [])];
}
