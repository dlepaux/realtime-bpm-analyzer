// The calibration study's hysteresis pick, from the sweep's dev results. Bundled by benchmark/run.sh, run by the job's hysteresis mode.
//   hysteresis.mjs --in dev-<sha>.json --out hysteresis-report-<sha>.json --samples calibration-samples-<sha>.json
// --out holds aggregates only. --samples holds, per dev track, the picked rows' readings at the sample times, for
// the calibration (benchmark/calibration.py): it is per track, and stays on the data volume.
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import type {EngineName} from '../src/contract/types';
import {samplesFile, samplesOf} from './lib/calibration-samples';
import {writeAtomic} from './lib/decode';
import {pickHysteresis, sweepDetectors} from './lib/hysteresis-pick';
import type {TrackResult} from './lib/types';

const engines: readonly EngineName[] = ['tempogram', 'peaks'];

function main(): void {
  const {values} = parseArgs({options: {in: {type: 'string'}, out: {type: 'string'}, samples: {type: 'string'}}});
  if (!values.in || !values.out || !values.samples) {
    throw new Error('usage: hysteresis.mjs --in <dev results> --out <report> --samples <calibration samples>');
  }

  const {split, results} = JSON.parse(readFileSync(values.in, 'utf8')) as {split: string; results: Record<string, TrackResult[]>};
  if (split !== 'dev') {
    throw new Error(`The hysteresis pick reads dev only, not ${split}`);
  }

  const picks = engines.map((engine, index) => pickHysteresis(engine, results[sweepDetectors[index]]));
  writeAtomic(values.out, Buffer.from(`${JSON.stringify({split, picks}, null, 1)}\n`));
  const samples = Object.fromEntries(picks.map((pick, index) => [pick.engine, samplesOf(pick.engine, results[sweepDetectors[index]], pick.pick)]));
  const rows = Object.fromEntries(picks.map(pick => [pick.engine, pick.rows[pick.pick].hysteresis]));
  writeAtomic(values.samples, Buffer.from(samplesFile('dev', rows, samples)));

  for (const pick of picks) {
    const row = pick.rows[pick.pick];
    console.log(`${pick.engine}: pick row ${pick.pick} ${JSON.stringify(row.hysteresis)}, base ${pick.base}, best ${pick.best}, ${pick.near.length} near, bracketed ${pick.bracketed} ${pick.edgeFields.join(',')}`);
  }
}

main();
