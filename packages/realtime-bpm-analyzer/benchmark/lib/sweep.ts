import type {TempogramTuning} from '../../src/core/tempogram';

type Tuning = Partial<Omit<TempogramTuning, 'bands'>>;

/** One step of a sweep. The base of every stage is the best row so far, so stages narrow in turn */
export type SweepStage = {
  readonly name: string;
  /** Knob values, every combination of them, or each value alone with `oneAtATime` */
  readonly axes: Readonly<Record<string, readonly number[]>>;
  readonly oneAtATime?: boolean;
};

export type SetMetrics = {readonly acc1: number; readonly acc2: number; readonly falseStable: number | null; readonly coverage: number};

export type SweepRow = {
  readonly stage: string;
  readonly key: string;
  readonly tuning: Tuning;
  readonly sets: Readonly<Record<string, SetMetrics>>;
  readonly score: number;
};

/** A curve is computed before these, so a replay would ignore them and report an unchanged row */
const onsetKnobs = new Set(['frameRate', 'bands', 'compression', 'localMeanSeconds']);

/**
 * @param stages The plan
 * @param known Every knob the detector has
 * @throws {Error} Naming a knob a replay cannot change, before any compute is spent
 */
export function assertReplayable(stages: readonly SweepStage[], known: readonly string[]): void {
  const refused = stages.flatMap(stage => Object.keys(stage.axes)).filter(knob => onsetKnobs.has(knob) || !known.includes(knob));

  if (refused.length > 0) {
    throw new Error(`Not knobs a replay can sweep: ${refused.join(', ')}`);
  }
}

/**
 * @param tuning A tuning
 * @returns The same id whatever order its knobs came in, so a resumed sweep recognises a finished row
 */
export function tuningKey(tuning: Tuning): string {
  return JSON.stringify(Object.entries(tuning).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * The score of RBA-51's first sweep, percentage points: macro over sets so that the largest set
 * does not pick the prior. False-stable alone rewards silence, hence the coverage term. A set
 * without a single stable reading counts as all false.
 * @param sets Metrics per set, as shares
 * @returns The score, higher is better
 */
export function scoreOf(sets: Readonly<Record<string, SetMetrics>>): number {
  const rows = Object.values(sets);
  const mean = (read: (row: SetMetrics) => number) => rows.reduce((sum, row) => sum + read(row), 0) / rows.length;

  return (100 * mean(row => row.acc1)) - (50 * mean(row => row.falseStable ?? 1)) + (15 * mean(row => row.coverage));
}

/**
 * @param rows Rows so far
 * @returns The highest score, or null before the first row
 */
export function bestRow(rows: readonly SweepRow[]): SweepRow | null {
  return rows.reduce<SweepRow | null>((best, row) => (best === null || row.score > best.score ? row : best), null);
}

/**
 * Sampling noise of a score, in its own points: binomial per metric, assumed independent. An
 * estimate, unpaired although rows share their tracks: RBA-51's review bootstrapped its chosen row at
 * 2.04 where this says 1.58, so its pick is recorded with the range of widths it holds for.
 * @param row A row
 * @param sizes Tracks per set
 * @returns One standard error of the row's score
 */
export function scoreNoise(row: SweepRow, sizes: Readonly<Record<string, number>>): number {
  const share = (p: number, n: number) => (n > 0 ? (p * (1 - p)) / n : 0);
  const entries = Object.entries(row.sets);
  const variance = entries.reduce((sum, [set, {acc1, falseStable, coverage}]) => sum
    + (100 ** 2 * share(acc1, sizes[set]))
    + (50 ** 2 * share(falseStable ?? 1, sizes[set] * coverage))
    + (15 ** 2 * share(coverage, sizes[set])), 0);

  return Math.sqrt(variance) / entries.length;
}

/**
 * The noise rule, the one-standard-error rule: a gain inside the noise pays for no knob.
 * Among rows within one standard error of the best, the fewest knobs moved from `base`, then the
 * higher score.
 * @param rows Rows of a sweep
 * @param sizes Tracks per set
 * @param base What the sweep started from, every knob a row can name
 * @returns The chosen row, or null without rows
 */
export function simplestWithinNoise(rows: readonly SweepRow[], sizes: Readonly<Record<string, number>>, base: Readonly<Record<string, unknown>>): SweepRow | null {
  const best = bestRow(rows);

  if (best === null) {
    return null;
  }

  const moved = (row: SweepRow) => Object.entries(row.tuning).filter(([knob, value]) => value !== base[knob]).length;
  const floor = best.score - scoreNoise(best, sizes);

  return rows.filter(row => row.score >= floor).reduce((chosen, row) => {
    const difference = moved(row) - moved(chosen);

    return difference < 0 || (difference === 0 && row.score > chosen.score) ? row : chosen;
  });
}

/**
 * @param stage The stage
 * @param rows Rows of the stages before it
 * @returns The tunings to replay, deterministic given the rows, which is what lets a sweep resume
 */
export function stageTunings(stage: SweepStage, rows: readonly SweepRow[]): Tuning[] {
  const base = bestRow(rows)?.tuning ?? {};
  const axes = Object.entries(stage.axes);

  if (stage.oneAtATime) {
    return axes.flatMap(([knob, values]) => values.map(value => ({...base, [knob]: value})));
  }

  return axes.reduce<Tuning[]>(
    (tunings, [knob, values]) => tunings.flatMap(tuning => values.map(value => ({...tuning, [knob]: value}))),
    [base],
  );
}

/**
 * @param text The sweep log
 * @returns Its rows. A kill can tear the last line, and that row is simply replayed
 */
export function parseRows(text: string): SweepRow[] {
  return text.split('\n').flatMap(line => {
    try {
      return line === '' ? [] : [JSON.parse(line) as SweepRow];
    } catch {
      return [];
    }
  });
}
