import {expect} from 'chai';
import {detectTempo} from '../../../src/core/detect-tempo';
import {findPeaks, findPeaksRelativeToLevel, levelReference} from '../../../src/core/peak-detection';
import {identifyIntervals, groupByTempo, getTopCandidates, resolveTempoRange} from '../../../src/core/tempo';
import * as consts from '../../../src/core/consts';
import {createClickTrack, clickTrackTempos} from '../../fixtures/click-track';

const sampleRate = 44_100;
const tempoRange = resolveTempoRange();

function scaled(samples: Float32Array, gain: number): Float32Array {
  return samples.map(sample => sample * gain);
}

/** 5.6.1's `detectTempo`, verbatim: the fixed ladder alone */
async function fixedLadderTempos(channelData: Float32Array) {
  const {peaks} = await findPeaks({audioSampleRate: sampleRate, channelData});

  return getTopCandidates(groupByTempo({audioSampleRate: sampleRate, intervalCounts: identifyIntervals(peaks), tempoRange}));
}

/**
 * RBA-221: peaks' file path read nothing once the lowpassed bass peaked under the fixed ladder's 0.2 floor.
 * It now searches again relative to the channel's own level, only when the fixed ladder found nothing.
 */
describe('analyzer - level reference (RBA-221)', () => {
  describe('levelReference', () => {
    it('is 0 for silence', () => {
      expect(levelReference(new Float32Array(sampleRate * 10), sampleRate)).to.equal(0);
    });

    it('is the level of the beats, which one loud click does not set', () => {
      const clicks = scaled(createClickTrack(120), 0.1);
      const withClick = clicks.slice();
      withClick[sampleRate * 3] = 1;

      const reference = levelReference(withClick, sampleRate);

      expect(reference).to.be.closeTo(levelReference(clicks, sampleRate), 1e-3);
      // Each click peaks at about 0.077: 0.1 of 0.9, times 0.85 where the 60 Hz burst crests in its decay
      expect(reference).to.be.within(0.07, 0.08);
    });

    it('never takes the loudest window, even on a short file', () => {
      // Two windows: the quantile must fall on the quieter one
      const data = new Float32Array(Math.round(sampleRate * 0.5));
      data[10] = 0.01;
      data[data.length - 1] = 0.9;

      expect(levelReference(data, sampleRate)).to.be.closeTo(0.01, 1e-9);
    });

    it('counts only positive samples, as the ladder compares signed ones', () => {
      expect(levelReference(new Float32Array(sampleRate).fill(-0.5), sampleRate)).to.equal(0);
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

    it('finds nothing at full scale, where the fixed ladder already was this search', async () => {
      const {peaks} = await findPeaksRelativeToLevel({
        audioSampleRate: sampleRate,
        channelData: new Float32Array(sampleRate * 10).fill(1),
      });

      expect(peaks).to.have.lengthOf(0);
    });
  });

  describe('detectTempo', () => {
    for (const bpm of clickTrackTempos) {
      it(`keeps 5.6.1's whole result for a click track at ${bpm} BPM it reads at full level`, async () => {
        const clicks = createClickTrack(bpm);
        const fixed = await fixedLadderTempos(clicks);

        expect(fixed).to.not.be.empty;
        expect(await detectTempo(clicks, sampleRate, tempoRange)).to.deep.equal(fixed);
      });

      it(`reads a click track at ${bpm} BPM 30 dB under the fixed ladder's floor`, async () => {
        const quiet = scaled(createClickTrack(bpm), 0.2 / 32);

        expect(await fixedLadderTempos(quiet)).to.be.empty;
        expect((await detectTempo(quiet, sampleRate, tempoRange))[0]?.tempo).to.equal(bpm);
      });
    }

    it('reads the same whole result at any quiet level, since the ladder follows the level', async () => {
      // Powers of two scale floats exactly, so every comparison with a scaled rung is the same
      const clicks = createClickTrack(128);
      const quiet = await detectTempo(scaled(clicks, 1 / 16), sampleRate, tempoRange);

      expect(quiet).to.not.be.empty;
      expect(await detectTempo(scaled(clicks, 1 / 1024), sampleRate, tempoRange)).to.deep.equal(quiet);
    });

    it('reads no tempo from silence', async () => {
      expect(await detectTempo(new Float32Array(sampleRate * 30), sampleRate, tempoRange)).to.deep.equal([]);
    });
  });
});
