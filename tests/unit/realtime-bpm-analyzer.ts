import { expect } from 'chai';
import { BpmEventData } from '../../src';
import {RealTimeBpmAnalyzer} from '../../src/realtime-bpm-analyzer';
import {readChannelDataToChunk} from '../utils';

export default () => {
  /**
   * Test RealTimeBpmAnalyzer class
   */
  describe('RealTimeBpmAnalyzer', () => {
    it('should create a new RealTimeBpmAnalyzer instance', async () => {
      const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
      realTimeBpmAnalyzer.setAsyncConfiguration({});
      realTimeBpmAnalyzer.reset();
      expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
    });

    it('should analyze a chunk of PCM Data', async () => {
      const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
      const bufferSize = 4096;
      const sampleRate = 48000;
      const channelData = readChannelDataToChunk(bufferSize);
      let step = 0;

      for (const chunk of channelData) {
        await realTimeBpmAnalyzer.analyzeChunck(chunk, sampleRate, bufferSize, (data: BpmEventData) => {
          console.log('message received', data);
        });
      }

      expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
    });
  });
};
