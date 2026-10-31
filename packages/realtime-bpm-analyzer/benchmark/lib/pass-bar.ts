import {tuningSets} from './licences';
import {isCorrect, isOctaveCorrect} from './metrics';
import {fnv1a} from './split';
import type {TrackResult} from './types';

/**
 * The bar of RBA-51's DECISION of 2026-10-31 for the extension to leave peaks, as code, committed before
 * the second look so that its reading cannot follow the numbers. Where the DECISION leaves a reading
 * open, the one taken is written next to the check, and any failure keeps the extension on peaks.
 *
 * "The noise" is a 95% percentile range from a paired bootstrap that resamples whole groups: tracks of
 * one uploader, session, album or progression are not independent evidence, and detectors are compared
 * on the same resample because they ran on the same tracks.
 */

export const candidate = 'tempogram-extension';
export const reference = 'peaks';
export const reference285 = 'tempogram-285-90-180';

/** Tracks a whole look holds per set: the frozen held-out splits less GTZAN's 20 listed exclusions */
export const heldoutTracks: Readonly<Record<string, number>> = {fsld: 718, 'fsld-nc': 319, groove: 127, guitarset: 180, giantsteps: 326, ballroom: 358, gtzan: 480};

const replicates = 4000;
const seed = 'rba-51-look-2';
const rangeMin = 90;
const rangeMax = 180;

export type Metric = 'acc1' | 'acc2' | 'falseStable' | 'coverage';
export type Interval = {readonly value: number; readonly low: number; readonly high: number};
export type TrackFilter = (result: TrackResult) => boolean;

/** Which tracks a row reads. Macro averages the sets' shares, pooled counts tracks */
export type Scope = {readonly name: string; readonly sets?: ReadonlySet<string>; readonly tracks?: TrackFilter; readonly macro?: true};

/** A numerator and a denominator per track, so that a share can be summed over a group */
const tallies: Readonly<Record<Metric, (result: TrackResult) => readonly [number, number]>> = {
  acc1: ({final, truth}) => [final !== null && isCorrect(final, truth) ? 1 : 0, 1],
  acc2: ({final, truth}) => [final !== null && isOctaveCorrect(final, truth) ? 1 : 0, 1],
  falseStable: ({stable, truth}) => [stable.filter(([, bpm]) => !isCorrect(bpm, truth)).length, stable.length],
  coverage: ({stable}) => [stable.length > 0 ? 1 : 0, 1],
};

/**
 * @param metric The metric
 * @param numerator Its sum
 * @param denominator Its sum
 * @returns The share. Without one stable reading false-stable is 1, as in lib/sweep.ts: silence must not pass for accuracy
 */
function shareOf(metric: Metric, numerator: number, denominator: number): number {
  if (denominator > 0) {
    return numerator / denominator;
  }

  return metric === 'falseStable' ? 1 : 0;
}

/** Labelled tempo the range cannot read true: the DECISION counts these apart */
export const outOfRange: TrackFilter = ({truth}) => truth < rangeMin || truth > rangeMax;

const inBand = (min: number, max: number): TrackFilter => ({truth}) => truth >= min && truth < max;

/** The two bands bar 2 reads. 165+ stops at the range's end, inclusive, since 180 can read true */
export const gatedBands: ReadonlyArray<{readonly name: string; readonly tracks: TrackFilter}> = [
  {name: '140-165', tracks: inBand(140, 165)},
  {name: '165-180', tracks: ({truth}) => truth >= 165 && truth <= rangeMax},
];

/** Bands reported beside the bar, out-of-range ones apart. None of these gates anything */
export const reportedBands: ReadonlyArray<{readonly name: string; readonly tracks: TrackFilter}> = [
  {name: 'under 90 (out of range)', tracks: ({truth}) => truth < rangeMin},
  {name: '90-120', tracks: inBand(rangeMin, 120)},
  {name: '120-140', tracks: inBand(120, 140)},
  {name: '140-150', tracks: inBand(140, 150)},
  {name: '150-156', tracks: inBand(150, 156)},
  {name: '156-165', tracks: inBand(156, 165)},
  ...gatedBands,
  {name: 'over 180 (out of range)', tracks: ({truth}) => truth > rangeMax},
];

/** Every set over the same tracks for all detectors, or the comparison means nothing */
function pairUp(results: Readonly<Record<string, readonly TrackResult[]>>, names: readonly string[]): TrackResult[][] {
  const keyOf = ({set, id}: TrackResult) => `${set}/${id}`;
  const [first, ...others] = names.map(name => results[name]);

  return first.map(result => [result, ...others.map(list => {
    const twin = list.find(other => keyOf(other) === keyOf(result));

    if (twin === undefined) {
      throw new Error(`${keyOf(result)} is missing from a detector`);
    }

    return twin;
  })]);
}

