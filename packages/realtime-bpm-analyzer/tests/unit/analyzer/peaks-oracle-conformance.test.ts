import {expect} from 'chai';
import type {OfflineOptions, OfflineResult} from '../../../src/contract/types';
import {analyzeChannelData, applyLowpass} from '../../../src/node';
import {oracleAnalyzeSamples} from '../../lib/peaks-file-path-oracle';
import {signals, toPcm16} from '../../../../../conformance/generator/signals.mjs';

/**
 * The peaks option sets, and the extra peaks cases, of conformance/generator/generate.mjs: the cases the vectors run
 * on the peaks engine
 */
const peaksOptionSets: ReadonlyArray<readonly [string, OfflineOptions]> = [
  ['peaks', {engine: 'peaks'}],
  ['peaks-90-180', {engine: 'peaks', tempoRange: {min: 90, max: 180}}],
  ['peaks-60-140', {engine: 'peaks', tempoRange: {min: 60, max: 140}}],
  ['peaks-lowpass-150-q3', {engine: {name: 'peaks', lowpass: {frequency: 150, q: 3}}}],
];

const extraPeaksCases: ReadonlyArray<readonly [string, string, number, OfflineOptions]> = [
  ['peaks-sample-rate-2', 'kick-120-tiny-44k', 2, {engine: {name: 'peaks', lowpass: {frequency: 0.2}}}],
  ['peaks-range-max-2147483647', 'kick-120-22k', 22_050, {engine: 'peaks', tempoRange: {min: 90, max: 2_147_483_647}}],
  ['peaks-range-ratio-1e308', 'kick-120-22k', 22_050, {engine: 'peaks', tempoRange: {min: 1e-305, max: 1000}}],
];

/** The samples a port decodes from the committed file: the 16-bit PCM over 32768, as 32-bit floats */
function decoded(id: string): Float32Array {
  const signal = signals.find(candidate => candidate.id === id);
  if (signal === undefined) {
    throw new Error(`No conformance signal ${id}`);
  }

  return Float32Array.from(toPcm16(signal.build()), value => value / 32_768);
}

type Status = 'identical' | 'changed' | 'newly read' | 'no reading';

function statusOf(oracle: OfflineResult, reading: OfflineResult): Status {
  if (oracle === null) {
    return reading === null ? 'no reading' : 'newly read';
  }

  return JSON.stringify(reading) === JSON.stringify(oracle) ? 'identical' : 'changed';
}

/**
 * RBA-221's bar on the conformance inputs: wherever the peaks file path as it stood before RBA-221 (the oracle)
 * returns a reading, the library returns the same whole reading. Only an input the old path read nothing in may
 * read now. Every conformance input runs, through the Node entry the vectors are generated from.
 */
describe('peaks file path - the readings the old path returns are unchanged on every conformance input (RBA-221)', function () {
  // Seven option sets of up to 12 s of audio, twice each
  this.timeout(60_000);

  const cases = [
    ...signals
      .filter(signal => signal.nonFinite === undefined)
      .flatMap(signal => peaksOptionSets
        .filter(([name]) => signal.optionSets?.includes(name) ?? true)
        .map(([name, options]) => [`${signal.id}/${name}`, signal.id, signal.sampleRate, options] as const)),
    ...extraPeaksCases.map(([name, input, sampleRate, options]) => [`extra/${name}`, input, sampleRate, options] as const),
  ];

  const tally = new Map<Status, number>();

  after(() => {
    console.log(`RBA221-CONFORMANCE-TALLY ${JSON.stringify(Object.fromEntries(tally))}`);
  });

  for (const [id, input, sampleRate, options] of cases) {
    it(id, async () => {
      const samples = decoded(input);
      const oracle = await oracleAnalyzeSamples(samples, sampleRate, options, async lowpass => applyLowpass(samples, sampleRate, lowpass));
      const reading = await analyzeChannelData(samples, sampleRate, options);
      const status = statusOf(oracle, reading);
      tally.set(status, (tally.get(status) ?? 0) + 1);
      console.log(`RBA221-CONFORMANCE ${JSON.stringify({id, status, oracle: oracle?.bpm ?? null, reading: reading?.bpm ?? null, confidence: reading?.confidence ?? null})}`);

      if (oracle !== null) {
        expect(reading, `${id}: a reading the old path returns changed`).to.deep.equal(oracle);
      } else if (reading !== null) {
        expect(reading.confidence, `${id}: a reading only the new search finds is unmeasured`).to.equal(null);
      }
    });
  }
});
