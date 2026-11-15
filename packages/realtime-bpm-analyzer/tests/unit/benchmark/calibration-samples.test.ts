import {expect} from 'chai';
import type {Hysteresis} from '../../../src/contract/types';
import {
  calibrationDetector, calibrationLookRefusal, calibrationLookScope, calibrationRow, rowIndex, samplesFile, samplesFormat,
} from '../../../benchmark/lib/calibration-samples';
import {detectors} from '../../../benchmark/lib/detectors';
import {sweepGrids} from '../../../benchmark/lib/hysteresis';

describe('the calibration samples', () => {
  it('are taken at the row the committed tempogram table was fitted at', async () => {
    const response = await fetch(new URL('../../../benchmark/results/rba-106-calibration-dev.json', import.meta.url));
    const {hysteresis} = await response.json() as {hysteresis: Record<'tempogram', Hysteresis>};
    expect(calibrationRow).to.deep.equal(hysteresis.tempogram);
    expect(sweepGrids.tempogram[rowIndex('tempogram', calibrationRow)]).to.deep.equal(calibrationRow);
  });

  it('come from the tempogram\'s sweep record', () => {
    expect(detectors[calibrationDetector].sweep).to.equal('tempogram');
  });

  it('say their format, which calibration.py requires', () => {
    const file = JSON.parse(samplesFile('heldout', {tempogram: calibrationRow}, {tempogram: []}, {skipped: 0})) as Record<string, unknown>;
    expect(file).to.deep.equal({format: samplesFormat, split: 'heldout', hysteresis: {tempogram: calibrationRow}, samples: {tempogram: []}, skipped: 0});
    expect(samplesFormat).to.equal(2);
  });

  it('refuse a row the grid does not hold', () => {
    expect(() => rowIndex('peaks', {...calibrationRow, lockBand: 0.5})).to.throw('no row');
  });
});

describe('the held-out calibration check', () => {
  const {detectors: names, sets} = calibrationLookScope;
  const reason = 'RBA-106, DECISION 2026-11-05';

  it('covers the tempogram on the five sets the table was fitted on', () => {
    expect([...names]).to.deep.equal(['tempogram-hysteresis']);
    expect([...sets]).to.deep.equal(['fsld', 'groove', 'guitarset', 'free-mixes', 'free-mixes-contested']);
  });

  it('starts once, with a reason, on its whole scope', () => {
    expect(calibrationLookRefusal('', false, reason, names, [...sets].reverse())).to.equal(null);
    expect(calibrationLookRefusal('', false, '  ', names, sets)).to.match(/reason/);
    expect(calibrationLookRefusal('', false, reason, names, sets.slice(1))).to.match(/no more and no less/);
    expect(calibrationLookRefusal('', false, reason, ['tempogram'], sets)).to.match(/no more and no less/);
  });

  it('is spent once logged, unless it is that check resuming', () => {
    const log = '| 2026-11-16T10:00:00.000Z | abc | tempogram-hysteresis | why |\n';
    expect(calibrationLookRefusal(log, false, reason, names, sets)).to.match(/runs once/);
    expect(calibrationLookRefusal(log, true, reason, names, sets)).to.equal(null);
    expect(calibrationLookRefusal(log, true, reason, names, sets.slice(1))).to.match(/no more and no less/);
  });
});