type Cluster = {readonly stratum: string; readonly tally: Float64Array};

// A set's slots in a tally: numerator and denominator per side, the second side the one subtracted
const slots = 4;

/** fsld-nc shares uploaders with fsld, so the two resample together when a row holds both */
const stratumOf = (set: string) => (set === 'fsld-nc' ? 'fsld' : set);

function clustersOf(rows: ReadonlyArray<readonly TrackResult[]>, sets: readonly string[], metric: Metric): Cluster[] {
  const clusters = new Map<string, Cluster>();

  for (const row of rows) {
    const [{set, group}] = row;

    if (group === undefined) {
      throw new Error(`${set}/${row[0].id} has no group, so no group-aware range exists`);
    }

    const stratum = stratumOf(set);
    const key = `${stratum}/${group}`;
    const cluster = clusters.get(key) ?? {stratum, tally: new Float64Array(sets.length * slots)};
    const at = sets.indexOf(set) * slots;

    clusters.set(key, cluster);

    for (const [side, result] of row.entries()) {
      const [numerator, denominator] = tallies[metric](result);

      cluster.tally[at + (side * 2)] += numerator;
      cluster.tally[at + (side * 2) + 1] += denominator;
    }
  }

  return [...clusters.values()];
}

/** The share of side A, less side B's when there is one, macro over the sets or pooled */
function statistic(tally: Float64Array, metric: Metric, macro: boolean, sides: number): number {
  const sets = tally.length / slots;
  const side = (at: number) => {
    if (macro) {
      let sum = 0;

      for (let set = 0; set < sets; set += 1) {
        sum += shareOf(metric, tally[(set * slots) + at], tally[(set * slots) + at + 1]);
      }

      return sum / sets;
    }

    let numerator = 0;
    let denominator = 0;

    for (let set = 0; set < sets; set += 1) {
      numerator += tally[(set * slots) + at];
      denominator += tally[(set * slots) + at + 1];
    }

    return shareOf(metric, numerator, denominator);
  };

  return sides === 2 ? side(0) - side(2) : side(0);
}

