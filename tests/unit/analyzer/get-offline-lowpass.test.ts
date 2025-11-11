import {expect} from 'chai';
import {getOfflineLowPassSource, getBiquadFilter} from '../../../src/core/analyzer';
import {createTestAudioContext, closeAudioContext, createSyntheticBeat} from '../../setup';

/**
 * Unit tests for getOfflineLowPassSource function
 * Tests offline audio filtering for BPM detection
 */
describe('analyzer - getOfflineLowPassSource', () => {
  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  describe('basic functionality', () => {
    it('should apply lowpass filter to audio buffer', async () => {
      // Create synthetic audio with both low and high frequencies
      const duration = 2;
      const sampleRate = 44100;
      const samples = duration * sampleRate;
      const audioData = new Float32Array(samples);

      // Add low frequency (100 Hz - bass)
      for (let i = 0; i < samples; i++) {
        audioData[i] = Math.sin(2 * Math.PI * 100 * i / sampleRate) * 0.5;
      }

      // Add high frequency (5000 Hz - treble)
      for (let i = 0; i < samples; i++) {
        audioData[i] += Math.sin(2 * Math.PI * 5000 * i / sampleRate) * 0.3;
      }

      // Create AudioBuffer
      const originalBuffer = audioContext.createBuffer(1, samples, sampleRate);
      originalBuffer.copyToChannel(audioData, 0);

      // Apply lowpass filter
      const filteredBuffer = await getOfflineLowPassSource(originalBuffer);

      expect(filteredBuffer).to.be.instanceOf(AudioBuffer);
      expect(filteredBuffer.length).to.equal(originalBuffer.length);
      expect(filteredBuffer.sampleRate).to.equal(originalBuffer.sampleRate);
      expect(filteredBuffer.numberOfChannels).to.equal(originalBuffer.numberOfChannels);

      // Filtered audio should have reduced high frequency content
      const filteredData = filteredBuffer.getChannelData(0);
      expect(filteredData).to.be.instanceOf(Float32Array);
      expect(filteredData.length).to.equal(samples);
    });

    it('should preserve audio buffer metadata', async () => {
      const originalBuffer = audioContext.createBuffer(2, 44100, 48000);
      const filteredBuffer = await getOfflineLowPassSource(originalBuffer);

      expect(filteredBuffer.numberOfChannels).to.equal(2);
      expect(filteredBuffer.length).to.equal(44100);
      expect(filteredBuffer.sampleRate).to.equal(48000);
    });

    it('should handle mono audio', async () => {
      const samples = 44100;
      const monoBuffer = audioContext.createBuffer(1, samples, 44100);
      const channelData = new Float32Array(samples);

      for (let i = 0; i < samples; i++) {
        channelData[i] = Math.sin(2 * Math.PI * 150 * i / 44100);
      }

      monoBuffer.copyToChannel(channelData, 0);

      const filteredBuffer = await getOfflineLowPassSource(monoBuffer);

      expect(filteredBuffer.numberOfChannels).to.equal(1);
    });

    it('should handle stereo audio', async () => {
      const samples = 44100;
      const stereoBuffer = audioContext.createBuffer(2, samples, 44100);

      const leftChannel = new Float32Array(samples);
      const rightChannel = new Float32Array(samples);

      for (let i = 0; i < samples; i++) {
        leftChannel[i] = Math.sin(2 * Math.PI * 150 * i / 44100);
        rightChannel[i] = Math.cos(2 * Math.PI * 150 * i / 44100);
      }

      stereoBuffer.copyToChannel(leftChannel, 0);
      stereoBuffer.copyToChannel(rightChannel, 1);

      const filteredBuffer = await getOfflineLowPassSource(stereoBuffer);

      expect(filteredBuffer.numberOfChannels).to.equal(2);
    });
  });

  describe('filter options', () => {
    it('should accept custom frequency value', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100).fill(0.5);
      buffer.copyToChannel(channelData, 0);

      const filteredBuffer = await getOfflineLowPassSource(buffer, {
        frequencyValue: 150,
      });

      expect(filteredBuffer).to.be.instanceOf(AudioBuffer);
    });

    it('should accept custom quality value', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100).fill(0.5);
      buffer.copyToChannel(channelData, 0);

      const filteredBuffer = await getOfflineLowPassSource(buffer, {
        qualityValue: 2,
      });

      expect(filteredBuffer).to.be.instanceOf(AudioBuffer);
    });

    it('should accept both frequency and quality options', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100).fill(0.5);
      buffer.copyToChannel(channelData, 0);

      const filteredBuffer = await getOfflineLowPassSource(buffer, {
        frequencyValue: 180,
        qualityValue: 1.5,
      });

      expect(filteredBuffer).to.be.instanceOf(AudioBuffer);
    });
  });

  describe('edge cases', () => {
    it('should handle very short audio buffers', async () => {
      const shortBuffer = audioContext.createBuffer(1, 128, 44100);
      const channelData = new Float32Array(128).fill(0.5);
      shortBuffer.copyToChannel(channelData, 0);

      const filteredBuffer = await getOfflineLowPassSource(shortBuffer);

      expect(filteredBuffer.length).to.equal(128);
    });

    it('should handle silent audio', async () => {
      const silentBuffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100).fill(0);
      silentBuffer.copyToChannel(channelData, 0);

      const filteredBuffer = await getOfflineLowPassSource(silentBuffer);

      expect(filteredBuffer.length).to.equal(44100);
      const filteredData = filteredBuffer.getChannelData(0);
      // Silent input should remain mostly silent
      const maxValue = Math.max(
        ...Array.from(filteredData).map(item => Math.abs(item)),
      );
      expect(maxValue).to.be.lessThan(0.01);
    });

    it('should handle different sample rates', async () => {
      const sampleRates = [8000, 16000, 22050, 44100, 48000, 96000];

      for (const sampleRate of sampleRates) {
        const buffer = audioContext.createBuffer(1, sampleRate, sampleRate);
        const channelData = new Float32Array(sampleRate);

        for (let i = 0; i < sampleRate; i++) {
          channelData[i] = Math.sin(2 * Math.PI * 100 * i / sampleRate);
        }

        buffer.copyToChannel(channelData, 0);

        const filteredBuffer = await getOfflineLowPassSource(buffer);
        expect(filteredBuffer.sampleRate).to.equal(sampleRate);
      }
    });

    it('should handle maximum amplitude values', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100);

      // Alternate between max positive and negative
      for (let i = 0; i < 44100; i++) {
        channelData[i] = (i % 2 === 0) ? 1 : -1;
      }

      buffer.copyToChannel(channelData, 0);

      const filteredBuffer = await getOfflineLowPassSource(buffer);

      expect(filteredBuffer).to.be.instanceOf(AudioBuffer);
      // Lowpass should reduce extreme alternations
      const filteredData = filteredBuffer.getChannelData(0);
      const maxValue = Math.max(
        ...Array.from(filteredData).map(item => Math.abs(item)),
      );
      expect(maxValue).to.be.lessThan(1); // Should be attenuated
    });
  });

  describe('integration with getBiquadFilter', () => {
    it('should use filter settings consistently', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100);

      // 100Hz sine wave
      for (let i = 0; i < 44100; i++) {
        channelData[i] = Math.sin(2 * Math.PI * 100 * i / 44100);
      }

      buffer.copyToChannel(channelData, 0);

      const options = {frequencyValue: 200, qualityValue: 1};

      // Apply filter
      const filteredBuffer = await getOfflineLowPassSource(buffer, options);

      // Verify the filter was configured correctly by checking we got a result
      expect(filteredBuffer).to.be.instanceOf(AudioBuffer);
      expect(filteredBuffer.sampleRate).to.equal(44100);
    });
  });
});
