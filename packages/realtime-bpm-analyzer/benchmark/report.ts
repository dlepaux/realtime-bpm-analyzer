// Prints the benchmark tables as markdown from one or more result files. Bundled by benchmark/run.sh.
import {readFileSync} from 'node:fs';
import {summarize} from './lib/metrics';
import type {Summary, TrackResult} from './lib/types';

type ResultFile = {split: string; results: Record<string, TrackResult[]>};

const percent = (value: number | null | undefined) => (value === null || value === undefined ? '–' : `${(value * 100).toFixed(1)}%`);
const seconds = (value: number | null) => (value === null ? 'never' : `${value.toFixed(1)} s`);

function row(label: string, s: Summary): string {
  return `| ${label} | ${s.tracks} | ${percent(s.acc1)} | ${percent(s.acc2)} | ${seconds(s.medianFirstCorrect)} | ${percent(s.everCorrect)} | ${percent(s.falseStable)} | ${percent(s.falseFirstStable)} | ${percent(s.stableCoverage)} | ${s.stableReadings} | ${percent(s.offlineAcc1)} | ${percent(s.offlineAcc2)} |`;
}

const header = '| | tracks | Acc1 | Acc2 | median first correct | ever correct | false-stable | false first-stable | stable coverage | stable readings | offline Acc1 | offline Acc2 |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|';

const byGenre = process.argv.includes('--genres');
const compact = process.argv.includes('--compact');

function compactLine(s: Summary): string {
  return `A1 ${percent(s.acc1)} A2 ${percent(s.acc2)} t1 ${seconds(s.medianFirstCorrect)} FS ${percent(s.falseStable)} FFS ${percent(s.falseFirstStable)} cov ${percent(s.stableCoverage)} n ${s.stableReadings}`;
}

for (const path of process.argv.slice(2).filter(arg => !arg.startsWith('--'))) {
  const {split, results} = JSON.parse(readFileSync(path, 'utf8')) as ResultFile;

  for (const [detector, list] of Object.entries(results)) {
    if (compact) {
      console.log(`${detector} all: ${compactLine(summarize(list))}`);

      for (const set of [...new Set(list.map(r => r.set))]) {
        console.log(`  ${set}: ${compactLine(summarize(list.filter(r => r.set === set)))}`);
      }

      continue;
    }

    console.log(`\n### ${detector}, ${split}\n\n${header}`);
    console.log(row('all', summarize(list)));

    for (const set of [...new Set(list.map(r => r.set))]) {
      const ofSet = list.filter(r => r.set === set);

      console.log(row(set, summarize(ofSet)));

      if (byGenre) {
        for (const genre of [...new Set(ofSet.map(r => r.genre))].sort()) {
          console.log(row(`${set} / ${genre}`, summarize(ofSet.filter(r => r.genre === genre))));
        }
      }
    }
  }
}
