import {expect} from 'chai';
import {detectTempo} from '../../../src/core/detect-tempo';
import {findPeaksRelativeToLevel, levelReference} from '../../../src/core/peak-detection';
import {resolveTempoRange} from '../../../src/core/tempo';
import * as consts from '../../../src/core/consts';
import {createClickTrack, clickTrackTempos} from '../../fixtures/click-track';
import {oracleDetectTempo} from '../../lib/peaks-file-path-oracle';

const sampleRate = 44_100;
const tempoRange = resolveTempoRange();

function scaled(samples: Float32Array, gain: number): Float32Array {
  return samples.map(sample => sample * gain);
}

/**
 * RBA-221: peaks' file path read nothing once the lowpassed bass peaked under the fixed ladder's 0.2 floor. It now
 * searches again relative to the channel's own level, only when the fixed ladder found nothing.
 */
describe('analyzer - level reference (RBA-221)', () => {
  describe('consts', () => {
    it('writes the silence floor out as the double 10 ** (-70 / 20) is', () => {
      expect(consts.silenceFloor).to.equal(10 ** (-70 / 20));
    });
  });

  describe('levelReference', () => {
    it('is 0 for silence', () => {
      expect(levelReference(new Float32Array(sampleRate * 10), sampleRate)).to.equal(0);
    });

    it('is the level of the beats, which one loud click does not set', () => {
      const clicks = scaled(createClickTrack(120), 0.1);
      const withClick = clicks.slice();
      withClick[sampleRate * 3] = 1;

      const reference = levelReference(withClick, sampleRate);

      expect(reference).to.equal(levelReference(clicks, sampleRate));
      // Each click peaks at about 0.077: 0.1 of 0.9, times 0.85 where the 60 Hz burst crests in its decay
      expect(reference).to.be.within(0.07, 0.08);
    });

    it('never takes the loudest window, even on a short file', () => {
      // Two windows: index floor(1 * 98 / 100) is 0, the quieter one
      const data = new Float32Array(Math.round(sampleRate * 0.5));
      data[10] = 0.01;
      data[data.length - 1] = 0.9;

      expect(levelReference(data, sampleRate)).to.equal(Math.fround(0.01));
    });

    it('takes the window at index floor((n - 1) * 98 / 100) of the n sorted maxima', () => {
      // 101 windows of one sample each at 4 Hz, the maxima 0, 0.01, ..., 1 in reverse: index 98 holds 0.98
      const data = Float32Array.from({length: 101}, (_, i) => (100 - i) / 100);

      expect(levelReference(data, 4)).to.equal(Math.fround(0.98));
    });

    it('counts only positive samples, as the ladder compares signed ones', () => {
      expect(levelReference(new Float32Array(sampleRate).fill(-0.5), sampleRate)).to.equal(0);
    });

    it('skips a NaN sample and counts an infinite one', () => {
      const data = new Float32Array(sampleRate).fill(Number.NaN);
      expect(levelReference(data, sampleRate)).to.equal(0);
      expect(levelReference(data.fill(Number.POSITIVE_INFINITY), sampleRate)).to.equal(Number.POSITIVE_INFINITY);
    });

    it('refuses a rate under the peaks engine\'s floor, where a window would hold no sample', () => {
      expect(() => levelReference(new Float32Array(10), 1.99)).to.throw(RangeError);
    });
  });

  describe('findPeaksRelativeToLevel', () => {
    it('finds nothing under the silence floor', async () => {
      const belowFloor = scaled(createClickTrack(120), consts.silenceFloor / 2);
      const {peaks} = await findPeaksRelativeToLevel({audioSampleRate: sampleRate, channelData: belowFloor});

      expect(peaks).to.have.lengthOf(0);
    });

    it('finds the beats just above the silence floor', async () => {
      const aboveFloor = scaled(createClickTrack(120), consts.silenceFloor * 4);
      const {peaks} = await findPeaksRelativeToLevel({audioSampleRate: sampleRate, channelData: aboveFloor});

      expect(peaks.length).to.be.at.least(consts.minPeaks);
    });

    for (const level of [1, 1.5, Number.POSITIVE_INFINITY]) {
      it(`finds nothing at a level of ${level}, where the fixed ladder already was this search`, async () => {
        // Above about 1.05 the scaled rungs would leave findPeaksAtThreshold's 0 to 1 range and throw
        const {peaks} = await findPeaksRelativeToLevel({
          audioSampleRate: sampleRate,
          channelData: new Float32Array(sampleRate * 10).fill(level),
        });

        expect(peaks).to.have.lengthOf(0);
      });
    }
  });

  describe('detectTempo', () => {
    for (const bpm of clickTrackTempos) {
      it(`keeps the fixed ladder's whole result for a click track at ${bpm} BPM it reads at full level`, async () => {
        const clicks = createClickTrack(bpm);
        const fixed = await oracleDetectTempo(clicks, sampleRate, tempoRange);

        expect(fixed).to.not.be.empty;
        expect(await detectTempo(clicks, sampleRate, tempoRange)).to.deep.equal({tempos: fixed, calibrated: true});
      });

      it(`reads a click track at ${bpm} BPM 30 dB under the fixed ladder's floor, uncalibrated`, async () => {
        const quiet = scaled(createClickTrack(bpm), 0.2 / 32);
        const {tempos, calibrated} = await detectTempo(quiet, sampleRate, tempoRange);

        expect(await oracleDetectTempo(quiet, sampleRate, tempoRange)).to.be.empty;
        expect(tempos[0]?.tempo).to.equal(bpm);
        expect(calibrated).to.equal(false);
      });
    }

    it('reads the same whole result at any quiet level, since the ladder follows the level', async () => {
      // Powers of two scale floats exactly, so every comparison with a scaled rung is the same
      const clicks = createClickTrack(128);
      const quiet = await detectTempo(scaled(clicks, 1 / 16), sampleRate, tempoRange);

      expect(quiet.tempos).to.not.be.empty;
      expect(await detectTempo(scaled(clicks, 1 / 1024), sampleRate, tempoRange)).to.deep.equal(quiet);
    });

    it('reads no tempo from silence', async () => {
      expect(await detectTempo(new Float32Array(sampleRate * 30), sampleRate, tempoRange)).to.deep.equal({tempos: [], calibrated: false});
    });
  });
});
