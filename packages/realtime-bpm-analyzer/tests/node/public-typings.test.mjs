// The published typings keep the analyzer's construction and its fault path private: the factory is the only way
// in, and nothing a caller can call fails the analyzer. Needs `npm run build` first.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const dist = new URL('../../dist/', import.meta.url);

describe('published typings', () => {
  it('declare BpmAnalyzer with a private constructor and no fault method', async () => {
    const typings = await readFile(new URL('core/bpm-analyzer.d.ts', dist), 'utf8');
    const start = typings.indexOf('export declare class BpmAnalyzer');
    assert.ok(start >= 0, 'BpmAnalyzer is declared');
    const body = typings.slice(start);

    // Without a declared constructor the class would inherit EventTarget's public one, so `private` is the proof
    assert.match(body, /\n\s*private constructor\(\);/);
    assert.doesNotMatch(body, /\n\s*(?:public\s+)?constructor\(/);
    assert.doesNotMatch(body, /\bfault\b/);
  });

  it('export neither the construction path nor the fault path from the entry', async () => {
    const entry = await readFile(new URL('index.d.ts', dist), 'utf8');

    assert.doesNotMatch(entry, /constructAnalyzer|failAnalyzer/);
  });
});
