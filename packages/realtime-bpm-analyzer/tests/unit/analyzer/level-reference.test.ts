import {expect} from 'chai';
import {detectTempo} from '../../../src/core/detect-tempo';
import {findPeaksRelativeToLevel, levelReference} from '../../../src/core/peak-detection';
import {resolveTempoRange} from '../../../src/core/tempo';
import * as consts from '../../../src/core/consts';
import {createClickTrack, clickTrackTempos} from '../../fixtures/click-track';
import {oracleDetectTempo} from '../../lib/peaks-file-path-oracle';

const sampleRate = 44_100;
const tempoRange = resolveTempoRange();

/** The 32-bit float with these bits, so the arithmetic traps below are exact */
function f32(bits: number): number {
  return new Float32Array(new Uint32Array([bits]).buffer)[0];
}

function scaled(samples: Float32Array, gain: number): Float32Array {
  return samples.map(sample => sample * gain);
}

/**
 * Peaks' file path read nothing once the lowpassed bass peaked under the fixed ladder's 0.2 floor. It now
 * searches again relative to the channel's own level, only when the fixed ladder found nothing.
 */
describe('analyzer - level reference', () => {
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
      // 10 windows of one sample each at 4 Hz, the maxima 0.1 to 1 in reverse. floor(9 * 98 / 100) is index 8, which
      // holds 0.9, where a nearest rank or a rounded index takes 1 and an interpolated percentile 0.982
      const data = Float32Array.from({length: 10}, (_, i) => (10 - i) / 10);

      expect(levelReference(data, 4)).to.equal(Math.fround(0.9));
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

    it('compares each sample with the scaled rung in double, never rounding the threshold to 32 bits', async () => {
      // conformance/readme.md, "The peaks level": a 32-bit threshold passes every vector, so this pins it. At 4 Hz a
      // window is one sample. The level is L, the first 32-bit float above 0.01 whose 0.9 * L rounds up when stored;
      // twelve samples hold that stored 0.9 * L, so they clear the double threshold 0.9 * L and rung 0.9 finds 15
      // peaks. A 32-bit threshold equals them and finds 3, so the search would go on to 0.85 and take sample 50 too
      const data = new Float32Array(100);
      const level = f32(0x3C_23_D7_0D);
      data.fill(level, 0, 3);
      data.fill(f32(0x3C_13_74_BF), 10, 22);
      data[50] = f32(0x3C_0E_8A_74);

      expect(levelReference(data, 4)).to.equal(level);
      const {peaks, threshold} = await findPeaksRelativeToLevel({audioSampleRate: 4, channelData: data});
      expect(peaks).to.deep.equal([0, 1, 2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
      expect(threshold).to.equal(0.9 * level);
    });

    it('compares the level with the silence floor in double', async () => {
      // The 32-bit float nearest -70 dBFS is just under the double floor, so it searches nothing; the next one up does
      const under = f32(0x39_A5_CB_5F);
      const over = f32(0x39_A5_CB_60);
      expect(under).to.be.below(consts.silenceFloor);
      expect(over).to.be.above(consts.silenceFloor);

      const search = async (level: number) => findPeaksRelativeToLevel({audioSampleRate: 4, channelData: new Float32Array(64).fill(level)});
      expect((await search(under)).peaks).to.have.lengthOf(0);
      expect((await search(over)).peaks).to.have.lengthOf(64);
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
