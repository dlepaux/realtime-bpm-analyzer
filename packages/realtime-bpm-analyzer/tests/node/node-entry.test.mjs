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

// node --test has no timeout of its own (RBA-241). This one caps each top-level suite as a whole,
// each test in it, and each hook, which inherits none, so a hang fails under its test's name. A
// thread that never ends can still hold the file's process open: main.yml's timeout-minutes ends that.
const hangLimit = {timeout: 60_000};

/**
 * Every key a lowpass setting refuses, with the message that must name it. A key's presence is the error, so
 * one row sets its value to undefined: the call must throw whatever the data holds.
 */
const refusedLowpassKeys = [
  [{Q: 4}, /Q is the DOM's spelling: use q/],
  [{detune: 100}, /detune is the DOM's, and has no equivalent here: fold it into frequency/],
  [{type: 'highpass'}, /type is the DOM's: this filter is always a lowpass/],
  [{type: undefined}, /type is the DOM's: this filter is always a lowpass/],
  [{gain: 6}, /gain is the DOM's: a lowpass has no gain/],
  [{frequncy: 150}, /frequncy is unknown: the settings are frequency and q/],
];

/**
 * Settings that are not an object, with the type each message must name. The message names the type and never
 * the value, so no row's value may appear in it.
 */
const notObjectSettings = [
  [150, 'a number'],
  ['150', 'a string'],
  [true, 'a boolean'],
  [[150, 1], 'an array'],
  [() => 150, 'a function'],
];

/** The message for a frequency outside the open range (0, Nyquist), at the given sample rate */
const outOfRange = (frequency, sampleRate) => `The lowpass setting frequency ${frequency} is out of range: at a sample rate of ${sampleRate} Hz, it must be above 0 and below ${sampleRate / 2} Hz.`;

/** The message for a q outside -758 to 770 dB */
const qOutOfRange = q => `The lowpass setting q ${q} is out of range: it must be from -758 to 770 dB.`;

/** Values of q just outside its range, and far outside: Node's float64 math takes those near the range, so the rule refuses them */
const qOutside = [-759, 771, -800, -Number.MAX_VALUE, Number.MAX_VALUE];

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

describe('realtime-bpm-analyzer/node', hangLimit, () => {
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
    // ... and inside engine.lowpass too, where a 5.x reader is likely to move them
    await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass: {frequencyValue: 200}}}), {name: 'TypeError', message: /frequencyValue.*use frequency/});
    for (const [settings, message] of refusedLowpassKeys) {
      const lowpass = {frequency: 150, ...settings};
      await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass}}), {name: 'TypeError', message}, Object.keys(settings).join());
    }
    // The lowpass values are checked before the filtering, at the samples' rate
    for (const [lowpass, kind] of notObjectSettings) {
      await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass}}), {
        name: 'TypeError',
        message: `The lowpass settings are an object with frequency and q, not ${kind}.`,
      }, kind);
    }

    for (const frequency of [0, -1, 22_050, 44_100]) {
      await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass: {frequency}}}), {name: 'RangeError', message: outOfRange(frequency, 44_100)}, String(frequency));
    }

    await assert.rejects(analyzeChannelData(createClickTrack(128), 8000, {engine: {name: 'peaks', lowpass: {frequency: 4000}}}), {name: 'RangeError', message: outOfRange(4000, 8000)});
    for (const lowpass of [undefined, null, {}, {frequency: 0.001}, {frequency: 22_049.99}]) {
      await analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass}});
    }

    for (const q of qOutside) {
      await assert.rejects(analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass: {q}}}), {name: 'RangeError', message: qOutOfRange(q)}, String(q));
    }

    // At the ends the filtered output is tiny (-758) or rings undamped (770), so no tempo is a fair result there
    for (const q of [-758, 770]) {
      const reading = await analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass: {q}}});
      assert.ok(reading === null || Number.isFinite(reading.bpm), String(q));
    }

    for (const q of [0, undefined]) {
      const reading = await analyzeChannelData(createClickTrack(128), 44_100, {engine: {name: 'peaks', lowpass: {q}}});
      assert.ok(reading !== null && Math.abs(reading.bpm - 128) <= 1, `${q}: got ${reading?.bpm}`);
    }
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

  it('gives confidence null, unmeasured, for a reading outside 90 to 180 BPM, with either engine', async () => {
    for (const engine of ['peaks', 'tempogram']) {
      const reading = await analyzeChannelData(createClickTrack(70), 44_100, {engine, tempoRange: {min: 60, max: 120}});
      assert.ok(Math.abs(reading.bpm - 70) <= 1, `${engine}: expected 70, got ${reading.bpm}`);
      assert.equal(reading.confidence, null, engine);
    }
  });

  it('gives confidence null on a custom range even inside 90 to 180 BPM, and a number on an explicit 90 to 180', async () => {
    // RBA-108's DECISION of 2026-11-16: 128 is the click's only octave in 80 to 200
    for (const engine of ['peaks', 'tempogram']) {
      const custom = await analyzeChannelData(createClickTrack(128), 44_100, {engine, tempoRange: {min: 80, max: 200}});
      assert.equal(custom.bpm, 128, engine);
      assert.equal(custom.confidence, null, engine);

      const explicit = await analyzeChannelData(createClickTrack(128), 44_100, {engine, tempoRange: {min: 90, max: 180}});
      // typeof first: null >= 0 and null <= 1 are both true
      assert.equal(typeof explicit.confidence, 'number', `${engine} got ${explicit.confidence}`);
      assert.ok(explicit.confidence >= 0 && explicit.confidence <= 1, `${engine} got ${explicit.confidence}`);
    }
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
    await assert.rejects(analyzeChannelData(new Float32Array(10), 44_100, {engin: 'peaks'}), {name: 'TypeError', message: / engin/});
    await assert.rejects(analyzeChannelData(new Float32Array(10), 44_100, {tempoRange: {min: 60, max: 120, mni: 50}}), {name: 'TypeError', message: / mni/});
    await assert.rejects(analyzeChannelData(new Float32Array(10), 44_100, {engine: {name: 'peaks', lowpass: {frequency: Number.NaN}}}), RangeError);
  });

  // RBA-260: under 2 Hz the 0.25 s skip after a peak rounds to no sample, and 6.1.0's peak search never advanced
  it('refuses a sample rate under 2 Hz for peaks, where the skip after a peak rounds to no sample, and runs at 2 Hz', async () => {
    const clicks = createClickTrack(120, 2, 60);
    const lowpass = {frequency: 0.2};
    for (const sampleRate of [1.99, 1, 0.5]) {
      await assert.rejects(analyzeChannelData(clicks, sampleRate, {engine: {name: 'peaks', lowpass}}), {
        name: 'RangeError',
        message: new RegExp(`Invalid sample rate: ${sampleRate}\\. The peaks engine needs at least 2 Hz`),
      });
    }

    await analyzeChannelData(clicks, 2, {engine: {name: 'peaks', lowpass}});
  });

  it('refuses a tempo range whose max / min overflows, with either engine, and takes the largest that does not', async () => {
    const clicks = createClickTrack(120, 44_100, 12);
    for (const engine of ['peaks', 'tempogram']) {
      await assert.rejects(analyzeChannelData(clicks, 44_100, {engine, tempoRange: {min: 1e-306, max: 1000}}), {
        name: 'RangeError',
        message: /max \/ min \(1000 \/ 1e-306\) is too large/,
      });
    }

    const reading = await analyzeChannelData(clicks, 44_100, {engine: 'peaks', tempoRange: {min: 1000 / Number.MAX_VALUE, max: 1000}});
    assert.equal(reading?.bpm, 120);
  });

  it('refuses a tempo range max above 2^31 - 1 BPM, so a whole BPM fits a 32-bit integer in every port, and takes it at that', async () => {
    const clicks = createClickTrack(120, 44_100, 12);
    await assert.rejects(analyzeChannelData(clicks, 44_100, {engine: 'peaks', tempoRange: {min: 90, max: 2 ** 31}}), {
      name: 'RangeError',
      message: /max \(2147483648\) must be at most 2147483647/,
    });
    const reading = await analyzeChannelData(clicks, 44_100, {engine: 'peaks', tempoRange: {min: 90, max: (2 ** 31) - 1}});
    assert.equal(reading?.bpm, 120);
  });

});

