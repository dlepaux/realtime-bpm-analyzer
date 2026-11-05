import {expect} from 'chai';
import {CALIBRATION, calibrate} from '../../../src/core/calibration';
import {toReading} from '../../../src/core/engine';
import type {EngineName} from '../../../src/contract/types';

/**
 * benchmark/calibration.py's `apply_mapping` on the same tables, at these points: the library must read its tables
 * exactly as the benchmark that fitted and graded them does (RBA-106)
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

describe('Calibration', () => {
  it('reads its tables as the benchmark does', () => {
    for (const [engine, raw, bpm, expected] of parity) {
      expect(calibrate(engine, raw, bpm), `${engine} ${raw} at ${bpm} BPM`).to.be.closeTo(expected, 1e-6);
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
      for (const bpm of [80, 120, 150, 175]) {
        let previous = 0;
        for (let raw = 0; raw <= 1; raw += 0.01) {
          const chance = calibrate(engine, raw, bpm);
          expect(chance).to.be.at.least(previous);
          previous = chance;
        }
      }
    }
  });

  it('clamps a raw score outside 0 to 1', () => {
    expect(calibrate('tempogram', 1.4, 120)).to.equal(calibrate('tempogram', 1, 120));
    expect(calibrate('peaks', -0.2, 120)).to.equal(calibrate('peaks', 0, 120));
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
    const table = (points: ReadonlyArray<readonly [number, number]> | undefined, name: string) => {
      if (points === undefined) {
        throw new Error(`no ${name} table`);
      }

      return points;
    };

    // [engine, edge, the table just under it, the table from it]: a raw score on a table point reads that point exactly
    const edges = [
      ['peaks', 90, peaks.all, table(peaks.bands.from90, 'peaks from90')],
      ['peaks', 140, table(peaks.bands.from90, 'peaks from90'), table(peaks.bands.from140, 'peaks from140')],
      ['peaks', 165, table(peaks.bands.from140, 'peaks from140'), table(peaks.bands.from165, 'peaks from165')],
      ['tempogram', 140, tempogram.all, table(tempogram.bands.from140, 'tempogram from140')],
      ['tempogram', 165, table(tempogram.bands.from140, 'tempogram from140'), table(tempogram.bands.from165, 'tempogram from165')],
    ] as const;
    for (const [engine, edge, below, from] of edges) {
      for (const [raw, chance] of [below[4], below[12]]) {
        expect(calibrate(engine, raw, edge - 1), `${engine} ${raw} at ${edge - 1} BPM`).to.equal(chance);
      }

      for (const [raw, chance] of [from[4], from[12]]) {
        expect(calibrate(engine, raw, edge), `${engine} ${raw} at ${edge} BPM`).to.equal(chance);
      }
    }
  });

  it('reads a raw score that is not a number as the bottom of the table, never the top', () => {
    for (const engine of ['tempogram', 'peaks'] as const) {
      expect(calibrate(engine, Number.NaN, 120), engine).to.equal(calibrate(engine, 0, 120));
    }
  });

  it('picks the band from the reading\'s whole tempo, not the unrounded one', () => {
    // bpm 140 and bpmExact 139.6 straddle the edge: the band is from140, as the fit used `bpm`
    const tempo = {tempo: 140, exact: 139.6, count: 40, confidence: 0.3};
    const audio = {from: 0, to: 10, contextTime: 10};
    expect(toReading([tempo], audio, 'tempogram')?.confidence).to.equal(calibrate('tempogram', 0.3, 140));
    expect(calibrate('tempogram', 0.3, 140)).to.not.equal(calibrate('tempogram', 0.3, 139));
  });

  it('is what a reading carries as its confidence', () => {
    const tempo = {tempo: 150, exact: 150.2, count: 40, confidence: 0.3};
    const audio = {from: 0, to: 10, contextTime: 10};

    expect(toReading([tempo], audio, 'tempogram')?.confidence).to.equal(calibrate('tempogram', 0.3, 150));
    expect(toReading([tempo], audio, 'peaks')?.confidence).to.equal(calibrate('peaks', 0.3, 150));
  });
});
