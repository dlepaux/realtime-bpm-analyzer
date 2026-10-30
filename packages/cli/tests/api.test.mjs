// The package's programmatic entry, imported by name the way the MCP server imports it.
// Needs `npm run build` at the repo root first (dist/api.mjs and dist/types/api.d.ts).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {analyzeFile, audioExtensions, resolveTempoRange} from 'realtime-bpm-analyzer-cli';

const fixture = name => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

describe('realtime-bpm-analyzer-cli programmatic API', () => {
  it('analyses a file into the result the CLI prints', async () => {
    const result = await analyzeFile(fixture('click-128.mp3'));
    assert.equal(result.ok, true);
    assert.equal(result.file, fixture('click-128.mp3'));
    assert.ok(Math.abs(result.bpm - 128) <= 1, `got ${result.bpm}`);
    assert.equal(result.confidence, result.candidates[0].confidence);
  });

  it('folds candidates into the tempo range it is given', async () => {
    const result = await analyzeFile(fixture('click-128.mp3'), {tempoRange: {min: 50, max: 100}});
    assert.ok(Math.abs(result.bpm - 64) <= 1, `got ${result.bpm}`);
  });

  it('returns a failure instead of throwing', async () => {
    const result = await analyzeFile(fixture('readme.md'), {ffmpegPath: '/nonexistent/ffmpeg'});
    assert.equal(result.ok, false);
    assert.match(result.error, /ffmpeg was not found/);
  });

  it('fills a missing bound and rejects an invalid range with the library\'s message', async () => {
    assert.equal(await resolveTempoRange(undefined, undefined), undefined);
    assert.deepEqual(await resolveTempoRange(70, undefined), {min: 70, max: 180});
    assert.deepEqual(await resolveTempoRange(undefined, 200), {min: 90, max: 200});
    await assert.rejects(resolveTempoRange(100, 150), /at least twice min/);
  });

  it('lists the extensions folder mode picks', () => {
    for (const extension of ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a']) {
      assert.ok(audioExtensions.has(extension), extension);
    }
  });

  it('ships declarations a consumer can resolve without the package sources', async () => {
    // Only api.d.ts is published, so it must not import the other emitted .d.ts files
    const types = await readFile(new URL('../dist/types/api.d.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(types, /from '\.{1,2}\//);
  });
});