describe('applyLowpass', hangLimit, () => {
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

  it('refuses settings that are not an object, naming their type and not their value', () => {
    const input = createNoise(100);
    for (const [settings, kind] of notObjectSettings) {
      assert.throws(() => applyLowpass(input, sampleRate, settings), {
        name: 'TypeError',
        message: `The lowpass settings are an object with frequency and q, not ${kind}.`,
      }, kind);
    }
  });

  it('refuses a setting that is not a number, naming its type', () => {
    const input = createNoise(100);
    assert.throws(() => applyLowpass(input, sampleRate, {frequency: '150'}), {name: 'TypeError', message: 'The lowpass setting frequency is a string: it must be a finite number.'});
    assert.throws(() => applyLowpass(input, sampleRate, {q: null}), {name: 'TypeError', message: 'The lowpass setting q is null: it must be a finite number.'});
  });

  it('refuses a frequency that is not above 0 and below half the sample rate, which 5.x clamped silently', () => {
    const input = createNoise(100);
    for (const frequency of [0, -1, -Number.MIN_VALUE, sampleRate / 2, sampleRate, Number.MAX_VALUE]) {
      assert.throws(() => applyLowpass(input, sampleRate, {frequency}), {name: 'RangeError', message: outOfRange(frequency, sampleRate)}, String(frequency));
    }

    // Read as the 32-bit float Web Audio stores, these round onto Nyquist and 0, which the browser would clamp
    for (const [frequency, stored] of [[22_049.9995, 22_050], [1e-50, 0]]) {
      assert.throws(() => applyLowpass(input, sampleRate, {frequency}), {
        name: 'RangeError',
        message: `The lowpass setting frequency ${frequency} (${stored} as the 32-bit float Web Audio stores) is out of range: at a sample rate of 44100 Hz, it must be above 0 and below 22050 Hz.`,
      }, String(frequency));
    }

    // The rule follows the rate: 4 kHz is fine at 44.1 kHz and is the Nyquist frequency at 8 kHz
    assert.throws(() => applyLowpass(input, 8000, {frequency: 4000}), {name: 'RangeError', message: outOfRange(4000, 8000)});
  });

  it('accepts the defaults at every Web Audio rate and a frequency just inside both ends', () => {
    for (const rate of [3000, 8000, 44_100, 96_000, 768_000]) {
      assert.ok(applyLowpass(createNoise(100), rate).every(Number.isFinite), String(rate));
    }

    const input = createNoise(1000);
    for (const frequency of [0.001, (sampleRate / 2) - 0.01]) {
      const output = applyLowpass(input, sampleRate, {frequency});
      assert.ok(output.every(Number.isFinite), String(frequency));
      assert.notDeepEqual(output, input, String(frequency));
    }
  });

  it('refuses a q outside -758 to 770 dB, the range where Web Audio\'s 32-bit resonance term is a normal finite float', () => {
    const input = createNoise(100);
    for (const q of qOutside) {
      assert.throws(() => applyLowpass(input, sampleRate, {q}), {name: 'RangeError', message: qOutOfRange(q)}, String(q));
    }
  });

  it('gives a finite output for a q at both ends of its range, 0 and the default', () => {
    const input = createClickTrack(128).subarray(0, 44_100);
    for (const q of [-758, 770, 0, undefined]) {
      assert.ok(applyLowpass(input, sampleRate, {q}).every(Number.isFinite), String(q));
    }
  });

  it('takes the same {frequency, q} as the engine option, and refuses the 5.x names', () => {
    const input = createNoise(100);
    assert.notDeepEqual(applyLowpass(input, sampleRate, {q: 12}), applyLowpass(input, sampleRate));
    assert.throws(() => applyLowpass(input, sampleRate, {frequencyValue: sampleRate}), {name: 'TypeError', message: /frequencyValue.*use frequency/});
    assert.throws(() => applyLowpass(input, sampleRate, {qualityValue: 2}), {name: 'TypeError', message: /qualityValue.*use q/});
  });

  it('refuses every key but frequency and q, whatever its value, and keeps the defaults for none', () => {
    const input = createNoise(100);
    for (const [settings, message] of refusedLowpassKeys) {
      assert.throws(() => applyLowpass(input, sampleRate, {frequency: 150, ...settings}), {name: 'TypeError', message}, Object.keys(settings).join());
    }

    const byDefault = applyLowpass(input, sampleRate);
    assert.deepEqual(applyLowpass(input, sampleRate, {}), byDefault);
    assert.deepEqual(applyLowpass(input, sampleRate, null), byDefault);
    assert.deepEqual(applyLowpass(input, sampleRate, {frequency: undefined, q: undefined}), byDefault);
  });
});
