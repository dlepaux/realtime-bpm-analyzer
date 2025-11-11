import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../src/core/realtime-bpm-analyzer';
import {createTestAudioContext, closeAudioContext, loadTestAudio, audioBufferToChunks, createEventCollector} from '../setup';

describe('RealTimeBpmAnalyzer - Unit tests', () => {
  it('should create a new RealTimeBpmAnalyzer instance', () => {
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
    expect(realTimeBpmAnalyzer).to.be.instanceOf(RealTimeBpmAnalyzer);
  });

  it('should reset to initial state', () => {
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
    realTimeBpmAnalyzer.skipIndexes = 100;
    realTimeBpmAnalyzer.reset();
    expect(realTimeBpmAnalyzer.skipIndexes).to.equal(1);
  });

  it('should accept custom options', () => {
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer({
      continuousAnalysis: true,
      stabilizationTime: 10000,
      muteTimeInIndexes: 5000,
      debug: true,
    });
    expect(realTimeBpmAnalyzer.options.continuousAnalysis).to.be.true;
    expect(realTimeBpmAnalyzer.options.stabilizationTime).to.equal(10000);
  });
});

describe('RealTimeBpmAnalyzer - Integration tests', () => {
  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  it('should analyze chunks of PCM data and emit events', async () => {
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer();
    const bufferSize = 4096;
    const audioBuffer = await loadTestAudio(audioContext);
    const chunks = audioBufferToChunks(audioBuffer, bufferSize);
    const collector = createEventCollector();

    for (const channelData of chunks) {
      await realTimeBpmAnalyzer.analyzeChunk({
        audioSampleRate: audioContext.sampleRate,
        channelData,
        bufferSize,
        postMessage: collector.postMessage,
      });
    }

    // Should have emitted bpm events
    const bpmEvents = collector.getEventsByType('bpm');
    expect(bpmEvents.length).to.be.greaterThan(0);

    // Verify event structure
    const firstEvent = bpmEvents[0];
    expect(firstEvent.data).to.have.property('bpm');
    expect(firstEvent.data).to.have.property('threshold');
  });

  it('should emit analyzerReset in continuous mode', async function () {
    this.timeout(10000);

    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer({
      continuousAnalysis: true,
      stabilizationTime: 1, // Very short for testing
      debug: false,
    });

    const bufferSize = 4096;
    const audioBuffer = await loadTestAudio(audioContext);
    const chunks = audioBufferToChunks(audioBuffer, bufferSize);
    const collector = createEventCollector();

    for (const channelData of chunks) {
      await realTimeBpmAnalyzer.analyzeChunk({
        audioSampleRate: audioContext.sampleRate,
        channelData,
        bufferSize,
        postMessage: collector.postMessage,
      });
    }

    // With very short stabilization time and long audio, should reset
    const resetEvents = collector.getEventsByType('analyzerReset');
    expect(resetEvents.length).to.be.greaterThan(0);
  });

  it('should emit debug events when debug mode is enabled', async () => {
    const realTimeBpmAnalyzer = new RealTimeBpmAnalyzer({
      debug: true,
    });

    const bufferSize = 4096;
    const audioBuffer = await loadTestAudio(audioContext);
    const chunks = audioBufferToChunks(audioBuffer, bufferSize);
    const collector = createEventCollector();

    // Process just a few chunks for debug events
    for (let i = 0; i < 5 && i < chunks.length; i++) {
      await realTimeBpmAnalyzer.analyzeChunk({
        audioSampleRate: audioContext.sampleRate,
        channelData: chunks[i],
        bufferSize,
        postMessage: collector.postMessage,
      });
    }

    // Should have debug events
    const debugEvents = collector.events.filter(e => e.type === 'analyzeChunk' || e.type === 'validPeak');
    expect(debugEvents.length).to.be.greaterThan(0);
  });
});
