// Runs the built `realtime-bpm-analyzer/node` entry in plain Node, where no Web Audio exists.
// Needs `npm run build` first. Parity with the browser pipeline is asserted in
// tests/integration/node-parity.test.ts; this file checks the same pinned values here.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {analyzeChannelData, applyLowpass} from 'realtime-bpm-analyzer/node';
import {createClickTrack, createNoise, clickTrackTempos} from '../fixtures/click-track.ts';
import {bassTestExpected} from '../fixtures/bass-test-expected.ts';

/**
 * Reads channel 0 of a PCM WAV file (16 or 24 bit), scaled to [-1, 1] the way
 * decodeAudioData scales it. Enough for the fixture; not a general decoder.
 * @param {string} path WAV file path
 * @returns {Promise<{channelData: Float32Array, sampleRate: number}>}
 */
async function readWavChannel0(path) {
  const bytes = await readFile(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let offset = 12;
  let format;

  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ') {
      format = {
        channels: bytes.readUInt16LE(body + 2),
        sampleRate: bytes.readUInt32LE(body + 4),
        bits: bytes.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      assert.ok(format, 'fmt chunk precedes data');
      const bytesPerSample = format.bits / 8;
      const frame = bytesPerSample * format.channels;
      const frames = Math.floor(size / frame);
      const channelData = new Float32Array(frames);
      const scale = 2 ** (format.bits - 1);

      for (let i = 0; i < frames; i += 1) {
        channelData[i] = bytes.readIntLE(body + (i * frame), bytesPerSample) / scale;
      }

      return {channelData, sampleRate: format.sampleRate};
    }

    offset = body + size + (size % 2);
  }

  throw new Error(`No data chunk in ${path}`);
}

describe('realtime-bpm-analyzer/node', () => {
  it('loads without Web Audio globals', () => {
    assert.equal(typeof globalThis.OfflineAudioContext, 'undefined');
    assert.equal(typeof globalThis.AudioContext, 'undefined');
    assert.equal(typeof analyzeChannelData, 'function');
  });

  it('is also published as CommonJS', () => {
    const require = createRequire(import.meta.url);
    const cjs = require('realtime-bpm-analyzer/node');
    assert.equal(typeof cjs.analyzeChannelData, 'function');
    assert.equal(typeof cjs.applyLowpass, 'function');
  });

  it('runs the tempogram, which refuses an unknown detector', async () => {
    const [top] = await analyzeChannelData(createClickTrack(128), 44_100, {detector: 'tempogram'});

    assert.ok(Math.abs(top.tempo - 128) <= 1, `got ${top.tempo}`);
    await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {detector: 'magic'}), RangeError);
  });

  it('finds the tempo analyzeFullBuffer finds for the bass-test fixture', async () => {
    const {channelData, sampleRate} = await readWavChannel0(new URL('../fixtures/bass-test.wav', import.meta.url));
    assert.equal(sampleRate, bassTestExpected.sampleRate);

    const [top] = await analyzeChannelData(channelData, sampleRate);
    assert.equal(top.tempo, bassTestExpected.tempo);
    assert.equal(top.count, bassTestExpected.count);
  });

  for (const bpm of clickTrackTempos) {
    it(`finds ${bpm} BPM in a click track`, async () => {
      const [top] = await analyzeChannelData(createClickTrack(bpm), 44_100);
      assert.ok(Math.abs(top.tempo - bpm) <= 1, `expected ${bpm}, got ${top.tempo}`);
    });
  }

  it('folds tempos into the requested range', async () => {
    const [top] = await analyzeChannelData(createClickTrack(174), 44_100, {tempoRange: {min: 70, max: 140}});
    assert.ok(Math.abs(top.tempo - 87) <= 1, `expected 87, got ${top.tempo}`);
  });

  it('returns no candidate for silence', async () => {
    assert.deepEqual(await analyzeChannelData(new Float32Array(44_100), 44_100), []);
  });

  it('rejects invalid input before analysing', async () => {
    await assert.rejects(analyzeChannelData(new Float32Array(0), 44_100), /non-empty Float32Array/);
    await assert.rejects(analyzeChannelData([0.1, 0.2], 44_100), /non-empty Float32Array/);
    await assert.rejects(analyzeChannelData(new Float32Array(10), 0), RangeError);
    await assert.rejects(analyzeChannelData(new Float32Array(10), 44_100, {tempoRange: {min: 100, max: 150}}), RangeError);
    await assert.rejects(analyzeChannelData(new Float32Array(10), 44_100, {frequencyValue: Number.NaN}), RangeError);
  });
});

describe('applyLowpass', () => {
  const sampleRate = 44_100;
  const sine = (frequency, length = sampleRate) => Float32Array.from(
    {length},
    (_, i) => Math.sin(2 * Math.PI * frequency * i / sampleRate),
  );
  const peakAfterSettling = samples => Math.max(...samples.subarray(samples.length / 2).map(Math.abs));

  it('passes DC with unity gain', () => {
    const output = applyLowpass(new Float32Array(sampleRate).fill(0.5), sampleRate);
    assert.ok(Math.abs(output.at(-1) - 0.5) < 1e-6);
  });

  it('keeps the bass and cuts the treble', () => {
    assert.ok(peakAfterSettling(applyLowpass(sine(60), sampleRate)) > 0.9);
    assert.ok(peakAfterSettling(applyLowpass(sine(5000), sampleRate)) < 0.01);
  });

  it('returns a new array of the same length and leaves the input untouched', () => {
    const input = createNoise(1000);
    const copy = input.slice();
    const output = applyLowpass(input, sampleRate);
    assert.notEqual(output, input);
    assert.equal(output.length, input.length);
    assert.deepEqual(input, copy);
  });

  it('follows Web Audio at the ends of the frequency range', () => {
    const input = createNoise(100);
    assert.deepEqual(applyLowpass(input, sampleRate, {frequencyValue: sampleRate}), input);
    assert.ok(applyLowpass(input, sampleRate, {frequencyValue: 0}).every(sample => sample === 0));
  });
});
