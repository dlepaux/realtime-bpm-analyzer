import {bestRow, guardShortfalls} from './sweep';
import type {Guard, SweepRow} from './sweep';

/**
 * The sets the third sweep tunes on and scores macro: the three clean sets of the first two sweeps and
 * RBA-59's full mixes with a strict label. Contested labels are licence-clean too, and are left out by
 * choice: an octave a tracker disputes is no target to tune to.
 */
export const tuningSetsOf: ReadonlySet<string> = new Set(['fsld', 'groove', 'guitarset', 'free-mixes']);

/**
 * Ends of an axis that are ends of the knob itself, not of a grid: a penalty cannot go below none.
 * A pick there is bracketed by the domain, so it is no grid edge.
 */
const domainFloors: Readonly<Record<string, number>> = {halfBeatPenalty: 0, thirdBeatPenalty: 0};

/**
 * @param row A row
 * @param rows The rows measured
 * @param defaults What a knob a row does not set reads
 * @returns The knobs the row holds at the end of what was measured. A knob measured at one value is no axis
 */
export function edgeKnobs(row: SweepRow, rows: readonly SweepRow[], defaults: Readonly<Record<string, unknown>>): string[] {
  const knobs = [...new Set(rows.flatMap(({tuning}) => Object.keys(tuning)))];
  const valueOf = (of: SweepRow, knob: string) => (of.tuning as Record<string, unknown>)[knob] ?? defaults[knob];

  return knobs.filter(knob => {
    const values = [...new Set(rows.map(of => valueOf(of, knob)))].filter((value): value is number => typeof value === 'number');
    const value = valueOf(row, knob);

    if (values.length < 2 || typeof value !== 'number' || value === domainFloors[knob]) {
      return false;
    }

    return value === Math.min(...values) || value === Math.max(...values);
  });
}

export type Retune2Outcome = {
  readonly passing: number;
  readonly best: SweepRow | null;
  /** One group-aware standard error of the best row's score */
  readonly noise: number | null;
  readonly close: number;
  readonly interior: number;
  readonly chosen: SweepRow | null;
  readonly refusal: string | null;
};

/**
 * The third sweep's rule, fixed before its rows exist. Among rows the guard lets through, those within
 * one group-aware standard error of the best score; of those, the ones with no knob at the end of what
 * was measured; of those, the fewest knobs moved from the locked 5.5.0 settings, then the higher score.
 * No interior row within noise means the optimum was not bracketed, and the rule refuses rather than
 * pick an edge. So 5.5.0 itself wins whenever it is within noise and interior: a gain inside the noise
 * pays for no change.
 * @param rows The sweep's rows
 * @param guard The plan's floors
 * @param defaults The locked settings, what moved knobs count from
 * @returns The outcome, with the pick or the refusal
 */
export function pickRetune2(rows: readonly SweepRow[], guard: Guard, defaults: Readonly<Record<string, unknown>>): Retune2Outcome {
  const passing = rows.filter(row => guardShortfalls(row.bands, guard).length === 0);
  const best = bestRow(passing);

  if (best === null) {
    return {passing: 0, best: null, noise: null, close: 0, interior: 0, chosen: null, refusal: 'no row passes the guard'};
  }

  if (best.scoreSe === undefined) {
    return {passing: passing.length, best, noise: null, close: 0, interior: 0, chosen: null, refusal: 'the best row has no group-aware error'};
  }

  const close = passing.filter(row => row.score >= best.score - best.scoreSe!);
  const interior = close.filter(row => edgeKnobs(row, rows, defaults).length === 0);
  const moved = (row: SweepRow) => Object.entries(row.tuning).filter(([knob, value]) => value !== defaults[knob]).length;
  const chosen = interior.reduce<SweepRow | null>((kept, row) => {
    const difference = kept === null ? -1 : moved(row) - moved(kept);

    return difference < 0 || (difference === 0 && row.score > kept!.score) ? row : kept;
  }, null);

  return {
    passing: passing.length,
    best,
    noise: best.scoreSe,
    close: close.length,
    interior: interior.length,
    chosen,
    refusal: chosen === null ? `every row within noise holds a knob at the end of the grid: ${edgeKnobs(best, rows, defaults).join(', ')} on the best` : null,
  };
}
