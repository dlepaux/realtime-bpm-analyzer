import type {EngineName, Hysteresis} from '../../src/contract/types';
import {baseRowIndex, expandTrace, hysteresisFields, readingsAt, scoreReplay, sweepAxes, sweepGrids} from './hysteresis';
import type {HysteresisRecord, Sample, SweepRow} from './hysteresis';
import {offersOf} from './stream';
import type {EngineTraceStep} from './stream';
import type {TrackResult} from './types';

/**
 * RBA-106's hysteresis pick, committed before the sweep ran. Every range is a 95% percentile range from resampling
 * artists (the track's `group`) within each set, as the existing reports do. All rows are scored on the same
 * resamples, so a difference between two rows is paired.
 *
 * The rule, per engine, against the contract's values (the base row):
 * 1. A row is eligible when, beyond the noise, it does not flap more on steady tracks, does not take longer to its
 *    first lock (median), and does not lock fewer tracks. "Beyond the noise" means the range of its paired
 *    difference with the base excludes zero on the bad side.
 * 2. The best row is the eligible one with the lowest false-locked share.
 * 3. The pick is among the eligible rows whose false-locked share is not above the best's beyond the noise: an
 *    interior row first (no field at an edge of its axis), then the fewest fields moved from the base, then the lowest
 *    false-locked share, then grid order.
 * 4. When no such row is interior, the pick is flagged as unbracketed with the fields at an edge: the grid must be
 *    extended before it is used.
 */

/** The sweep's detectors, one per engine */
export const sweepDetectors: readonly string[] = ['tempogram-hysteresis', 'peaks-hysteresis'];

/** 1000, not the 4000 of the earlier reports: every one of the tempogram's rows is scored on each */
export const replicates = 1000;

const seed = 'rba-106-hysteresis';

/**
 * Tracks whose label is one steady tempo, where a lock falling back to settling is flapping and not a tempo change:
 * fsld's loops, played back repeated, and the strict free mixes, whose tempo holds through both halves (RBA-59).
 * GuitarSet, Groove and the contested mixes are left out: nothing in their labels says the tempo holds.
 */
export const isSteady = (set: string): boolean => set === 'fsld' || set === 'free-mixes';

export const metricNames = ['coverage', 'rightWhenLocked', 'falseLocked', 'flapping', 'lockLoss', 'medianFirstLock', 'p90FirstLock'] as const;

export type MetricName = (typeof metricNames)[number];

/** A value and its 95% range */
export type Interval = readonly [value: number, low: number, high: number];

export type RowReport = {
  readonly hysteresis: Hysteresis;
  readonly metrics: Readonly<Record<MetricName, Interval>>;
  /** This row less the base row, paired */
  readonly againstBase: Readonly<Record<MetricName, Interval>>;
  readonly eligible: boolean;
};

export type EnginePick = {
  readonly engine: EngineName;
  readonly tracks: number;
  readonly steadyTracks: number;
  readonly rows: readonly RowReport[];
  readonly base: number;
  readonly best: number;
  /** Rows within the noise of the best, eligible */
  readonly near: readonly number[];
  readonly pick: number;
  readonly bracketed: boolean;
  /** The pick's fields at an edge of their axis */
  readonly edgeFields: readonly string[];
  /** The pick less the best on false-locked, paired */
  readonly pickAgainstBest: Interval;
};

/** Sums per artist: tracks, locking tracks, right first locks, seconds locked, seconds locked wrong, and on steady tracks unlocks, losses and minutes */
const sums = 8;

type Cluster = {readonly stratum: string; readonly index: number};

