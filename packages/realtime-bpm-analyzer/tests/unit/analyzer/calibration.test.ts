import {expect} from 'chai';
import {CALIBRATION, MEASURED_TEMPO_RANGE, calibrate, isMeasuredTempoRange} from '../../../src/core/calibration';
import {toReading} from '../../../src/core/engine';
import {resolveTempoRange} from '../../../src/core/tempo';
import {defaultTempogramRange} from '../../../src/core/tempogram';
import type {EngineName} from '../../../src/contract/types';

// The range every analysis runs on when it sets none: the one the tables were fitted on
const defaultRange = resolveTempoRange();

/**
 * benchmark/calibration.py's `apply_mapping` on the same tables, at these points: the library must read its tables
 * exactly as the benchmark that fitted and graded them does. The rows at 80 and 190 BPM are outside
 * {@link MEASURED_TEMPO_RANGE}, where the library gives no confidence at all, so only the rows inside it are compared.
 */
const parity: ReadonlyArray<readonly [EngineName, number, number, number]> = [
  ['tempogram', 0, 80, 0.20051],
  ['tempogram', 0.01, 80, 0.20051],
  ['tempogram', 0.05, 80, 0.339190531],
  ['tempogram', 0.12, 80, 0.601513779],
  ['tempogram', 0.3, 80, 0.762598181],
  ['tempogram', 0.5, 80, 0.862726424],
  ['tempogram', 0.75, 80, 0.928511348],
  ['tempogram', 0.95, 80, 0.951513],
  ['tempogram', 1, 80, 0.951513],
  ['tempogram', 0, 100, 0.20051],
  ['tempogram', 0.01, 100, 0.20051],
  ['tempogram', 0.05, 100, 0.339190531],
  ['tempogram', 0.12, 100, 0.601513779],
  ['tempogram', 0.3, 100, 0.762598181],
  ['tempogram', 0.5, 100, 0.862726424],
  ['tempogram', 0.75, 100, 0.928511348],
  ['tempogram', 0.95, 100, 0.951513],
  ['tempogram', 1, 100, 0.951513],
  ['tempogram', 0, 139.9, 0.20051],
  ['tempogram', 0.01, 139.9, 0.20051],
  ['tempogram', 0.05, 139.9, 0.339190531],
  ['tempogram', 0.12, 139.9, 0.601513779],
  ['tempogram', 0.3, 139.9, 0.762598181],
  ['tempogram', 0.5, 139.9, 0.862726424],
  ['tempogram', 0.75, 139.9, 0.928511348],
  ['tempogram', 0.95, 139.9, 0.951513],
  ['tempogram', 1, 139.9, 0.951513],
  ['tempogram', 0, 140, 0.33474],
  ['tempogram', 0.01, 140, 0.33474],
  ['tempogram', 0.05, 140, 0.45535215],
  ['tempogram', 0.12, 140, 0.732961235],
  ['tempogram', 0.3, 140, 0.84099958],
  ['tempogram', 0.5, 140, 0.938079425],
  ['tempogram', 0.75, 140, 0.964845564],
  ['tempogram', 0.95, 140, 0.971147],
  ['tempogram', 1, 140, 0.971147],
  ['tempogram', 0, 150, 0.33474],
  ['tempogram', 0.01, 150, 0.33474],
  ['tempogram', 0.05, 150, 0.45535215],
  ['tempogram', 0.12, 150, 0.732961235],
  ['tempogram', 0.3, 150, 0.84099958],
  ['tempogram', 0.5, 150, 0.938079425],
  ['tempogram', 0.75, 150, 0.964845564],
  ['tempogram', 0.95, 150, 0.971147],
  ['tempogram', 1, 150, 0.971147],
  ['tempogram', 0, 164.9, 0.33474],
  ['tempogram', 0.01, 164.9, 0.33474],
  ['tempogram', 0.05, 164.9, 0.45535215],
  ['tempogram', 0.12, 164.9, 0.732961235],
  ['tempogram', 0.3, 164.9, 0.84099958],
  ['tempogram', 0.5, 164.9, 0.938079425],
  ['tempogram', 0.75, 164.9, 0.964845564],
  ['tempogram', 0.95, 164.9, 0.971147],
  ['tempogram', 1, 164.9, 0.971147],
  ['tempogram', 0, 165, 0.107843],
  ['tempogram', 0.01, 165, 0.107843],
  ['tempogram', 0.05, 165, 0.277029808],
  ['tempogram', 0.12, 165, 0.356959111],
  ['tempogram', 0.3, 165, 0.5],
  ['tempogram', 0.5, 165, 0.66028597],
  ['tempogram', 0.75, 165, 0.872549],
  ['tempogram', 0.95, 165, 0.872549],
  ['tempogram', 1, 165, 0.872549],
  ['tempogram', 0, 190, 0.107843],
  ['tempogram', 0.01, 190, 0.107843],
  ['tempogram', 0.05, 190, 0.277029808],
  ['tempogram', 0.12, 190, 0.356959111],
  ['tempogram', 0.3, 190, 0.5],
  ['tempogram', 0.5, 190, 0.66028597],
  ['tempogram', 0.75, 190, 0.872549],
  ['tempogram', 0.95, 190, 0.872549],
  ['tempogram', 1, 190, 0.872549],
  ['peaks', 0, 80, 0.185357],
  ['peaks', 0.01, 80, 0.185357],
  ['peaks', 0.05, 80, 0.185388384],
  ['peaks', 0.12, 80, 0.626525629],
  ['peaks', 0.3, 80, 0.914041],
  ['peaks', 0.5, 80, 0.952028],
  ['peaks', 0.75, 80, 0.952028],
  ['peaks', 0.95, 80, 0.952028],
  ['peaks', 1, 80, 0.952028],
  ['peaks', 0, 100, 0.131043],
  ['peaks', 0.01, 100, 0.131043],
  ['peaks', 0.05, 100, 0.131043],
  ['peaks', 0.12, 100, 0.573372588],
  ['peaks', 0.3, 100, 0.928731],
  ['peaks', 0.5, 100, 0.95229],
  ['peaks', 0.75, 100, 0.95229],
  ['peaks', 0.95, 100, 0.95229],
  ['peaks', 1, 100, 0.95229],
  ['peaks', 0, 139.9, 0.131043],
  ['peaks', 0.01, 139.9, 0.131043],
  ['peaks', 0.05, 139.9, 0.131043],
  ['peaks', 0.12, 139.9, 0.573372588],
  ['peaks', 0.3, 139.9, 0.928731],
  ['peaks', 0.5, 139.9, 0.95229],
  ['peaks', 0.75, 139.9, 0.95229],
  ['peaks', 0.95, 139.9, 0.95229],
  ['peaks', 1, 139.9, 0.95229],
  ['peaks', 0, 140, 0.37037],
  ['peaks', 0.01, 140, 0.37037],
  ['peaks', 0.05, 140, 0.375025188],
  ['peaks', 0.12, 140, 0.846783],
  ['peaks', 0.3, 140, 0.924796],
  ['peaks', 0.5, 140, 0.980392],
  ['peaks', 0.75, 140, 0.980392],
  ['peaks', 0.95, 140, 0.980392],
  ['peaks', 1, 140, 0.980392],
  ['peaks', 0, 150, 0.37037],
  ['peaks', 0.01, 150, 0.37037],
  ['peaks', 0.05, 150, 0.375025188],
  ['peaks', 0.12, 150, 0.846783],
  ['peaks', 0.3, 150, 0.924796],
  ['peaks', 0.5, 150, 0.980392],
  ['peaks', 0.75, 150, 0.980392],
  ['peaks', 0.95, 150, 0.980392],
  ['peaks', 1, 150, 0.980392],
  ['peaks', 0, 164.9, 0.37037],
  ['peaks', 0.01, 164.9, 0.37037],
  ['peaks', 0.05, 164.9, 0.375025188],
  ['peaks', 0.12, 164.9, 0.846783],
  ['peaks', 0.3, 164.9, 0.924796],
  ['peaks', 0.5, 164.9, 0.980392],
  ['peaks', 0.75, 164.9, 0.980392],
  ['peaks', 0.95, 164.9, 0.980392],
  ['peaks', 1, 164.9, 0.980392],
  ['peaks', 0, 165, 0.21875],
  ['peaks', 0.01, 165, 0.21875],
  ['peaks', 0.05, 165, 0.233226439],
  ['peaks', 0.12, 165, 0.474424477],
  ['peaks', 0.3, 165, 0.670588],
  ['peaks', 0.5, 165, 0.804688],
  ['peaks', 0.75, 165, 0.804688],
  ['peaks', 0.95, 165, 0.804688],
  ['peaks', 1, 165, 0.804688],
  ['peaks', 0, 190, 0.21875],
  ['peaks', 0.01, 190, 0.21875],
  ['peaks', 0.05, 190, 0.233226439],
  ['peaks', 0.12, 190, 0.474424477],
  ['peaks', 0.3, 190, 0.670588],
  ['peaks', 0.5, 190, 0.804688],
  ['peaks', 0.75, 190, 0.804688],
  ['peaks', 0.95, 190, 0.804688],
  ['peaks', 1, 190, 0.804688],
];

