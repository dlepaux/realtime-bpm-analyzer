import {expect} from 'chai';
import {getBiquadFilter, getOfflineLowPassSource} from '../../../src/core/offline-pipeline';
import type {LowpassOption} from '../../../src/contract/types';
import {createTestAudioContext, closeAudioContext} from '../../setup';

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
    // Each case renders the same sine twice, once with the defaults (200 Hz, Q 1) and once with the setting, so a
    // setting the filter ignores gives the default's output and fails.
    const sampleRate = 44_100;

    async function rmsAfterLowpass(toneHz: number, options?: LowpassOption): Promise<number> {
      const buffer = audioContext.createBuffer(1, sampleRate, sampleRate);
      const channelData = new Float32Array(sampleRate);
      for (let i = 0; i < sampleRate; i++) {
        channelData[i] = Math.sin(2 * Math.PI * toneHz * i / sampleRate);
      }

      buffer.copyToChannel(channelData, 0);
      const filtered = (await getOfflineLowPassSource(buffer, options)).getChannelData(0);
      // Past the filter's settling time
      const tail = filtered.subarray(sampleRate / 2);
      return Math.sqrt(tail.reduce((sum, sample) => sum + (sample * sample), 0) / tail.length);
    }

    it('applies a custom frequency', async () => {
      // 1 kHz sits far above the default 200 Hz cutoff, and far below a 5 kHz one
      const byDefault = await rmsAfterLowpass(1000);
      const raised = await rmsAfterLowpass(1000, {frequency: 5000});

      expect(raised).to.be.greaterThan(0.6);
      expect(raised).to.be.greaterThan(byDefault * 5);
    });

    it('applies a custom q', async () => {
      // At the cutoff the gain follows Q (in dB, as Web Audio reads it): 12 dB is about 4x, the default 1 dB about 1.1x
      const byDefault = await rmsAfterLowpass(200);
      const resonant = await rmsAfterLowpass(200, {q: 12});

      expect(resonant).to.be.greaterThan(byDefault * 2.5);
    });

    it('applies frequency and q together', async () => {
      // Against the frequency alone, so the test fails if either setting is ignored
      const byDefault = await rmsAfterLowpass(1000);
      const frequencyOnly = await rmsAfterLowpass(1000, {frequency: 1000});
      const both = await rmsAfterLowpass(1000, {frequency: 1000, q: 12});

      expect(frequencyOnly).to.be.greaterThan(byDefault * 5);
      expect(both).to.be.greaterThan(frequencyOnly * 2.5);
    });

    it('refuses every key but frequency and q, which it would otherwise ignore', async () => {
      const buffer = audioContext.createBuffer(1, 128, sampleRate);
      const refused: Array<[Record<string, unknown>, string]> = [
        [{frequencyValue: 150}, 'use frequency'],
        [{qualityValue: 2}, 'use q'],
        [{Q: 4}, 'use q'],
        [{detune: 100}, 'fold it into frequency (frequency × 2^(detune/1200))'],
        [{type: 'highpass'}, 'this filter is always a lowpass'],
        [{gain: 6}, 'a lowpass has no gain'],
        [{frequncy: 150}, 'the settings are frequency and q'],
        [{type: undefined}, 'this filter is always a lowpass'],
      ];

      for (const [options, reason] of refused) {
        let caught: unknown;
        try {
          await getOfflineLowPassSource(buffer, options as LowpassOption);
        } catch (error) {
          caught = error;
        }

        expect(caught, JSON.stringify(options)).to.be.instanceOf(TypeError);
        expect((caught as Error).message).to.contain(`The lowpass setting ${Object.keys(options)[0]} `).and.to.contain(reason);
      }
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
    it('renders what getBiquadFilter builds with the same settings', async () => {
      const buffer = audioContext.createBuffer(1, 44100, 44100);
      const channelData = new Float32Array(44100);

      // 300 Hz sine, between the two cutoffs below
      for (let i = 0; i < 44100; i++) {
        channelData[i] = Math.sin(2 * Math.PI * 300 * i / 44100);
      }

      buffer.copyToChannel(channelData, 0);

      const options: LowpassOption = {frequency: 250, q: 3};
      const filtered = (await getOfflineLowPassSource(buffer, options)).getChannelData(0);

      const context = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = getBiquadFilter(context, options);
      source.connect(filter);
      filter.connect(context.destination);
      source.start(0);
      const expected = (await context.startRendering()).getChannelData(0);

      expect(filter.frequency.value).to.equal(250);
      expect(filter.Q.value).to.equal(3);
      expect(Array.from(filtered)).to.deep.equal(Array.from(expected));
    });
  });
});
