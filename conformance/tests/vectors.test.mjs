// The committed set holds together as ../readme.md describes it: every case names an input that exists, every input
// file decodes to the length and digest vectors.json records, and the files stay under their size budget. These
// read only the committed files: `npm run conformance:check` is what proves them equal to a fresh generation.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {signals, toPcm16} from '../generator/signals.mjs';

const root = new URL('../', import.meta.url);
const vectors = JSON.parse(readFileSync(new URL('vectors.json', root), 'utf8'));

/** The budget the readme states for the committed inputs, in bytes */
const sizeBudget = 5 * 1024 * 1024;

describe('vectors.json', () => {
  it('has schema version 1 and the documented top-level keys', () => {
    assert.equal(vectors.schemaVersion, 1);
    assert.deepEqual(Object.keys(vectors).sort(), ['cases', 'errorCases', 'inputs', 'pcm', 'schemaVersion', 'tolerances']);
  });

  it('gives each case and input a unique id', () => {
    const ids = [...vectors.inputs, ...vectors.cases, ...vectors.errorCases].map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('points every case at an input it lists', () => {
    const inputs = new Set(vectors.inputs.map(input => input.id));
    for (const testCase of [...vectors.cases, ...vectors.errorCases]) {
      assert.ok(inputs.has(testCase.input), `${testCase.id}: no input ${testCase.input}`);
    }
  });

  it('covers both engines, the default range, an explicit 90 to 180 and a custom range', () => {
    const engineOf = options => (typeof options.engine === 'string' ? options.engine : options.engine?.name) ?? 'tempogram';
    const engines = new Set(vectors.cases.map(testCase => engineOf(testCase.options)));
    assert.deepEqual([...engines].sort(), ['peaks', 'tempogram']);
    const ranges = vectors.cases.map(testCase => testCase.options.tempoRange);
    assert.ok(ranges.some(range => range === undefined));
    assert.ok(ranges.some(range => range?.min === 90 && range.max === 180));
    assert.ok(ranges.some(range => range !== undefined && !(range.min === 90 && range.max === 180)));
  });

  it('holds readings, nulls, numeric confidences and null confidences, so each branch is pinned', () => {
    const expected = vectors.cases.map(testCase => testCase.expected);
    assert.ok(expected.some(reading => reading === null));
    assert.ok(expected.some(reading => typeof reading?.confidence === 'number'));
    assert.ok(expected.some(reading => reading !== null && reading.confidence === null));
  });

  it('states a tolerance for each float field, wider than the reference spread it was checked against', () => {
    for (const field of ['bpmExact', 'confidence']) {
      const {absolute, referenceSpread} = vectors.tolerances[field];
      assert.ok(absolute > 0 && referenceSpread >= 0, field);
      assert.ok(referenceSpread * 10 <= absolute, `${field}: spread ${referenceSpread} is within 10x of ${absolute}`);
    }
  });
});

describe('the input files', () => {
  it('decode to the sample count and digest vectors.json records', () => {
    for (const input of vectors.inputs) {
      const pcm = gunzipSync(readFileSync(new URL(input.file, root)));
      assert.equal(pcm.length, input.samples * 2, input.id);
      assert.equal(createHash('sha256').update(pcm).digest('hex'), input.sha256, input.id);
    }
  });

  it('stay under the size budget', () => {
    const total = vectors.inputs.reduce((sum, input) => sum + statSync(new URL(input.file, root)).size, 0);
    assert.ok(total <= sizeBudget, `${total} bytes`);
  });
});

describe('the signals', () => {
  it('build the same PCM twice, so a regeneration is reproducible', () => {
    for (const signal of signals.slice(0, 3)) {
      assert.deepEqual(toPcm16(signal.build()), toPcm16(signal.build()), signal.id);
    }
  });

  it('quantise to 16 bits with clipping at full scale', () => {
    assert.deepEqual([...toPcm16(Float64Array.of(-2, -1, 0, 0.5, 1, 2))], [-32_768, -32_768, 0, 16_384, 32_767, 32_767]);
  });
});