/**
 * @param points A band's table, if the engine has one
 * @param name The band, for the error
 * @returns The table
 */
function table(points: ReadonlyArray<readonly [number, number]> | undefined, name: string): ReadonlyArray<readonly [number, number]> {
  if (points === undefined) {
    throw new Error(`no ${name} table`);
  }

  return points;
}

describe('Calibration', () => {
  it('reads its tables as the benchmark does', () => {
    const measured = parity.filter(([, , bpm]) => bpm >= MEASURED_TEMPO_RANGE.min && bpm <= MEASURED_TEMPO_RANGE.max);
    expect(measured.length).to.be.greaterThan(parity.length / 2);
    for (const [engine, raw, bpm, expected] of measured) {
      expect(calibrate(engine, raw, bpm, defaultRange), `${engine} ${raw} at ${bpm} BPM`).to.be.closeTo(expected, 1e-6);
    }
  });

  it('keeps every table monotone, inside 0 to 1', () => {
    for (const mapping of Object.values(CALIBRATION)) {
      for (const table of [mapping.all, ...Object.values(mapping.bands)]) {
        expect(table.length).to.be.greaterThan(1);
        for (let i = 1; i < table.length; i += 1) {
          expect(table[i][0]).to.be.greaterThan(table[i - 1][0]);
          expect(table[i][1]).to.be.at.least(table[i - 1][1]);
        }

        expect(table.every(([raw, chance]) => raw >= 0 && raw <= 1 && chance >= 0 && chance <= 1)).to.equal(true);
      }
    }
  });

  it('never ranks a higher raw score lower', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      for (const bpm of [90, 120, 150, 175, 180]) {
        let previous = 0;
        for (let raw = 0; raw <= 1; raw += 0.01) {
          const chance = calibrate(engine, raw, bpm, defaultRange) ?? Number.NaN;
          expect(chance).to.be.at.least(previous);
          previous = chance;
        }
      }
    }
  });

  it('clamps a raw score outside 0 to 1', () => {
    expect(calibrate('tempogram', 1.4, 120, defaultRange)).to.equal(calibrate('tempogram', 1, 120, defaultRange));
    expect(calibrate('peaks', -0.2, 120, defaultRange)).to.equal(calibrate('peaks', 0, 120, defaultRange));
  });

  it('ships exactly the tables the benchmark committed, in results/rba-106-calibration-dev.json', async () => {
    const response = await fetch(new URL('../../../benchmark/results/rba-106-calibration-dev.json', import.meta.url));
    type Committed = {readonly all: unknown; readonly bands: Readonly<Record<string, unknown>>};
    const {engines} = await response.json() as {engines: Record<EngineName, {tables: {realtime: Committed}}>};
    // The results file names bands by their range; the library by where they start
    const bandName: Readonly<Record<string, string>> = {'90-140': 'from90', '140-165': 'from140', '165 and over': 'from165'};
    for (const engine of ['tempogram', 'peaks'] as const) {
      const {all, bands} = engines[engine].tables.realtime;
      const committedBands = Object.fromEntries(Object.entries(bands).map(([range, table]) => [bandName[range], table]));
      expect(CALIBRATION[engine].all, engine).to.deep.equal(all);
      expect(CALIBRATION[engine].bands, engine).to.deep.equal(committedBands);
    }
  });

  it('starts each band at its lower edge, as calibration.py does', () => {
    const {tempogram, peaks} = CALIBRATION;
    // [engine, edge, the table just under it, the table from it]: a raw score on a table point reads that point exactly
    const edges = [
      ['peaks', 140, table(peaks.bands.from90, 'peaks from90'), table(peaks.bands.from140, 'peaks from140')],
      ['peaks', 165, table(peaks.bands.from140, 'peaks from140'), table(peaks.bands.from165, 'peaks from165')],
      ['tempogram', 140, tempogram.all, table(tempogram.bands.from140, 'tempogram from140')],
      ['tempogram', 165, table(tempogram.bands.from140, 'tempogram from140'), table(tempogram.bands.from165, 'tempogram from165')],
    ] as const;
    for (const [engine, edge, below, from] of edges) {
      for (const [raw, chance] of [below[4], below[12]]) {
        expect(calibrate(engine, raw, edge - 1, defaultRange), `${engine} ${raw} at ${edge - 1} BPM`).to.equal(chance);
      }

      for (const [raw, chance] of [from[4], from[12]]) {
        expect(calibrate(engine, raw, edge, defaultRange), `${engine} ${raw} at ${edge} BPM`).to.equal(chance);
      }
    }
  });

  it('starts peaks\' first band at the measured range\'s lower edge, with nothing measured under it', () => {
    const from90 = table(CALIBRATION.peaks.bands.from90, 'peaks from90');
    for (const [raw, chance] of [from90[4], from90[12]]) {
      expect(calibrate('peaks', raw, 90, defaultRange), `peaks ${raw} at 90 BPM`).to.equal(chance);
      expect(calibrate('peaks', raw, 89, defaultRange), `peaks ${raw} at 89 BPM`).to.equal(null);
    }
  });

  it('reads a raw score that is not a number as the bottom of the table, never the top', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      expect(calibrate(engine, Number.NaN, 120, defaultRange), engine).to.equal(calibrate(engine, 0, 120, defaultRange));
    }
  });

  it('picks the band from the reading\'s whole tempo, not the unrounded one', () => {
    // bpm 140 and bpmExact 139.6 straddle the edge: the band is from140, as the fit used `bpm`
    const tempo = {tempo: 140, exact: 139.6, count: 40, confidence: 0.3};
    const audio = {from: 0, to: 10, contextTime: 10};
    expect(toReading([tempo], audio, 'tempogram', defaultRange)?.confidence).to.equal(calibrate('tempogram', 0.3, 140, defaultRange));
    expect(calibrate('tempogram', 0.3, 140, defaultRange)).to.not.equal(calibrate('tempogram', 0.3, 139, defaultRange));
  });

  it('is what a reading carries as its confidence', () => {
    const tempo = {tempo: 150, exact: 150.2, count: 40, confidence: 0.3};
    const audio = {from: 0, to: 10, contextTime: 10};

    expect(toReading([tempo], audio, 'tempogram', defaultRange)?.confidence).to.equal(calibrate('tempogram', 0.3, 150, defaultRange));
    expect(toReading([tempo], audio, 'peaks', defaultRange)?.confidence).to.equal(calibrate('peaks', 0.3, 150, defaultRange));
  });
});

