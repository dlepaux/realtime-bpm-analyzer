// Applies the noise rule to a sweep's rows, see "Choosing the defaults" in benchmark/readme.md.
//   pick.mjs <sweep.jsonl>
import {readFileSync} from 'node:fs';
import {defaultTempogramTuning} from '../src/core/tempogram';
import {detectors} from './lib/detectors';
import {parseRows, scoreNoise, bestRow, simplestWithinNoise} from './lib/sweep';

const sizes = {fsld: 791, groove: 221, guitarset: 180};
const rows = parseRows(readFileSync(process.argv[2], 'utf8'));
const best = bestRow(rows);

if (best === null) {
  throw new Error('No rows');
}

const base = {...defaultTempogramTuning, ...detectors['tempogram-285'].tuning};
const noise = scoreNoise(best, sizes);

console.log(JSON.stringify({best: best.key, score: best.score, noise, floor: best.score - noise, chosen: simplestWithinNoise(rows, sizes, base)}, null, 2));
