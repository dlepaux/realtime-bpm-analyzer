// RBA-51's third sweep, on dev with RBA-59's full mixes: see "The third sweep" in benchmark/readme.md.
//   run.sh retune2 floors <dev.json>                    the guard's floors: peaks on the tuning sets, real path
//   run.sh retune2 pick <plan.json> <sweep.jsonl>       applies the rule, exit 1 when it refuses
//   run.sh retune2 report <dev.json>[,<dev.json>] <a,b,c> tables with group-aware ranges, first detector less the others
// Dev only: nothing here reads a held-out file, and the free sets have no held-out route.
import {readFileSync} from 'node:fs';
import {defaultTempogramTuning} from '../src/core/tempogram';
import {measure, reportedBands} from './lib/pass-bar';
import type {Interval, Metric, Scope} from './lib/pass-bar';
import {bandCounts} from './lib/metrics';
import {guardShortfalls, parseRows} from './lib/sweep';
import type {Guard} from './lib/sweep';
import {pickRetune2, tuningSetsOf} from './lib/retune2';
import type {TrackResult} from './lib/types';

type DevFile = {readonly results: Record<string, TrackResult[]>};

const points = (value: number) => (value * 100).toFixed(1);
const signed = (value: number) => `${value >= 0 ? '+' : ''}${points(value)}`;
const ranged = (interval: Interval | null) => (interval === null ? '–' : `${points(interval.value)} [${points(interval.low)}, ${points(interval.high)}]`);
const rangedDifference = (interval: Interval | null) => (interval === null ? '–' : `${signed(interval.value)} [${signed(interval.low)}, ${signed(interval.high)}]`);

function readResults(paths: string): Record<string, TrackResult[]> {
  return Object.assign({}, ...paths.split(',').map(path => (JSON.parse(readFileSync(path, 'utf8')) as DevFile).results)) as Record<string, TrackResult[]>;
}

function floors(path: string): void {
  const peaks = readResults(path).peaks.filter(({set}) => tuningSetsOf.has(set));
  const bands = bandCounts(peaks);
  const guard: Guard = {
    floors: {'140-165': bands['140-165'].correct / bands['140-165'].tracks, '165+': bands['165+'].correct / bands['165+'].tracks},
    tracks: {'140-165': bands['140-165'].tracks, '165+': bands['165+'].tracks},
  };

  console.log(JSON.stringify({guard, sizes: Object.fromEntries([...tuningSetsOf].map(set => [set, peaks.filter(r => r.set === set).length])), counts: bands}, null, 2));
}

function pick(planPath: string, sweepPath: string): void {
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as {guard: Guard};
  const rows = parseRows(readFileSync(sweepPath, 'utf8'));
  const outcome = pickRetune2(rows, plan.guard, defaultTempogramTuning);
  const brief = (row: (typeof rows)[number] | null) => row && {
    tuning: row.tuning, score: row.score, scoreSe: row.scoreSe, sets: row.sets, bands: row.bands, shortfalls: guardShortfalls(row.bands, plan.guard),
  };

  console.log(JSON.stringify({
    rows: rows.length,
    passing: outcome.passing,
    best: brief(outcome.best),
    noise: outcome.noise,
    withinNoise: outcome.close,
    interiorWithinNoise: outcome.interior,
    chosen: brief(outcome.chosen),
    refusal: outcome.refusal,
    baseline: brief(rows.find(row => row.stage === 'baseline') ?? null),
  }, null, 2));

  if (outcome.chosen === null) {
    process.exitCode = 1;
  }
}

function report(paths: string, names: readonly string[]): void {
  const results = readResults(paths);
  const sets = [...new Set(results[names[0]].map(({set}) => set))].sort();
  const tuning: Scope = {name: 'four tuning sets, pooled', sets: tuningSetsOf};
  const freeMixes: Scope = {name: 'free mixes, strict', sets: new Set(['free-mixes'])};
  const bandScopes = (scope: Scope) => reportedBands.map(({name, tracks}): Scope => ({...scope, name: `${name}, ${scope.name}`, tracks}));
  const scopes: Scope[] = [
    ...sets.map(set => ({name: set, sets: new Set([set])})),
    ...['trackers-all', 'trackers-two'].map(label => ({name: `free mixes, strict, ${label}`, sets: new Set(['free-mixes']), tracks: (r: TrackResult) => r.label === label})),
    {name: '**four tuning sets, macro**', sets: tuningSetsOf, macro: true},
    tuning,
    ...bandScopes(tuning),
    ...bandScopes(freeMixes),
    ...bandScopes({name: 'free mixes, contested', sets: new Set(['free-mixes-contested'])}),
  ];
  const countOf = (scope: Scope) => results[names[0]].filter(r => (scope.sets?.has(r.set) ?? true) && (scope.tracks?.(r) ?? true)).length;
  const others = names.slice(1);

  for (const [metric, title] of [['acc1', 'Acc1'], ['acc2', 'Acc2'], ['falseStable', 'False-stable'], ['coverage', 'Coverage']] as ReadonlyArray<[Metric, string]>) {
    console.log(`\n**${title}**, value [95% range, resampling groups: artists for the free mixes]\n`);
    console.log(`| | tracks | ${names.join(' | ')} | ${others.map(other => `${names[0]} less ${other}`).join(' | ')} |`);
    console.log(`|---|---:|${names.map(() => '---:').join('|')}|${others.map(() => '---:').join('|')}|`);

    for (const scope of scopes) {
      const values = names.map(name => ranged(measure(results, [name], metric, scope)));
      const differences = others.map(other => rangedDifference(measure(results, [names[0], other], metric, scope)));

      console.log(`| ${scope.name} | ${countOf(scope)} | ${values.join(' | ')} | ${differences.join(' | ')} |`);
    }
  }
}

const [mode, ...args] = process.argv.slice(2);

if (mode === 'floors') {
  floors(args[0]);
} else if (mode === 'pick') {
  pick(args[0], args[1]);
} else if (mode === 'report') {
  report(args[0], args[1].split(','));
} else {
  console.error('usage: retune2.mjs floors <dev.json> | pick <plan.json> <sweep.jsonl> | report <dev.json,...> <a,b,c>');
  process.exitCode = 2;
}
