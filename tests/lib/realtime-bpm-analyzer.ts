import { expect } from 'chai';
import { BpmEventData } from '../../src';
import {RealTimeBpmAnalyzer} from '../../src/realtime-bpm-analyzer';
import {readChannelDataToChunk} from '../utils';

export default () => {
  describe('RealTimeBpmAnalyzer - Unit tests', () => {
    it('should create a new RealTimeBpmAnalyzer instance', async () => {
      const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
      realTimeBpmAnalyzer.setAsyncConfiguration({});
      realTimeBpmAnalyzer.reset();
      expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
    });
  });

  describe('RealTimeBpmAnalyzer - Integration tests', () => {
    it('should analyze a chunk of PCM Data', async () => {
      const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
      const bufferSize = 4096;
      const sampleRate = 48000;
      const channelData = readChannelDataToChunk(bufferSize);

      for (const chunk of channelData) {
        await realTimeBpmAnalyzer.analyzeChunck(chunk, sampleRate, bufferSize, (data: BpmEventData) => {
          // console.log('message received', data);
        });
      }

      expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
    });

    it('should analyze a chunk of PCM Data (continuously)', async () => {
      const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
      realTimeBpmAnalyzer.setAsyncConfiguration({
        continuousAnalysis: true,
        stabilizationTime: 1,
      });
      const bufferSize = 4096;
      const sampleRate = 48000;
      const channelData = readChannelDataToChunk(bufferSize);

      for (const chunk of channelData) {
        await realTimeBpmAnalyzer.analyzeChunck(chunk, sampleRate, bufferSize, (data: BpmEventData) => {
          // console.log('message received', data);
        });
      }

      expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
    });
  });
};