// A confidence nobody measured would mislead the programs that act on it,
// so a reading outside the range the tables were fitted on carries null, never the nearest table's number
describe('Calibration, the measured tempo range', () => {
  const audio = {from: 0, to: 10, contextTime: 10};
  const at = (bpm: number) => ({tempo: bpm, exact: bpm, count: 40, confidence: 0.3});

  it('is 90 to 180 BPM, the range every calibration reading was taken on', () => {
    expect(MEASURED_TEMPO_RANGE).to.deep.equal({min: 90, max: 180});
    expect(Object.isFrozen(MEASURED_TEMPO_RANGE)).to.equal(true);
  });

  it('gives a number at both bounds, inclusive, and null just outside each, for either engine', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      for (const bpm of [90, 90.01, 179.99, 180]) {
        expect(calibrate(engine, 0.3, bpm, defaultRange), `${engine} at ${bpm} BPM`).to.be.a('number');
      }

      for (const bpm of [89.99, 89, 60, 180.01, 181, 240]) {
        expect(calibrate(engine, 0.3, bpm, defaultRange), `${engine} at ${bpm} BPM`).to.equal(null);
      }

      for (const bpm of [Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(calibrate(engine, 0.3, bpm, defaultRange), `${engine} at ${bpm} BPM`).to.equal(null);
      }
    }
  });

  it('puts null on a reading outside it, realtime and offline, and keeps its tempo and candidates', () => {
    // toReading builds the reading on both paths: the worklet's engines and analyzeFullBuffer / analyzeChannelData
    for (const engine of ['tempogram', 'peaks'] as const) {
      for (const bpm of [89, 181]) {
        const reading = toReading([at(bpm)], audio, engine, defaultRange);
        expect(reading?.confidence, `${engine} at ${bpm} BPM`).to.equal(null);
        expect(reading?.bpm).to.equal(bpm);
        expect(reading?.candidates).to.deep.equal([{bpm, relation: 'top'}]);
      }

      for (const bpm of [90, 180]) {
        expect(toReading([at(bpm)], audio, engine, defaultRange)?.confidence, `${engine} at ${bpm} BPM`).to.equal(calibrate(engine, 0.3, bpm, defaultRange));
      }
    }
  });

  // Two constants, one fact about the data and one setting, tied here: a change of default fails this test instead of
  // turning every default reading's confidence into null without a word
  it('equals the default tempo range, so a default reading always has a number', () => {
    for (const range of [resolveTempoRange(), defaultTempogramRange]) {
      expect(range).to.deep.equal({min: MEASURED_TEMPO_RANGE.min, max: MEASURED_TEMPO_RANGE.max});
      expect(isMeasuredTempoRange(range)).to.equal(true);
    }
  });
});

