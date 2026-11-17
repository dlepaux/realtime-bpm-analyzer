// What the runners count as a pass. A port's harness applies the same rules (../readme.md, Tolerances), so these
// tests pin them: a rule loosened here would let a broken port pass.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {applyNonFinite, compareReading, compareError, decodePcm16, runVectors, summary} from '../runner/core.mjs';

const tolerances = {bpmExact: 1e-6, confidence: 1e-6};

const reading = Object.freeze({
  bpm: 120,
  bpmExact: 120.02,
  confidence: 0.95,
  candidates: [{bpm: 120, relation: 'top'}, {bpm: 60, relation: 'half'}],
  audio: {from: 0, to: 8, contextTime: null},
  engine: 'tempogram',
});

/** The reading with some fields replaced */
const withFields = fields => ({...structuredClone(reading), ...fields});

describe('compareReading', () => {
  it('passes an identical reading', () => {
    assert.deepEqual(compareReading(reading, structuredClone(reading), tolerances), []);
  });

  it('passes float fields within their tolerance', () => {
    const actual = withFields({bpmExact: 120.02 + 9e-7, confidence: 0.95 - 9e-7});
    assert.deepEqual(compareReading(reading, actual, tolerances), []);
  });

  it('fails float fields beyond their tolerance', () => {
    const actual = withFields({bpmExact: 120.02 + 2e-6, confidence: 0.95 + 2e-6});
    const failures = compareReading(reading, actual, tolerances);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /bpmExact/);
    assert.match(failures[1], /confidence/);
  });

  it('holds bpm exact: a whole-BPM difference is a different reading', () => {
    assert.match(compareReading(reading, withFields({bpm: 121}), tolerances)[0], /bpm/);
  });

  it('holds a null confidence apart from any number, 0 included', () => {
    const unmeasured = withFields({confidence: null});
    assert.match(compareReading(unmeasured, withFields({confidence: 0}), tolerances)[0], /confidence/);
    assert.match(compareReading(reading, unmeasured, tolerances)[0], /confidence/);
    assert.deepEqual(compareReading(unmeasured, structuredClone(unmeasured), tolerances), []);
  });

  it('holds the candidates exact, in order, with their relations', () => {
    const swapped = withFields({candidates: [{bpm: 60, relation: 'half'}, {bpm: 120, relation: 'top'}]});
    assert.notDeepEqual(compareReading(reading, swapped, tolerances), []);
    const relabelled = withFields({candidates: [{bpm: 120, relation: 'top'}, {bpm: 60, relation: 'other'}]});
    assert.match(compareReading(reading, relabelled, tolerances)[0], /candidates\[1\]\.relation/);
    const shorter = withFields({candidates: [{bpm: 120, relation: 'top'}]});
    assert.match(compareReading(reading, shorter, tolerances)[0], /candidates/);
  });

  it('holds the audio span and engine exact', () => {
    assert.match(compareReading(reading, withFields({audio: {from: 0, to: 8.000_000_1, contextTime: null}}), tolerances)[0], /audio\.to/);
    assert.match(compareReading(reading, withFields({audio: {from: 0, to: 8, contextTime: 0}}), tolerances)[0], /audio\.contextTime/);
    assert.match(compareReading(reading, withFields({engine: 'peaks'}), tolerances)[0], /engine/);
  });

  it('holds null apart from a reading, both ways', () => {
    assert.match(compareReading(null, reading, tolerances)[0], /null/);
    assert.match(compareReading(reading, null, tolerances)[0], /null/);
    assert.deepEqual(compareReading(null, null, tolerances), []);
  });

  it('fails a field the vectors do not know, so a new field cannot ship without new vectors', () => {
    assert.match(compareReading(reading, withFields({beats: []}), tolerances)[0], /beats/);
  });

  it('fails NaN against any number', () => {
    assert.match(compareReading(reading, withFields({bpmExact: Number.NaN}), tolerances)[0], /bpmExact/);
  });

  it('passes a float exactly at its tolerance, which is inclusive', () => {
    assert.deepEqual(compareReading(withFields({bpmExact: 1}), withFields({bpmExact: 1 + 2 ** -10}), {...tolerances, bpmExact: 2 ** -10}), []);
  });

  it('fails a missing field, and an unknown field in audio or a candidate', () => {
    const missing = structuredClone(reading);
    delete missing.engine;
    assert.match(compareReading(reading, missing, tolerances)[0], /reading: keys/);
    assert.match(compareReading(reading, withFields({audio: {from: 0, to: 8, contextTime: null, channel: 0}}), tolerances)[0], /audio: keys/);
    const extra = withFields({candidates: [{bpm: 120, relation: 'top', score: 1}, {bpm: 60, relation: 'half'}]});
    assert.match(compareReading(reading, extra, tolerances)[0], /candidates\[0\]: keys/);
  });

  it('fails undefined or a non-object instead of throwing', () => {
    assert.match(compareReading(reading, undefined, tolerances)[0], /reading: undefined/);
    assert.match(compareReading(null, 120, tolerances)[0], /reading: 120/);
  });
});

