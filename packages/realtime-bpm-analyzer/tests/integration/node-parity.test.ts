import {expect} from 'chai';
import {analyzeFullBuffer} from '../../src/index';
import {analyzeChannelData, applyLowpass} from '../../src/node';
import {getOfflineLowPassSource, getBiquadFilter} from '../../src/core/offline-pipeline';
import {lowpassCoefficients} from '../../src/core/lowpass';
import type {BiquadFilterOptions, Tempo} from '../../src/core/types';
import {createClickTrack, createNoise, clickTrackTempos} from '../fixtures/click-track';
import {bassTestExpected} from '../fixtures/bass-test-expected';

/**
 * The Node entry (`realtime-bpm-analyzer/node`) must behave like the Web Audio pipeline.
 * These run in the browser, the only place both exist side by side; tests/node runs the
 * built entry in plain Node against the same fixtures and pinned values.
 */

// Largest sample difference allowed between the plain-JS biquad and Web Audio's render.
// Measured at most 3e-8 in Chromium on macOS arm64 and 1.4e-6 on Linux x64 (CI): Chromium's
// float32 paths differ by platform. 1e-5 keeps a margin over the worst while staying far below
// anything that moves a peak across a threshold (steps of 0.05).
const maxSampleError = 1e-5;
// Largest magnitude-response difference allowed against getFrequencyResponse (float32 API)
const maxResponseError = 1e-4;

const filterCases: BiquadFilterOptions[] = [
  {},
  {frequencyValue: 150, qualityValue: 1},
  {frequencyValue: 500, qualityValue: 6},
  {frequencyValue: 100, qualityValue: -3},
  // Both ends of the clamp, special-cased by the spec
  {frequencyValue: 0},
  {frequencyValue: 30_000},
];

function audioBufferFrom(samples: Float32Array<ArrayBuffer>, sampleRate: number): AudioBuffer {
  const buffer = new AudioBuffer({length: samples.length, numberOfChannels: 1, sampleRate});
  buffer.copyToChannel(samples, 0);
  return buffer;
}

function maxAbsDifference(a: Float32Array, b: Float32Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    max = Math.max(max, Math.abs(a[i] - b[i]));
  }

  return max;
}

function expectSameCandidates(node: Tempo[], browser: Tempo[]): void {
  // Two empty results would agree without proving anything
  expect(browser).to.not.be.empty;
  expect(node.map(t => t.tempo)).to.deep.equal(browser.map(t => t.tempo));
  expect(node.map(t => t.count)).to.deep.equal(browser.map(t => t.count));
  node.forEach((candidate, i) => {
    expect(candidate.confidence).to.be.closeTo(browser[i].confidence, 1e-9);
  });
}

async function loadFixture(): Promise<AudioBuffer> {
  const response = await fetch('/tests/fixtures/bass-test.wav');
  const bytes = await response.arrayBuffer();
  // Decode at the file's own rate: a realtime context would resample to the device rate
  const context = new OfflineAudioContext(1, 1, bassTestExpected.sampleRate);
  return context.decodeAudioData(bytes);
}

describe('Node entry parity with Web Audio', () => {
  describe('applyLowpass', () => {
    for (const sampleRate of [44_100, 48_000]) {
      for (const options of filterCases) {
        it(`matches the OfflineAudioContext render at ${sampleRate} Hz with ${JSON.stringify(options)}`, async () => {
          const input = createNoise(sampleRate * 2);
          const rendered = await getOfflineLowPassSource(audioBufferFrom(input, sampleRate), options);
          const error = maxAbsDifference(applyLowpass(input, sampleRate, options), rendered.getChannelData(0));

          console.log(`[parity] filter ${sampleRate} Hz ${JSON.stringify(options)}: max sample error ${error.toExponential(2)}`);
          expect(error).to.be.below(maxSampleError);
        });
      }
    }

    it('has the magnitude response of the BiquadFilterNode', () => {
      const sampleRate = 44_100;
      const context = new OfflineAudioContext(1, 1, sampleRate);
      const frequencies = new Float32Array([20, 50, 100, 150, 200, 300, 1000, 5000, 15_000]);

      for (const options of filterCases) {
        const node = getBiquadFilter(context, options);
        const magnitudes = new Float32Array(frequencies.length);
        node.getFrequencyResponse(frequencies, magnitudes, new Float32Array(frequencies.length));
        const {b0, b1, b2, a1, a2} = lowpassCoefficients(node.frequency.value, node.Q.value, sampleRate);

        frequencies.forEach((frequency, i) => {
          // |H(e^jw)| of the biquad, evaluated directly from the coefficients
          const w = 2 * Math.PI * frequency / sampleRate;
          const numRe = b0 + (b1 * Math.cos(w)) + (b2 * Math.cos(2 * w));
          const numIm = -((b1 * Math.sin(w)) + (b2 * Math.sin(2 * w)));
          const denRe = 1 + (a1 * Math.cos(w)) + (a2 * Math.cos(2 * w));
          const denIm = -((a1 * Math.sin(w)) + (a2 * Math.sin(2 * w)));
          const magnitude = Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm);

          expect(magnitude, `${frequency} Hz with ${JSON.stringify(options)}`).to.be.closeTo(magnitudes[i], maxResponseError);
        });
      }
    });
  });

  describe('analyzeChannelData', () => {
    it('returns the candidates analyzeFullBuffer returns for the bass-test fixture', async () => {
      const buffer = await loadFixture();
      const browser = await analyzeFullBuffer(buffer);
      const node = await analyzeChannelData(buffer.getChannelData(0), buffer.sampleRate);

      console.log(`[parity] bass-test.wav browser ${JSON.stringify(browser)}`);
      console.log(`[parity] bass-test.wav node    ${JSON.stringify(node)}`);
      expectSameCandidates(node, browser);
      // Pins the value tests/node checks in plain Node, so both runtimes share one reference
      expect(browser[0].tempo).to.equal(bassTestExpected.tempo);
      expect(browser[0].count).to.equal(bassTestExpected.count);
    });

    for (const bpm of clickTrackTempos) {
      it(`returns the candidates analyzeFullBuffer returns for a ${bpm} BPM click track`, async () => {
        const sampleRate = 44_100;
        const samples = createClickTrack(bpm, sampleRate);
        const browser = await analyzeFullBuffer(audioBufferFrom(samples, sampleRate));
        const node = await analyzeChannelData(samples, sampleRate);

        console.log(`[parity] click ${bpm} BPM: browser ${browser[0]?.tempo} (count ${browser[0]?.count}), node ${node[0]?.tempo} (count ${node[0]?.count})`);
        expectSameCandidates(node, browser);
      });
    }

    it('applies the custom filter and tempo range like analyzeFullBuffer', async () => {
      const sampleRate = 44_100;
      const samples = createClickTrack(174, sampleRate);
      const options = {frequencyValue: 150, qualityValue: 2, tempoRange: {min: 70, max: 140}};
      const browser = await analyzeFullBuffer(audioBufferFrom(samples, sampleRate), options);
      const node = await analyzeChannelData(samples, sampleRate, options);

      expectSameCandidates(node, browser);
    });
  });
});
