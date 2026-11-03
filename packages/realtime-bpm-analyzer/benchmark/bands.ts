// Prints a result file as one table per metric: per set, clean macro, and per labelled tempo band, so
// every configuration in the file reads side by side. Bundled by benchmark/run.sh.
//   bands.mjs <result.json> [--rename from=to]...
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {tuningSets} from './lib/licences';
import {summarize, tempoBands} from './lib/metrics';
import type {Summary, TrackResult} from './lib/types';

const {values, positionals} = parseArgs({allowPositionals: true, options: {rename: {type: 'string', multiple: true, default: []}}});
const {results} = JSON.parse(readFileSync(positionals[0], 'utf8')) as {results: Record<string, TrackResult[]>};
const names = new Map(values.rename.map(pair => pair.split('=') as [string, string]));
const detectorNames = Object.keys(results);
const first = results[detectorNames[0]];

type Subset = {readonly label: string; readonly tracks: (list: readonly TrackResult[]) => readonly TrackResult[]; readonly macro?: boolean};

const allSets = [...new Set(first.map(({set}) => set))].sort();
const cleanSets = allSets.filter(set => tuningSets.has(set));
const ofBand = (min: number, max: number, list: readonly TrackResult[]) => list.filter(({truth}) => truth >= min && truth < max);
const subsets: Subset[] = [
  ...allSets.map(set => ({label: tuningSets.has(set) ? set : `${set} (evaluation-only)`, tracks: (list: readonly TrackResult[]) => list.filter(row => row.set === set)})),
  {label: '**clean, macro**', tracks: (list: readonly TrackResult[]) => list.filter(row => tuningSets.has(row.set)), macro: true},
  ...tempoBands.map(({name, min, max}) => ({label: `${name}, clean`, tracks: (list: readonly TrackResult[]) => ofBand(min, max, list).filter(row => tuningSets.has(row.set))})),
  ...allSets.length === cleanSets.length ? [] : tempoBands.map(({name, min, max}) => ({label: `${name}, all sets`, tracks: (list: readonly TrackResult[]) => ofBand(min, max, list)})),
];

const percent = (value: number | null | undefined) => (value === null || value === undefined ? '–' : (value * 100).toFixed(1));
const metrics: ReadonlyArray<readonly [string, (summary: Summary) => number | null]> = [
  ['Acc1', summary => summary.acc1],
  ['Acc2', summary => summary.acc2],
  ['False-stable', summary => summary.falseStable],
  ['Coverage', summary => summary.stableCoverage],
];

function cell(list: readonly TrackResult[], subset: Subset, read: (summary: Summary) => number | null): string {
  if (!subset.macro) {
    return percent(read(summarize(subset.tracks(list))));
  }

  // Macro over the clean sets, as the sweep scores: the largest set must not decide
  const perSet = cleanSets.map(set => read(summarize(list.filter(row => row.set === set))) ?? 1);

  return percent(perSet.reduce((sum, value) => sum + value, 0) / perSet.length);
}

for (const [metric, read] of metrics) {
  console.log(`\n**${metric}**\n\n| | tracks | ${detectorNames.map(name => names.get(name) ?? name).join(' | ')} |\n|---|---:|${detectorNames.map(() => '---:').join('|')}|`);

  for (const subset of subsets) {
    console.log(`| ${subset.label} | ${subset.tracks(first).length} | ${detectorNames.map(name => cell(results[name], subset, read)).join(' | ')} |`);
  }
}
