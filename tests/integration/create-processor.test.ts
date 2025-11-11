import {expect} from 'chai';
import {createRealTimeBpmProcessor, analyzeFullBuffer, getBiquadFilter, BpmAnalyzer} from '../../src/index';
import {createTestAudioContext, closeAudioContext} from '../setup';

/**
 * Integration tests for createRealTimeBpmProcessor function
 */
describe('createRealTimeBpmProcessor', function () {
  // AudioWorklet loading takes time, set higher timeout
  this.timeout(5000);

  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  describe('initialization', () => {
    it('should return a BpmAnalyzer instance', async () => {
      const processor = await createRealTimeBpmProcessor(audioContext);
      expect(processor).to.be.instanceOf(BpmAnalyzer);
    });

    it('should return an instance that extends EventTarget', async () => {
      const processor = await createRealTimeBpmProcessor(audioContext);
      expect(processor).to.be.instanceOf(EventTarget);
    });

    it('should create an AudioWorkletNode internally', async () => {
      const processor = await createRealTimeBpmProcessor(audioContext);
      expect(processor.node).to.be.instanceOf(AudioWorkletNode);
    });

    it('should accept processor options', async () => {
      const processor = await createRealTimeBpmProcessor(audioContext, {
        continuousAnalysis: true,
        stabilizationTime: 10000,
        muteTimeInIndexes: 5000,
        debug: false,
      });
      expect(processor).to.be.instanceOf(BpmAnalyzer);
    });
  });

  describe('AudioNode capabilities', () => {
    it('should be connectable to audio destination', async () => {
      const processor = await createRealTimeBpmProcessor(audioContext);
      expect(() => {
        processor.connect(audioContext.destination);
      }).to.not.throw();
    });

    it('should be disconnectable', async () => {
      const processor = await createRealTimeBpmProcessor(audioContext);
      processor.connect(audioContext.destination);
      expect(() => {
        processor.disconnect();
      }).to.not.throw();
    });
  });
});

/**
 * Integration tests for getBiquadFilter function
 */
describe('getBiquadFilter', () => {
  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  describe('with default options', () => {
    it('should create a BiquadFilterNode', async function () {
      this.timeout(5000);
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    });

    it('should create a lowpass filter', () => {
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass.type).to.equal('lowpass');
    });

    it('should use default frequency value (200Hz)', () => {
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass.frequency.value).to.equal(200);
    });

    it('should use default quality value (1)', () => {
      const lowpass = getBiquadFilter(audioContext);
      expect(lowpass.Q.value).to.equal(1);
    });
  });

  describe('with custom options', () => {
    it('should create a BiquadFilterNode with custom frequency', async function () {
      this.timeout(5000);
      const lowpass = getBiquadFilter(audioContext, {
        frequencyValue: 200,
        qualityValue: 1,
      });
      expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    });

    it('should use custom frequency value', () => {
      const lowpass = getBiquadFilter(audioContext, {
        frequencyValue: 150,
      });
      expect(lowpass.frequency.value).to.equal(150);
    });

    it('should use custom quality value', () => {
      const lowpass = getBiquadFilter(audioContext, {
        qualityValue: 2,
      });
      expect(lowpass.Q.value).to.equal(2);
    });

    it('should use both custom frequency and quality values', () => {
      const lowpass = getBiquadFilter(audioContext, {
        frequencyValue: 180,
        qualityValue: 1.5,
      });
      expect(lowpass.frequency.value).to.equal(180);
      expect(lowpass.Q.value).to.equal(1.5);
    });
  });
});

/**
 * Basic smoke tests for exported functions
 */
describe('Public API exports', () => {
  it('should export analyzeFullBuffer function', () => {
    expect(typeof analyzeFullBuffer === 'function').to.be.equal(true);
  });

  it('should export getBiquadFilter function', () => {
    expect(typeof getBiquadFilter === 'function').to.be.equal(true);
  });

  it('should export createRealTimeBpmProcessor function', () => {
    expect(typeof createRealTimeBpmProcessor === 'function').to.be.equal(true);
  });
});

/**
 * AudioContext compatibility tests
 */
describe('AudioContext compatibility', () => {
  it('should create a valid AudioContext instance', async () => {
    const audioContext = new AudioContext();
    expect(audioContext).to.be.instanceOf(AudioContext);
    await audioContext.close();
  });
});