/** Mulberry32 seeded from a string, so the same file always gives the same pick */
function seededRandom(text: string): () => number {
  let state = 2_166_136_261;
  for (const char of text) {
    state = Math.imul(state ^ char.charCodeAt(0), 16_777_619);
  }

  return () => {
    state = (state + 0x6D_2B_79_F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * @param results The sweep's results of one engine
 * @returns Each track's cluster, and the multiplicity of every cluster in each replicate, the first being the data
 */
export function resamples(results: readonly TrackResult[]): {clusterOf: Int32Array; weights: Float64Array[]} {
  const clusters = new Map<string, Cluster>();
  const clusterOf = new Int32Array(results.length);

  for (const [track, result] of results.entries()) {
    if (result.group === undefined) {
      throw new Error(`${result.set}/${result.id} has no group, so no artist-aware range exists`);
    }

    const key = `${result.set}/${result.group}`;
    const cluster = clusters.get(key) ?? {stratum: result.set, index: clusters.size};
    clusters.set(key, cluster);
    clusterOf[track] = cluster.index;
  }

  const strata = [...new Set([...clusters.values()].map(({stratum}) => stratum))]
    .map(name => [...clusters.values()].filter(({stratum}) => stratum === name).map(({index}) => index));
  const random = seededRandom(seed);
  const weights = [new Float64Array(clusters.size).fill(1)];

  for (let replicate = 1; replicate < replicates; replicate += 1) {
    const weight = new Float64Array(clusters.size);
    for (const stratum of strata) {
      for (let drawn = 0; drawn < stratum.length; drawn += 1) {
        weight[stratum[Math.floor(random() * stratum.length)]] += 1;
      }
    }

    weights.push(weight);
  }

  return {clusterOf, weights};
}

/**
 * @param result A sweep result
 * @param engine The engine it should hold
 * @returns Its record
 */
function recordOf<E extends EngineName>(result: TrackResult, engine: E): Extract<HysteresisRecord, {engine: E}> {
  const record = result.hysteresis;
  if (record?.engine !== engine) {
    throw new Error(`${result.set}/${result.id} has no ${engine} sweep record`);
  }

  return record as Extract<HysteresisRecord, {engine: E}>;
}

/**
 * Every row's scores, in grid order: the tempogram's replayed from each track's trace, the lock offers once per lock
 * pair (the grid keeps lock fields outermost), and peaks' as its sessions recorded them
 * @param engine The engine
 * @param results Its sweep results
 * @yields One row's score on each track
 */
export function* rowScores(engine: EngineName, results: readonly TrackResult[]): Generator<SweepRow[]> {
  if (engine === 'peaks') {
    const records = results.map(result => recordOf(result, 'peaks'));
    for (const row of sweepGrids.peaks.keys()) {
      yield records.map(({rows}) => rows[row]);
    }

    return;
  }

  const traces = results.map(result => expandTrace(recordOf(result, 'tempogram').trace));
  let lockPair = '';
  let offers: boolean[][] = [];
  for (const row of sweepGrids.tempogram) {
    if (`${row.lockBand}/${row.lockAfterSeconds}` !== lockPair) {
      lockPair = `${row.lockBand}/${row.lockAfterSeconds}`;
      offers = traces.map(steps => offersOf(steps, row.lockBand, row.lockAfterSeconds));
    }

    yield traces.map((steps, track) => scoreReplay(steps, row, offers[track], results[track].truth, results[track].duration));
  }
}

/** Per cluster sums of one row, and the first locks as [seconds, cluster], sorted */
function tally(results: readonly TrackResult[], scores: readonly SweepRow[], clusterOf: Int32Array, clusterCount: number) {
  const totals = new Float64Array(clusterCount * sums);
  const firstLocks: Array<readonly [number, number]> = [];

  for (const [track, result] of results.entries()) {
    const [firstLockAt, firstLockRight, locked, lockedWrong, unlocks, losses] = scores[track];
    const at = clusterOf[track] * sums;
    const steady = isSteady(result.set);
    totals[at] += 1;
    totals[at + 1] += firstLockAt >= 0 ? 1 : 0;
    totals[at + 2] += firstLockRight;
    totals[at + 3] += locked;
    totals[at + 4] += lockedWrong;
    totals[at + 5] += steady ? unlocks : 0;
    totals[at + 6] += steady ? losses : 0;
    totals[at + 7] += steady ? result.duration / 60 : 0;
    if (firstLockAt >= 0) {
      firstLocks.push([firstLockAt, clusterOf[track]]);
    }
  }

  firstLocks.sort((a, b) => a[0] - b[0]);
  return {totals, firstLocks};
}

/**
 * What a listener was shown on each track under one row, for the calibration
 * @param engine The engine
 * @param results Its sweep results
 * @param row The picked row
 * @returns Per track, the status digits at the sample times and the end, and the readings there whatever the status
 */
export function pickedSamples(engine: EngineName, results: readonly TrackResult[], row: number): Array<{statuses: string; readings: readonly Sample[]}> {
  if (engine === 'peaks') {
    return results.map(result => {
      const record = recordOf(result, 'peaks');
      return {statuses: record.rows[row][6], readings: record.readings[row]};
    });
  }

  const hysteresis = sweepGrids.tempogram[row];
  return results.map(result => {
    const steps: EngineTraceStep[] = expandTrace(recordOf(result, 'tempogram').trace);
    const offers = offersOf(steps, hysteresis.lockBand, hysteresis.lockAfterSeconds);
    const statuses = scoreReplay(steps, hysteresis, offers, result.truth, result.duration)[6];
    return {statuses, readings: readingsAt(steps, result.duration)};
  });
}

/** The weighted quantiles of the first locks: the median and the 90th percentile */
function quantiles(firstLocks: ReadonlyArray<readonly [number, number]>, weight: Float64Array): readonly [number, number] {
  let total = 0;
  for (const [, cluster] of firstLocks) {
    total += weight[cluster];
  }

  let cumulative = 0;
  let median = Number.NaN;
  for (const [seconds, cluster] of firstLocks) {
    cumulative += weight[cluster];
    if (Number.isNaN(median) && cumulative >= 0.5 * total) {
      median = seconds;
    }

    if (cumulative >= 0.9 * total) {
      return [median, seconds];
    }
  }

  return [median, Number.NaN];
}

/**
 * @param totals A row's per cluster sums
 * @param firstLocks Its first locks
 * @param weight One replicate's multiplicities
 * @returns The row's metrics on that replicate, in `metricNames` order
 */
export function metricsOf(totals: Float64Array, firstLocks: ReadonlyArray<readonly [number, number]>, weight: Float64Array): number[] {
  const sum = new Float64Array(sums);
  for (let cluster = 0; cluster < weight.length; cluster += 1) {
    const w = weight[cluster];
    if (w > 0) {
      for (let i = 0; i < sums; i += 1) {
        sum[i] += w * totals[(cluster * sums) + i];
      }
    }
  }

  const [median, p90] = quantiles(firstLocks, weight);
  return [sum[1] / sum[0], sum[2] / sum[1], sum[4] / sum[3], sum[5] / sum[7], sum[6] / sum[7], median, p90];
}

/** One row's metrics on every replicate, replicate-major in `metricNames` order: replicate 0 is the data */
type Draws = Float64Array;

const metricCount = metricNames.length;

function interval(values: readonly number[]): Interval {
  const sorted = values.slice(1).filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  return [values[0], at(0.025), at(0.975)];
}

/** The range of one metric of `a`, less the same metric of `b` on the same replicate when given */
function metricInterval(a: Draws, metric: number, b?: Draws): Interval {
  const values: number[] = [];
  for (let at = metric; at < a.length; at += metricCount) {
    values.push(a[at] - (b === undefined ? 0 : b[at]));
  }

  return interval(values);
}

const record = (a: Draws, b?: Draws): Record<MetricName, Interval> =>
  Object.fromEntries(metricNames.map((name, metric) => [name, metricInterval(a, metric, b)])) as Record<MetricName, Interval>;

/**
 * @param row A row's paired difference with the base
 * @returns Whether it is no worse than the base beyond the noise on flapping, the median first lock and coverage
 */
export function isEligible(row: Readonly<Record<MetricName, Interval>>): boolean {
  return row.flapping[1] <= 0 && row.medianFirstLock[1] <= 0 && row.coverage[2] >= 0;
}

/**
 * @param hysteresis A row
 * @param engine Its engine
 * @returns Its fields at an edge of their axis, among the axes that hold more than one value
 */
export function edgeFieldsOf(hysteresis: Hysteresis, engine: EngineName): string[] {
  return hysteresisFields.filter(field => {
    const axis = sweepAxes[engine][field];
    return axis.length > 1 && (hysteresis[field] === Math.min(...axis) || hysteresis[field] === Math.max(...axis));
  });
}

const movedFrom = (a: Hysteresis, b: Hysteresis) => hysteresisFields.filter(field => a[field] !== b[field]).length;

/**
 * Applies the rule above to scored rows
 * @param engine The engine
 * @param rows Its rows' reports
 * @param falseLockedAgainst The paired false-locked difference of row i less row j
 * @returns The best, the near rows, the pick and whether it is bracketed
 */
export function pickRow(engine: EngineName, rows: readonly RowReport[], falseLockedAgainst: (i: number, j: number) => Interval) {
  const base = baseRowIndex(engine);
  const eligible = rows.map((row, index) => (row.eligible ? index : -1)).filter(index => index >= 0);
  const best = eligible.reduce((a, b) => (rows[b].metrics.falseLocked[0] < rows[a].metrics.falseLocked[0] ? b : a), base);
  const near = eligible.filter(index => falseLockedAgainst(index, best)[1] <= 0);
  const order = (index: number) => [
    edgeFieldsOf(rows[index].hysteresis, engine).length > 0 ? 1 : 0,
    movedFrom(rows[index].hysteresis, rows[base].hysteresis),
    rows[index].metrics.falseLocked[0],
    index,
  ];
  const pick = [...near].sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    const at = x.findIndex((value, i) => value !== y[i]);
    return at < 0 ? 0 : x[at] - y[at];
  })[0] ?? base;
  const edgeFields = edgeFieldsOf(rows[pick].hysteresis, engine);
  return {base, best, near, pick, bracketed: edgeFields.length === 0, edgeFields, pickAgainstBest: falseLockedAgainst(pick, best)};
}

/**
 * Scores every row of an engine on the same resamples, and picks
 * @param engine The engine
 * @param results Its sweep results, one per dev track
 * @returns The table and the pick
 */
export function pickHysteresis(engine: EngineName, results: readonly TrackResult[]): EnginePick {
  const grid = sweepGrids[engine];
  const {clusterOf, weights} = resamples(results);
  const clusterCount = weights[0].length;
  const draws: Draws[] = [];
  for (const scores of rowScores(engine, results)) {
    const {totals, firstLocks} = tally(results, scores, clusterOf, clusterCount);
    const draw = new Float64Array(weights.length * metricCount);
    for (const [replicate, weight] of weights.entries()) {
      draw.set(metricsOf(totals, firstLocks, weight), replicate * metricCount);
    }

    draws.push(draw);
  }

  const base = baseRowIndex(engine);
  const rows: RowReport[] = grid.map((hysteresis, row) => {
    const againstBase = record(draws[row], draws[base]);
    return {hysteresis, metrics: record(draws[row]), againstBase, eligible: isEligible(againstBase)};
  });
  const falseLocked = metricNames.indexOf('falseLocked');
  const picked = pickRow(engine, rows, (i, j) => metricInterval(draws[i], falseLocked, draws[j]));

  return {engine, tracks: results.length, steadyTracks: results.filter(({set}) => isSteady(set)).length, rows, ...picked};
}
