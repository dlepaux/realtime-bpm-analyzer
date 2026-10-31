// Applies RBA-51's pass bar to the second look's result file and prints the tables and a yes or no.
//   verdict.mjs <heldout.json>
// Exits 0 on yes, 1 on no, 2 when the file cannot be judged. See lib/pass-bar.ts.
import {readFileSync} from 'node:fs';
import {against285, candidate, heldoutTracks, lookFaults, measure, passBar, reference, reference285, reportedBands} from './lib/pass-bar';
import type {Interval, Metric, Scope} from './lib/pass-bar';
import {tuningSets} from './lib/licences';
import type {TrackResult} from './lib/types';

type LookFile = {readonly results: Record<string, TrackResult[]>; readonly skipped: ReadonlyArray<{readonly set: string; readonly id: string; readonly reason: string}>};

const points = (value: number) => (value * 100).toFixed(1);
const signed = (value: number) => `${value >= 0 ? '+' : ''}${points(value)}`;
const ranged = (interval: Interval | null) => (interval === null ? '–' : `${points(interval.value)} [${points(interval.low)}, ${points(interval.high)}]`);
const rangedDifference = (interval: Interval | null) => (interval === null ? '–' : `${signed(interval.value)} [${signed(interval.low)}, ${signed(interval.high)}]`);

const file = JSON.parse(readFileSync(process.argv[2], 'utf8')) as LookFile;
const {results, skipped} = file;
const faults = lookFaults(file, heldoutTracks);

if (faults.length > 0) {
  console.error(`Not judged:\n${faults.join('\n')}`);
  process.exit(2);
}

const names = [candidate, reference, reference285];
const sets = [...new Set(results[candidate].map(({set}) => set))].sort();
const bandScopes = (label: string, narrowed: Partial<Scope>) => reportedBands.map(({name, tracks}): Scope => ({...narrowed, name: `${name}, ${label}`, tracks}));
const scopes: Scope[] = [
  ...sets.map(set => ({name: `${set}${tuningSets.has(set) ? '' : ' (evaluation-only)'}`, sets: new Set([set])})),
  {name: '**clean, macro**', sets: tuningSets, macro: true},
  {name: 'all sets, pooled'},
  {name: 'out of range, all sets', tracks: ({truth}) => truth < 90 || truth > 180},
  {name: 'out of range, clean', sets: tuningSets, tracks: ({truth}) => truth < 90 || truth > 180},
  ...bandScopes('clean', {sets: tuningSets}),
  ...bandScopes('all sets', {}),
];
const countOf = (scope: Scope) => results[candidate].filter(result => (scope.sets?.has(result.set) ?? true) && (scope.tracks?.(result) ?? true)).length;

console.log(`Skipped as undecodable: ${skipped.length}${skipped.map(({set, id}) => ` ${set}/${id}`).join(',')}\n`);

for (const [metric, title] of [['acc1', 'Acc1'], ['acc2', 'Acc2'], ['falseStable', 'False-stable'], ['coverage', 'Coverage']] as ReadonlyArray<[Metric, string]>) {
  console.log(`**${title}**, value [95% range, resampling groups]\n\n| | tracks | ${names.join(' | ')} |\n|---|---:|${names.map(() => '---:').join('|')}|`);

  for (const scope of scopes) {
    console.log(`| ${scope.name} | ${countOf(scope)} | ${names.map(name => ranged(measure(results, [name], metric, scope))).join(' | ')} |`);
  }

  console.log('');
}

const conditions = passBar(results);

console.log('**The pass bar**, candidate less peaks, points [95% range]\n\n| bar | condition | difference | rule | met |\n|---|---|---:|---|---|');

for (const {bar, what, difference, rule, isMet} of conditions) {
  console.log(`| ${bar} | ${what} | ${rangedDifference(difference)} | ${rule} | ${isMet ? 'yes' : '**no**'} |`);
}

console.log('\n**#285 less the candidate on 140-165**, points [95% range]\n\n| | difference | #285 beats it beyond noise |\n|---|---:|---|');

for (const {what, difference, beatsBeyondNoise} of against285(results)) {
  console.log(`| ${what} | ${rangedDifference(difference)} | ${beatsBeyondNoise ? '**yes**' : 'no'} |`);
}

const isPassed = conditions.every(({isMet}) => isMet);

console.log(`\n**Does the extension leave peaks? ${isPassed ? 'YES' : 'NO'}**, ${conditions.filter(({isMet}) => isMet).length} of ${conditions.length} conditions met.`);
process.exitCode = isPassed ? 0 : 1;
