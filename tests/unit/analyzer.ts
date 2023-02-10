import {expect} from 'chai';

import {readChannelData} from '../utils';

import {data as assertIntervals} from '../fixtures/bass-test-intervals';
import {data as assertTempo} from '../fixtures/bass-test-tempo';

import * as analyzer from '../../src/analyzer';

const sampleRate = 48000;

const assertPeaksBassSample = [12962,23459,35776,46244,58593,69041,82686,105130,115632,127947,138418,150759,161199,174832,197297,207805,220128,230605,242947,253382,266950,289455,299456,312334,322814,335783,358605];

const validThreshold = 0.8999999999999999;

export default () => {
  /**
   * Test Utility functions
   */
  describe('Analyzer', () => {
    it('should find peaks at specific threshold in channel data', async () => {
      const channelData = await readChannelData();
      const {peaks, threshold} = await analyzer.findPeaksAtThreshold(channelData, validThreshold);

      expect(threshold).to.be.equal(validThreshold);
      expect(JSON.stringify(peaks)).to.be.equal(JSON.stringify(assertPeaksBassSample));
    });

    it('should find peaks from channel data', async () => {
      const channelData = await readChannelData();
      const {peaks, threshold} = await analyzer.findPeaks(channelData);

      expect(threshold).to.be.equal(validThreshold);
      expect(JSON.stringify(peaks)).to.be.equal(JSON.stringify(assertPeaksBassSample));
    });

    it('should identify intervals from peaks', async () => {
      const intervals = analyzer.identifyIntervals(assertPeaksBassSample);
      expect(JSON.stringify(intervals)).to.be.equal(JSON.stringify(assertIntervals));
    });

    it('should group by tempo and get candidates', async () => {
      const tempo = analyzer.groupByTempo(sampleRate, assertIntervals);
      expect(JSON.stringify(tempo)).to.be.equal(JSON.stringify(assertTempo));
      const candidatesLength = 5;
      const candidate = analyzer.getTopCandidate(tempo);
      expect(candidate).to.be.equal(126);
      const candidates = analyzer.getTopCandidates(tempo, candidatesLength);
      expect(candidates.length).to.be.equal(candidatesLength);
    });

    it('should trigger an error while getting candidate from empty array', async () => {
      expect(function(){
        analyzer.getTopCandidate([]);
      }).to.throw('Could not find enough samples for a reliable detection.');
    });

    // it('should test threshold value with stop call', async () => {
    //   const validPeaks = utils.generateValidPeaksModel();
    //   validPeaks[validThreshold] = assertPeaksBassSample;
    //   const data = await analyzer.computeBpm(validPeaks, sampleRate);
    //   console.log('validPeaks', validPeaks);
    //   console.log('data', data);
    //   // expect(threshold).to.be.equal(validThreshold);
    //   // expect(JSON.stringify(peaks)).to.be.equal(JSON.stringify(assertPeaksBassSample));
    // });
  });
};
