// What a 5.4.0 caller must keep in a minor release, checked on the built package.
// Needs `npm run build` first.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {transform} from 'esbuild';
import ts from 'typescript';

const dist = new URL('../../dist/', import.meta.url);

describe('5.4.0 compatibility', () => {
  it('still compiles what a 5.4.0 TypeScript caller could write', () => {
    const fixture = fileURLToPath(new URL('../fixtures/caller-5-4.ts', import.meta.url));
    const program = ts.createProgram([fixture], {
      noEmit: true,
      strict: true,
      noImplicitOverride: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.dom.d.ts', 'lib.es2022.d.ts'],
      types: [],
    });
    const errors = ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

    assert.deepEqual(errors, []);
  });

  for (const file of ['index.esm.js', 'index.js', 'realtime-bpm-processor.js']) {
    it(`ships ${file} at 5.4.0's syntax level, ES2020`, async () => {
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
