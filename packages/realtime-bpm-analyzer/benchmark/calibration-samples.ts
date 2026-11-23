// The calibration study's held-out calibration check: the tempogram's calibration samples from a run's results, on dev at the row
// the committed table was fitted at and held-out at the shipped one. Bundled by benchmark/run.sh, run by the job's calibration-heldout mode, on dev
// first and then on held-out.
//   calibration-samples.mjs --in <run results> --out <samples>
// The samples are per track: a held-out file stays on the data volume, and only calibration.py's aggregates leave it.
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {calibrationDetector, rowIndex, sampleRow, samplesFile, samplesOf} from './lib/calibration-samples';
import {writeAtomic} from './lib/decode';
import type {RunFailure} from './lib/look';
import type {Split, TrackResult} from './lib/types';

type RunFile = {
  readonly split: Split;
  readonly results: Record<string, TrackResult[]>;
  readonly skipped?: readonly RunFailure[];
  readonly tracks?: Readonly<Record<string, number>>;
};

function main(): void {
  const {values} = parseArgs({options: {in: {type: 'string'}, out: {type: 'string'}}});
  if (!values.in || !values.out) {
    throw new Error('usage: calibration-samples.mjs --in <run results> --out <samples>');
  }

  const {split, results, skipped = [], tracks = {}} = JSON.parse(readFileSync(values.in, 'utf8')) as RunFile;
  const tempogram = results[calibrationDetector];
  if ((split !== 'dev' && split !== 'heldout') || tempogram === undefined) {
    throw new Error(`${values.in} must be a dev or held-out run of ${calibrationDetector}`);
  }

  const row = sampleRow(split);
  const samples = samplesOf('tempogram', tempogram, rowIndex('tempogram', row));
  // Counts only: the skipped tracks' names stay in the run's own file
  writeAtomic(values.out, Buffer.from(samplesFile(split, {tempogram: row}, {tempogram: samples}, {tracks, skipped: skipped.length})));
  console.log(`${samples.length} ${split} tracks sampled at ${JSON.stringify(row)}, ${skipped.length} skipped`);
}

main();
