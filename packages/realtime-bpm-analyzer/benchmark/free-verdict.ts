// Applies the pass bar of RBA-51's look at the held-out free mixes to the look's file, and writes only
// aggregates: the per-track file stays where the look ran.
//   free-verdict.mjs <look.json> <verdict.md> <verdict.json>
// Exits 0 on yes, 1 on no, 2 when the file cannot be judged. See lib/free-look.ts.
import {readFileSync, writeFileSync} from 'node:fs';
import {freeCandidate, freeLookBar, freeLookFaults, freeLookScopes, freeReference, isFreeLookPassed, voidGates} from './lib/free-look';
import type {FreeLookFile} from './lib/free-look';
import {measure} from './lib/pass-bar';
import type {Interval, Metric, Scope} from './lib/pass-bar';

const points = (value: number) => (value * 100).toFixed(1);
const signed = (value: number) => `${value >= 0 ? '+' : ''}${points(value)}`;
const ranged = (interval: Interval | null) => (interval === null ? '–' : `${points(interval.value)} [${points(interval.low)}, ${points(interval.high)}]`);
const rangedDifference = (interval: Interval | null) => (interval === null ? '–' : `${signed(interval.value)} [${signed(interval.low)}, ${signed(interval.high)}]`);

// Whatever stops the judging is no verdict, and exit 1 would read as a no
process.on('uncaughtException', error => {
  console.error('Not judged:', error);
  process.exit(2);
});

const [lookPath, mdPath, jsonPath] = process.argv.slice(2);

if (!lookPath || !mdPath || !jsonPath) {
  console.error('usage: free-verdict.mjs <look.json> <verdict.md> <verdict.json>');
  process.exit(2);
}

const file = JSON.parse(readFileSync(lookPath, 'utf8')) as FreeLookFile;
const faults = freeLookFaults(file);

if (faults.length > 0) {
  console.error(`Not judged:\n${faults.join('\n')}`);
  process.exit(2);
}

const {results, skipped} = file;
const names = [freeCandidate, freeReference];
const metrics: ReadonlyArray<[Metric, string]> = [['acc1', 'Acc1'], ['acc2', 'Acc2'], ['falseStable', 'False-stable'], ['coverage', 'Coverage']];
const countOf = (scope: Scope) => results[freeCandidate].filter(result => (scope.sets?.has(result.set) ?? true) && (scope.tracks?.(result) ?? true)).length;
const tables = metrics.map(([metric, title]) => ({
  metric,
  title,
  rows: freeLookScopes().map(scope => ({
    scope: scope.name,
    tracks: countOf(scope),
    values: Object.fromEntries(names.map(name => [name, measure(results, [name], metric, scope)])),
    difference: measure(results, names, metric, scope),
  })),
}));
const conditions = freeLookBar(results);
const isPassed = isFreeLookPassed(conditions);
// Counts only: a skipped track's id is per-track output, and stays sealed with the rest
const skippedPerSet = Object.fromEntries(Object.keys(file.tracks!).map(set => [set, new Set(skipped.filter(row => row.set === set).map(({id}) => id)).size]));
const lines = [
  `Tracks per set: ${Object.entries(file.tracks!).map(([set, count]) => `${set} ${count}`).join(', ')}. Skipped as undecodable: ${Object.entries(skippedPerSet).map(([set, count]) => `${set} ${count}`).join(', ')}.`,
  '',
];

for (const {title, rows} of tables) {
  lines.push(
    `**${title}**, value [95% range, resampling artists]`,
    '',
    `| | tracks | ${names.join(' | ')} | ${freeCandidate} less ${freeReference} |`,
    `|---|---:|${names.map(() => '---:').join('|')}|---:|`,
    ...rows.map(({scope, tracks, values, difference}) => `| ${scope} | ${tracks} | ${names.map(name => ranged(values[name])).join(' | ')} | ${rangedDifference(difference)} |`),
    '',
  );
}

lines.push(
  `**The pass bar**, ${freeCandidate} (5.5.0) less ${freeReference}, points [95% range]. The last column applies the same test at one standard error, and decides nothing`,
  '',
  '| gate | condition | difference | rule | met | at one SE |',
  '|---|---|---:|---|---|---|',
  ...conditions.map(({gate, what, difference, rule, isMet, isMetAtOneSe}) => `| ${gate} | ${what} | ${rangedDifference(difference)} | ${rule} | ${isMet ? 'yes' : '**no**'} | ${isMetAtOneSe ? 'yes' : 'no'} |`),
  '',
  ...voidGates.map(text => `- ${text}`),
  '',
  `**Is the tempogram eligible for David's ruling on the default? ${isPassed ? 'YES' : 'NO'}**, ${conditions.filter(({isMet}) => isMet).length} of ${conditions.length} gates met. At one standard error, which decides nothing, it would read ${conditions.every(({isMetAtOneSe}) => isMetAtOneSe) ? 'yes' : 'no'}.`,
);

writeFileSync(mdPath, `${lines.join('\n')}\n`);
writeFileSync(jsonPath, `${JSON.stringify({verdict: isPassed ? 'pass' : 'fail', conditions, voidGates, tracks: file.tracks, skipped: skippedPerSet, tables}, null, 2)}\n`);
console.log(lines.join('\n'));
process.exitCode = isPassed ? 0 : 1;