// On a custom range, the tables were fitted only on analyses run on the default
// range, and a custom range changes which candidate each engine picks, so its readings carry null even inside 90 to 180
describe('Calibration, the analysis\'s tempo range', () => {
  const audio = {from: 0, to: 10, contextTime: 10};
  const at = (bpm: number) => ({tempo: bpm, exact: bpm, count: 40, confidence: 0.3});
  const custom = [{min: 60, max: 200}, {min: 90, max: 181}, {min: 89, max: 180}, {min: 45, max: 90}, {min: 100, max: 200}];

  it('gives null on any custom range, even at a tempo inside 90 to 180, for either engine', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      for (const range of custom) {
        for (const bpm of [90, 120, 150, 180]) {
          expect(calibrate(engine, 0.3, bpm, range), `${engine} at ${bpm} BPM on ${range.min}-${range.max}`).to.equal(null);
        }
      }
    }
  });

  it('keeps the number on an explicit {min: 90, max: 180}, as on no range at all', () => {
    const explicit = resolveTempoRange({min: 90, max: 180});
    for (const engine of ['tempogram', 'peaks'] as const) {
      for (const bpm of [90, 120, 150, 180]) {
        const chance = calibrate(engine, 0.3, bpm, explicit);
        expect(chance, `${engine} at ${bpm} BPM`).to.be.a('number');
        expect(chance).to.equal(calibrate(engine, 0.3, bpm, defaultRange));
      }
    }
  });

  it('puts null on every reading from a custom range, realtime and offline, and keeps its tempo and candidates', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      for (const range of custom) {
        const reading = toReading([at(120)], audio, engine, range);
        expect(reading?.confidence, `${engine} on ${range.min}-${range.max}`).to.equal(null);
        expect(reading?.bpm).to.equal(120);
        expect(reading?.candidates).to.deep.equal([{bpm: 120, relation: 'top'}]);
      }

      expect(toReading([at(120)], audio, engine, {min: 90, max: 180})?.confidence, engine).to.equal(calibrate(engine, 0.3, 120, defaultRange));
    }
  });

  it('compares the range by value', () => {
    expect(isMeasuredTempoRange({min: 90, max: 180})).to.equal(true);
    expect(isMeasuredTempoRange(MEASURED_TEMPO_RANGE)).to.equal(true);
    for (const range of custom) {
      expect(isMeasuredTempoRange(range), `${range.min}-${range.max}`).to.equal(false);
    }
  });
});
