// Applies the second sweep's rule to its rows, see "Choosing the defaults" in benchmark/readme.md.
//   pick.mjs <sweep.jsonl,sweep.jsonl> <plan.json,plan.json>
// Exits 1 when nothing passes the guard, or the pick holds the prior at the end of its grid: no look.
import {readFileSync} from 'node:fs';
import {defaultTempogramTuning} from '../src/core/tempogram';
import {detectors} from './lib/detectors';
import {bestRow, guardShortfalls, parseRows, pickWithGuard, priorKnobsOnEdge, scoreNoise} from './lib/sweep';
import type {SweepRow, SweepStage} from './lib/sweep';

const sizes = {fsld: 791, groove: 221, guitarset: 180};
const rows = process.argv[2].split(',').flatMap(path => parseRows(readFileSync(path, 'utf8')));
const stages = process.argv[3].split(',').flatMap(path => (JSON.parse(readFileSync(path, 'utf8')) as {stages: SweepStage[]}).stages);
const base = {...defaultTempogramTuning, ...detectors['tempogram-285'].tuning};
const passing = rows.filter(row => guardShortfalls(row.bands).length === 0);
const best = bestRow(passing);
const chosen = pickWithGuard(rows, sizes, base);
const rangeOf = (row: SweepRow) => `${row.tempoRange?.min}-${row.tempoRange?.max}`;
const ofRange = (range: string) => rows.filter(row => rangeOf(row) === range);
const brief = (row: SweepRow | null) => row && {
  range: rangeOf(row), tuning: row.tuning, score: row.score, bands: row.bands, shortfalls: guardShortfalls(row.bands), sets: row.sets,
};
const edge = chosen ? priorKnobsOnEdge(chosen, stages) : [];

console.log(JSON.stringify({
  rows: rows.length,
  passing: passing.length,
  passingPerRange: Object.fromEntries(['50-240', '90-180'].map(range => [range, ofRange(range).filter(row => guardShortfalls(row.bands).length === 0).length])),
  best: brief(best),
  noise: best && scoreNoise(best, sizes),
  chosen: brief(chosen),
  edge,
  chosenPerRange: Object.fromEntries(['50-240', '90-180'].map(range => [range, brief(pickWithGuard(ofRange(range), sizes, base))])),
  baselinePerRange: rows.filter(row => row.stage === 'baseline').map(brief),
  reference285PerRange: rows.filter(row => row.stage === 'reference-285').map(brief),
}, null, 2));

if (chosen === null || edge.length > 0) {
  process.exitCode = 1;
}