/** Mulberry32: a seeded stream, so the same file always gives the same verdict */
function seededRandom(text: string): () => number {
  let state = fnv1a(text);

  return () => {
    state = (state + 0x6D_2B_79_F5) | 0;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * @param clusters The groups in a row
 * @param read Its statistic over a summed tally
 * @param label Seeds this row's stream, so that rows do not share their resamples by accident
 * @returns The statistic, with a 95% percentile range from resampling groups within each set
 */
function bootstrap(clusters: readonly Cluster[], read: (tally: Float64Array) => number, label: string): Interval {
  const size = clusters[0].tally.length;
  const total = new Float64Array(size);

  for (const {tally} of clusters) {
    for (let i = 0; i < size; i += 1) {
      total[i] += tally[i];
    }
  }

  const strata = [...new Set(clusters.map(({stratum}) => stratum))].map(name => clusters.filter(({stratum}) => stratum === name));
  const random = seededRandom(`${seed}:${label}`);
  const draws = new Float64Array(replicates);

  for (let replicate = 0; replicate < replicates; replicate += 1) {
    const sum = new Float64Array(size);

    for (const stratum of strata) {
      for (let drawn = 0; drawn < stratum.length; drawn += 1) {
        const {tally} = stratum[Math.floor(random() * stratum.length)];

        for (let i = 0; i < size; i += 1) {
          sum[i] += tally[i];
        }
      }
    }

    draws[replicate] = read(sum);
  }

  draws.sort();

  return {value: read(total), low: draws[Math.floor(replicates * 0.025)], high: draws[Math.ceil(replicates * 0.975) - 1]};
}

/**
 * @param results Every detector's results
 * @param names One detector for its own range, two for the first less the second
 * @param metric The metric
 * @param scope The tracks
 * @returns The estimate and its range, null when the scope holds no track
 */
export function measure(results: Readonly<Record<string, readonly TrackResult[]>>, names: readonly string[], metric: Metric, scope: Scope): Interval | null {
  const rows = pairUp(results, names).filter(([result]) => (scope.sets?.has(result.set) ?? true) && (scope.tracks?.(result) ?? true));

  if (rows.length === 0) {
    return null;
  }

  const sets = [...new Set(rows.map(([{set}]) => set))].sort();
  const clusters = clustersOf(rows, sets, metric);

  return bootstrap(clusters, tally => statistic(tally, metric, scope.macro ?? false, names.length), `${names.join('-')}:${metric}:${scope.name}`);
}

export type Condition = {
  /** The DECISION's number */
  readonly bar: 1 | 2 | 3 | 4;
  readonly what: string;
  /** Candidate less peaks. The range is reported for bar 4 too, which it does not decide */
  readonly difference: Interval | null;
  readonly rule: string;
  readonly isMet: boolean;
};

const clean: Scope = {name: 'clean, macro', sets: tuningSets, macro: true};
const pooled: Scope = {name: 'all sets, pooled'};
const cleanPooled: Scope = {name: 'clean, pooled', sets: tuningSets};

/**
 * Bar 2, read as: each gated band, each of Acc1 and Acc2, over all sets and over clean sets, tracks
 * pooled. A band with no tracks fails: no evidence is no pass.
 */
function fastBands(results: Readonly<Record<string, readonly TrackResult[]>>): Condition[] {
  return gatedBands.flatMap(({name, tracks}) => (['acc1', 'acc2'] as const).flatMap(metric => [pooled, cleanPooled].map(scope => {
    const difference = measure(results, [candidate, reference], metric, {...scope, name: `${name}, ${scope.name}`, tracks});

    return {bar: 2 as const, what: `${metric}, ${name}, ${scope.name}`, difference, rule: 'not below peaks beyond noise', isMet: difference !== null && difference.high >= 0};
  })));
}

/**
 * @param results Every detector's results on held-out, at 90 to 180 on the real path
 * @returns Each condition of the bar, applied
 */
export function passBar(results: Readonly<Record<string, readonly TrackResult[]>>): Condition[] {
  const above = (metric: Metric): Condition => {
    const difference = measure(results, [candidate, reference], metric, clean);

    return {bar: 1, what: `${metric}, clean, macro`, difference, rule: 'above peaks by more than the noise', isMet: difference !== null && difference.low > 0};
  };
  const giantSteps = measure(results, [candidate, reference], 'acc1', {name: 'giantsteps', sets: new Set(['giantsteps'])});
  // Bar 4 grants no noise, unlike the others, so the point estimate decides. Its scope is not stated:
  // both of the bar's whole-run readings must hold, the bands being reported beside it
  const falseStable = [clean, pooled].map((scope): Condition => {
    const difference = measure(results, [candidate, reference], 'falseStable', scope);

    return {bar: 4, what: `falseStable, ${scope.name}`, difference, rule: 'not above peaks, point estimate', isMet: difference !== null && difference.value <= 0};
  });

  return [
    above('acc1'),
    above('acc2'),
    ...fastBands(results),
    {bar: 3, what: 'acc1, giantsteps', difference: giantSteps, rule: 'not below peaks beyond noise', isMet: giantSteps !== null && giantSteps.high >= 0},
    ...falseStable,
  ];
}

export type Against285 = {readonly what: string; readonly difference: Interval | null; readonly beatsBeyondNoise: boolean};

/**
 * The DECISION's report to David, which gates nothing: #285 was tuned on sets the licence rule excludes.
 * @param results Every detector's results
 * @returns #285 less the candidate on 140 to 165, beyond noise when the whole range is above zero
 */
export function against285(results: Readonly<Record<string, readonly TrackResult[]>>): Against285[] {
  const tracks = gatedBands[0].tracks;

  return (['acc1', 'acc2'] as const).flatMap(metric => [pooled, cleanPooled].map(scope => {
    const difference = measure(results, [reference285, candidate], metric, {...scope, name: `285, ${scope.name}`, tracks});

    return {what: `${metric}, 140-165, ${scope.name}`, difference, beatsBeyondNoise: difference !== null && difference.low > 0};
  }));
}

/**
 * A verdict on a shrunk or lopsided run would read like one on the whole look.
 * @param file What the look wrote
 * @param file.results Per detector
 * @param file.skipped The tracks it could not decode, counted against their set
 * @param expected Tracks per set
 * @returns What is wrong with it, empty when it may be judged
 */
export function lookFaults(
  {results, skipped}: {readonly results: Readonly<Record<string, readonly TrackResult[]>>; readonly skipped: ReadonlyArray<{readonly set: string}>},
  expected: Readonly<Record<string, number>>,
): string[] {
  const names = [candidate, reference, reference285];
  const absent = names.filter(name => !Object.hasOwn(results, name));
  const extra = Object.keys(results).filter(name => !names.includes(name));

  if (absent.length > 0 || extra.length > 0) {
    return [`The look scores ${names.join(', ')}. Absent: ${absent.join(', ') || 'none'}, extra: ${extra.join(', ') || 'none'}`];
  }

  return names.flatMap(name => Object.entries(expected).flatMap(([set, tracks]) => {
    const found = results[name].filter(result => result.set === set).length;
    const lost = skipped.filter(result => result.set === set).length;

    return found + lost === tracks ? [] : [`${name} on ${set}: ${found} tracks and ${lost} skipped, for ${tracks}`];
  }));
}
