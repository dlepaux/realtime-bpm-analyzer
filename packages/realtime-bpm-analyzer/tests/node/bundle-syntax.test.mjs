// The shipped bundles stay at ES2020 syntax, the level 5.x shipped: the build targets it (build.ts), and this
// checks that it holds. Needs `npm run build` first.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

const dist = new URL('../../dist/', import.meta.url);

describe('shipped syntax', () => {
  for (const file of ['index.esm.js', 'index.js', 'realtime-bpm-processor.js']) {
    it(`ships ${file} at ES2020`, async () => {
      const code = await readFile(new URL(file, dist), 'utf8');
      // Lowering to ES2020 changes nothing exactly when nothing newer is in the file
      const [asIs, lowered] = await Promise.all([
        transform(code, {target: 'esnext', loader: 'js'}),
        transform(code, {target: 'es2020', loader: 'js'}),
      ]);

      assert.equal(lowered.code, asIs.code);
      // The main bundles carry the worklet as a string, which the comparison above cannot see into
      assert.doesNotMatch(code, /\?\?=|\|\|=|&&=/);
    });
  }
});
