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

  it('runs the tempogram, which refuses an unknown engine', async () => {
    const reading = await analyzeChannelData(createClickTrack(128), 44_100, {engine: 'tempogram'});

    assert.ok(Math.abs(reading.bpm - 128) <= 1, `got ${reading.bpm}`);
    assert.equal(reading.engine, 'tempogram');
    await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {engine: 'magic'}), RangeError);
    // A 5.x option name would otherwise be ignored: {detector: 'tempogram'} would run peaks
    await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {detector: 'tempogram'}), {name: 'TypeError', message: /detector.*engine/});
    await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {frequencyValue: 200}), {name: 'TypeError', message: /lowpass/});
    // The first pick, on 50 to 240, read this at half
    const fast = await analyzeChannelData(createClickTrack(174), 44_100, {engine: 'tempogram'});

    assert.ok(Math.abs(fast.bpm - 174) <= 3, `got ${fast.bpm}`);
  });

  // RBA-128, the tolerance as in tests/unit/session/session.test.ts: a quarter of what rounding loses
  for (const engine of ['peaks', 'tempogram']) {
    it(`reports a whole bpm and the exact tempo it measured, for ${engine}, on a 127.6 BPM click`, async () => {
      const reading = await analyzeChannelData(createClickTrack(127.6, 44_100, 30), 44_100, {engine});

      assert.equal(reading.bpm, 128);
      assert.ok(Math.abs(reading.bpmExact - 127.6) <= 0.1, `got ${reading.bpmExact}`);
    });
  }

  // At an edge of the range a jittered tempo splits its votes across the fold: under 90 they read about 180, over
  // 180 about 90. ±1 ms on each click moves each interval by up to ±0.3 BPM at 90 and ±1.1 at 180. Before peaks
  // folded its window across the octave it read 90.044 and 90.088 here, so 0.03 BPM tells the two apart. The
  // reading may come at either octave of the edge, so exact is judged at the octave it reports.
  for (const engine of ['peaks', 'tempogram']) {
    for (const bpm of [90, 180]) {
      it(`keeps the exact tempo true at the range edge, for ${engine}, on a jittered ${bpm} BPM click`, async () => {
        const reading = await analyzeChannelData(createClickTrack(bpm, 44_100, 40, 0.001), 44_100, {engine});
        const octave = reading.bpm / bpm;

        assert.ok([0.5, 1, 2].includes(octave), `got bpm ${reading.bpm}`);
        assert.ok(Math.abs(reading.bpmExact - (bpm * octave)) <= 0.03, `got ${reading.bpmExact} at bpm ${reading.bpm}`);
      });
    }
  }

  it('returns a reading: top candidate first with its relation, confidence from 0 to 1, the whole file as its audio', async () => {
    const reading = await analyzeChannelData(createClickTrack(120, 44_100, 30), 44_100);

    assert.deepEqual(reading.candidates[0], {bpm: reading.bpm, relation: 'top'});
    assert.ok(reading.candidates.slice(1).every(({relation}) => ['half', 'double', 'other'].includes(relation)));
    assert.ok(reading.confidence >= 0 && reading.confidence <= 1);
    assert.deepEqual(reading.audio, {from: 0, to: 30, contextTime: null});
    // The reading names the engine that ran: the default, since RBA-51
    assert.equal(reading.engine, 'tempogram');
    assert.ok(Object.isFrozen(reading));
  });

  it('finds the tempo analyzeFullBuffer finds for the bass-test fixture', async () => {
    const {channelData, sampleRate} = await readWavChannel0(new URL('../fixtures/bass-test.wav', import.meta.url));
    assert.equal(sampleRate, bassTestExpected.sampleRate);

    // Peaks, as the browser parity test that pins this value runs it
    const reading = await analyzeChannelData(channelData, sampleRate, {engine: 'peaks'});
    assert.equal(reading.bpm, bassTestExpected.tempo);
  });

  for (const bpm of clickTrackTempos) {
    it(`finds ${bpm} BPM in a click track`, async () => {
      const reading = await analyzeChannelData(createClickTrack(bpm), 44_100, {engine: 'peaks'});
      assert.ok(Math.abs(reading.bpm - bpm) <= 1, `expected ${bpm}, got ${reading.bpm}`);
    });
  }

  it('folds tempos into the requested range', async () => {
    const reading = await analyzeChannelData(createClickTrack(174), 44_100, {engine: 'peaks', tempoRange: {min: 70, max: 140}});
    assert.ok(Math.abs(reading.bpm - 87) <= 1, `expected 87, got ${reading.bpm}`);
  });

  it('returns null for silence, with either engine', async () => {
    assert.equal(await analyzeChannelData(new Float32Array(44_100), 44_100, {engine: 'peaks'}), null);
    assert.equal(await analyzeChannelData(new Float32Array(44_100 * 10), 44_100, {engine: 'tempogram'}), null);
  });

  it('rejects invalid input before analysing', async () => {
    await assert.rejects(analyzeChannelData(new Float32Array(0), 44_100), /non-empty Float32Array/);
    await assert.rejects(analyzeChannelData([0.1, 0.2], 44_100), /non-empty Float32Array/);
    await assert.rejects(analyzeChannelData(new Float32Array(10), 0), RangeError);
    await assert.rejects(analyzeChannelData(new Float32Array(10), 44_100, {tempoRange: {min: 100, max: 150}}), RangeError);
    await assert.rejects(analyzeChannelData(new Float32Array(10), 44_100, {engine: {name: 'peaks', lowpass: {frequency: Number.NaN}}}), RangeError);
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
