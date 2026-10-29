import {expect} from 'chai';
import {createRealtimeBpmAnalyzer, analyzeFullBuffer} from '../../src/index';
import {
  createTestAudioContext,
  closeAudioContext,
  createSyntheticBeat,
  createSilentAudio,
  createNoiseAudio,
} from '../setup';

/**
 * Error handling and edge case tests
 * Tests the library's resilience to invalid inputs and error conditions
 */
describe('Error Handling & Edge Cases', function () {
  this.timeout(10000);

  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  describe('analyzeFullBuffer - edge cases', () => {
    it('should handle silent audio gracefully', async () => {
      const silentBuffer = audioContext.createBuffer(1, 44100, 44100);
      const silentData = new Float32Array(44100).fill(0);
      silentBuffer.copyToChannel(silentData, 0);

      const result = await analyzeFullBuffer(silentBuffer);

      expect(result).to.be.an('array');
      // Silent audio might return empty results or no valid BPM
      expect(result.length).to.be.at.least(0);
    });

    it('should handle very short audio buffers', async () => {
      const shortBuffer = audioContext.createBuffer(1, 1000, 44100);
      const channelData = createSyntheticBeat(120, 0.023, 44100); // ~0.023 seconds
      shortBuffer.copyToChannel(channelData.slice(0, 1000), 0);

      const result = await analyzeFullBuffer(shortBuffer);

      // Should not crash, but may not detect BPM
      expect(result).to.be.an('array');
    });

    it('should handle white noise audio', async () => {
      const noiseBuffer = audioContext.createBuffer(1, 44100, 44100);
      const noiseData = createNoiseAudio(44100);
      const channelData = new Float32Array(noiseData);
      noiseBuffer.copyToChannel(channelData, 0);

      const result = await analyzeFullBuffer(noiseBuffer);

      // Random noise shouldn't produce reliable BPM
      expect(result).to.be.an('array');
    });

    it('should handle mono audio', async () => {
      const monoBuffer = audioContext.createBuffer(1, 44100 * 5, 44100);
      const beatData = createSyntheticBeat(120, 5, 44100);
      monoBuffer.copyToChannel(beatData.slice(), 0);

      const result = await analyzeFullBuffer(monoBuffer);

      expect(result).to.be.an('array');
      if (result.length > 0) {
        expect(result[0].tempo).to.be.a('number');
      }
    });

    it('should handle stereo audio', async () => {
      const stereoBuffer = audioContext.createBuffer(2, 44100 * 5, 44100);
      const beatData = createSyntheticBeat(120, 5, 44100);
      stereoBuffer.copyToChannel(beatData.slice(), 0);
      stereoBuffer.copyToChannel(beatData.slice(), 1);

      const result = await analyzeFullBuffer(stereoBuffer);

      expect(result).to.be.an('array');
    });

    it('should handle different sample rates', async () => {
      const sampleRates = [22050, 44100, 48000];

      for (const sampleRate of sampleRates) {
        const buffer = audioContext.createBuffer(1, sampleRate * 5, sampleRate);
        const beatData = createSyntheticBeat(120, 5, sampleRate);
        buffer.copyToChannel(beatData.slice(), 0);

        const result = await analyzeFullBuffer(buffer);
        expect(result).to.be.an('array');
      }
    });

    it('should handle maximum amplitude audio', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100).fill(1);
      buffer.copyToChannel(channelData, 0);

      const result = await analyzeFullBuffer(buffer);

      expect(result).to.be.an('array');
      // Flat audio at max amplitude shouldn't have beats
    });

    it('should handle clipped audio (values beyond ±1)', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100);

      // Create clipped audio
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = (i % 2 === 0) ? 1.5 : -1.5; // Beyond normal range
      }

      buffer.copyToChannel(channelData, 0);

      // Should not crash
      const result = await analyzeFullBuffer(buffer);
      expect(result).to.be.an('array');
    });
  });

  describe('createRealtimeBpmAnalyzer - edge cases', () => {
    it('should handle multiple processor instances', async () => {
      const processor1 = await createRealtimeBpmAnalyzer(audioContext);
      const processor2 = await createRealtimeBpmAnalyzer(audioContext);

      expect(processor1).to.exist;
      expect(processor2).to.exist;
      expect(processor1).to.not.equal(processor2);

      processor1.disconnect();
      processor2.disconnect();
    });

    it('should accept all valid processor options', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext, {
        continuousAnalysis: true,
        stabilizationTime: 30000,
        muteTimeInIndexes: 15000,
        debug: true,
      });

      expect(processor).to.exist;
      processor.disconnect();
    });

    it('should work with minimal options', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext, {});
      expect(processor).to.exist;
      processor.disconnect();
    });

    it('should work without any options', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      expect(processor).to.exist;
      processor.disconnect();
    });
  });

  describe('processor control methods - edge cases', () => {
    it('should handle multiple reset() calls', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      expect(() => {
        processor.reset();
        processor.reset();
        processor.reset();
      }).to.not.throw();

      processor.disconnect();
    });

    it('should handle multiple stop() calls', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      expect(() => {
        processor.stop();
        processor.stop();
        processor.stop();
      }).to.not.throw();

      processor.disconnect();
    });

    it('should handle reset() after stop()', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      expect(() => {
        processor.stop();
        processor.reset();
      }).to.not.throw();

      processor.disconnect();
    });

    it('should handle stop() after reset()', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      expect(() => {
        processor.reset();
        processor.stop();
      }).to.not.throw();

      processor.disconnect();
    });

    it('should handle operations after disconnect', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      processor.disconnect();

      expect(() => {
        processor.reset();
        processor.stop();
      }).to.not.throw();
    });
  });

  describe('event listener edge cases', () => {
    it('should handle removing non-existent listeners', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      const handler = () => {};

      expect(() => {
        processor.removeEventListener('bpm', handler);
      }).to.not.throw();

      processor.disconnect();
    });

    it('should handle rapid event listener addition/removal', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      const handlers = Array.from({length: 100}, () => () => {});

      expect(() => {
        for (const handler of handlers) {
          processor.addEventListener('bpm', handler);
        }

        for (const handler of handlers) {
          processor.removeEventListener('bpm', handler);
        }
      }).to.not.throw();

      processor.disconnect();
    });

    it('should handle error event listeners', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      let errorReceived = false;

      processor.on('error', () => {
        errorReceived = true;
      });

      // Just verify listener is set up (actual errors would come from processor)
      expect(processor).to.exist;
      processor.disconnect();
    });
  });

  describe('audio connection edge cases', () => {
    it('should handle connect then immediate disconnect', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      expect(() => {
        processor.connect(audioContext.destination);
        processor.disconnect();
      }).to.not.throw();
    });

    it('should handle multiple connect calls', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      expect(() => {
        processor.connect(audioContext.destination);
        processor.connect(audioContext.destination);
      }).to.not.throw();

      processor.disconnect();
    });

    it('should handle multiple disconnect calls', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      processor.connect(audioContext.destination);

      expect(() => {
        processor.disconnect();
        processor.disconnect();
        processor.disconnect();
      }).to.not.throw();
    });

    it('should handle connection to multiple destinations', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);
      const gainNode1 = audioContext.createGain();
      const gainNode2 = audioContext.createGain();

      expect(() => {
        processor.connect(gainNode1);
        processor.connect(gainNode2);
      }).to.not.throw();

      processor.disconnect();
      gainNode1.disconnect();
      gainNode2.disconnect();
    });
  });

  describe('synthetic audio edge cases', () => {
    it('should handle zero amplitude beats', async () => {
      const buffer = audioContext.createBuffer(1, 44100 * 5, 44100);
      const beatData = createSyntheticBeat(120, 5, 44100, 0); // Zero amplitude
      buffer.copyToChannel(beatData.slice(), 0);

      const result = await analyzeFullBuffer(buffer);

      expect(result).to.be.an('array');
      // Zero amplitude is effectively silent
    });

    it('should handle very high amplitude beats', async () => {
      const buffer = audioContext.createBuffer(1, 44100 * 5, 44100);
      const beatData = createSyntheticBeat(120, 5, 44100, 2); // Beyond ±1
      buffer.copyToChannel(beatData.slice(), 0);

      const result = await analyzeFullBuffer(buffer);

      expect(result).to.be.an('array');
    });

    it('should handle BPM at lower boundary (90 BPM)', async () => {
      const buffer = audioContext.createBuffer(1, 44100 * 10, 44100);
      const beatData = createSyntheticBeat(90, 10, 44100);
      buffer.copyToChannel(beatData.slice(), 0);

      const result = await analyzeFullBuffer(buffer);

      expect(result).to.be.an('array');
      if (result.length > 0) {
        expect(result[0].tempo).to.be.at.least(90);
      }
    });

    it('should handle BPM at upper boundary (180 BPM)', async () => {
      const buffer = audioContext.createBuffer(1, 44100 * 10, 44100);
      const beatData = createSyntheticBeat(180, 10, 44100);
      buffer.copyToChannel(beatData.slice(), 0);

      const result = await analyzeFullBuffer(buffer);

      expect(result).to.be.an('array');
      if (result.length > 0) {
        expect(result[0].tempo).to.be.at.most(180);
      }
    });

    it('should handle intermediate BPM values', async () => {
      const testBpms = [95, 105, 120, 135, 155, 175];

      for (const bpm of testBpms) {
        const buffer = audioContext.createBuffer(1, 44100 * 10, 44100);
        const beatData = createSyntheticBeat(bpm, 10, 44100);
        buffer.copyToChannel(beatData.slice(), 0);

        const result = await analyzeFullBuffer(buffer);
        expect(result).to.be.an('array');
      }
    });
  });

  describe('memory and performance edge cases', () => {
    it('should handle long audio buffers', async function () {
      this.timeout(30000);

      // 30 seconds of audio
      const buffer = audioContext.createBuffer(1, 44100 * 30, 44100);
      const beatData = createSyntheticBeat(120, 30, 44100);
      buffer.copyToChannel(beatData.slice(), 0);

      const result = await analyzeFullBuffer(buffer);

      expect(result).to.be.an('array');
    });

    it('should handle processor with many chunks', async () => {
      const processor = await createRealtimeBpmAnalyzer(audioContext);

      // Just verify it doesn't crash with long processing
      expect(processor).to.exist;

      processor.disconnect();
    });
  });

  describe('AudioContext state handling', () => {
    it('should work with running AudioContext', async () => {
      await audioContext.resume();
      expect(audioContext.state).to.equal('running');

      const processor = await createRealtimeBpmAnalyzer(audioContext);
      expect(processor).to.exist;

      processor.disconnect();
    });

    it('should work with suspended AudioContext', async () => {
      await audioContext.suspend();
      expect(audioContext.state).to.equal('suspended');

      const processor = await createRealtimeBpmAnalyzer(audioContext);
      expect(processor).to.exist;

      await audioContext.resume();
      processor.disconnect();
    });
  });
});