describe('compareError', () => {
  it('passes the same error name', () => {
    assert.deepEqual(compareError('RangeError', new RangeError('x')), []);
  });

  it('fails another error name, or no error', () => {
    assert.match(compareError('RangeError', new TypeError('x'))[0], /TypeError/);
    assert.match(compareError('RangeError', undefined)[0], /no error/);
  });
});

describe('decodePcm16', () => {
  it('reads signed 16-bit little-endian samples and divides by 32768', () => {
    const bytes = new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0x00, 0x00, 0x01, 0x00, 0xff, 0xff]);
    assert.deepEqual([...decodePcm16(bytes)], [-1, 32_767 / 32_768, 0, 1 / 32_768, -1 / 32_768]);
  });

  it('refuses an odd byte count', () => {
    assert.throws(() => decodePcm16(new Uint8Array(3)), /odd/);
  });
});

describe('applyNonFinite', () => {
  it('overwrites the samples nonFinite names, and nothing else', () => {
    const samples = applyNonFinite(new Float32Array(4), {id: 'a', nonFinite: [
      {index: 0, value: 'NaN'}, {index: 1, value: 'Infinity'}, {index: 3, value: '-Infinity'},
    ]});
    assert.deepEqual([...samples], [Number.NaN, Number.POSITIVE_INFINITY, 0, Number.NEGATIVE_INFINITY]);
    assert.deepEqual([...applyNonFinite(new Float32Array(2), {id: 'b'})], [0, 0]);
  });

  it('refuses an index outside the input, and a value other than NaN or an infinity', () => {
    assert.throws(() => applyNonFinite(new Float32Array(2), {id: 'a', nonFinite: [{index: 2, value: 'NaN'}]}), /a: nonFinite/);
    assert.throws(() => applyNonFinite(new Float32Array(2), {id: 'a', nonFinite: [{index: 0, value: '1e400'}]}), /a: nonFinite/);
  });
});

describe('runVectors', () => {
  const vectors = {
    schemaVersion: 2,
    tolerances: {bpmExact: {absolute: 1e-6}, confidence: {absolute: 1e-6}},
    inputs: [{id: 'a', file: 'inputs/a.s16le.gz', samples: 1}],
    cases: [
      {id: 'a/right', input: 'a', sampleRate: 8000, options: {}, expected: reading},
      {id: 'a/wrong', input: 'a', sampleRate: 8000, options: {}, expected: null},
    ],
    errorCases: [{id: 'error/a', input: 'a', sampleRate: 0, options: {}, expectedError: 'RangeError'}],
  };

  it('counts each case, reports each failure by id, and the largest float difference', async () => {
    const lines = [];
    const result = await runVectors({
      vectors,
      loadSamples: async () => new Float32Array(1),
      analyze: async (_samples, sampleRate) => {
        if (sampleRate === 0) {
          throw new RangeError('rate');
        }

        return withFields({bpmExact: 120.02 + 5e-7});
      },
      log: line => lines.push(line),
    });
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 1);
    assert.ok(Math.abs(result.deviation.bpmExact - 5e-7) < 1e-12);
    assert.deepEqual(lines, ['FAIL a/wrong: reading: a reading, expected null']);
    assert.match(summary('Test', result), /^conformance: FAIL on Test: 2 passed, 1 failed/);
  });

  it('fails a case whose call throws, and never reports PASS for zero cases', async () => {
    const lines = [];
    const result = await runVectors({
      vectors: {...vectors, errorCases: []},
      loadSamples: async () => new Float32Array(1),
      analyze: async () => {
        throw new Error('broken');
      },
      log: line => lines.push(line),
    });
    assert.equal(result.failed, 2);
    assert.match(lines[0], /threw Error: broken/);
    assert.match(summary('Test', {passed: 0, failed: 0, deviation: {bpmExact: 0, confidence: 0}}), /FAIL/);
  });

  it('refuses another schema version, and an input that decodes to the wrong length', async () => {
    const params = {loadSamples: async () => new Float32Array(1), analyze: async () => null, log() {}};
    await assert.rejects(runVectors({...params, vectors: {...vectors, schemaVersion: 1}}), /schema version 1/);
    await assert.rejects(runVectors({...params, vectors, loadSamples: async () => new Float32Array(2)}), /2 samples, expected 1/);
  });
});
