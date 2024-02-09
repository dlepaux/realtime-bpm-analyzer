import {expect} from 'chai';
import type {PostMessageEvents} from '../../src';
import {RealTimeBpmAnalyzer} from '../../src/realtime-bpm-analyzer';
import {readChannelDataToChunk} from '../utils';

describe('RealTimeBpmAnalyzer - Unit tests', () => {
  it('should create a new RealTimeBpmAnalyzer instance', async () => {
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
    realTimeBpmAnalyzer.reset();
    expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
  });
});

describe('RealTimeBpmAnalyzer - Integration tests', () => {
  it('should analyze a chunk of PCM Data', async () => {
    const audioContext = new AudioContext();
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
    const bufferSize = 4096;
    const channelData = await readChannelDataToChunk(audioContext, bufferSize);

    for (const chunk of channelData) {
      await realTimeBpmAnalyzer.analyzeChunck(chunk, audioContext.sampleRate, bufferSize, (data: PostMessageEvents) => {
        // TODO: Do something
      });
    }

    expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
  });

  it('should analyze a chunk of PCM Data (continuously)', async () => {
    const audioContext = new AudioContext();
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer({
      continuousAnalysis: true,
      stabilizationTime: 1,
      debug: true,
    });

    const bufferSize = 4096;
    const channelData = await readChannelDataToChunk(audioContext, bufferSize);

    for (const chunk of channelData) {
      await realTimeBpmAnalyzer.analyzeChunck(chunk, audioContext.sampleRate, bufferSize, (data: PostMessageEvents) => {
        // TODO: Do something
      });
    }

    expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
  });
});
