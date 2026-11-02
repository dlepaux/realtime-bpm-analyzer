// The package's programmatic entry, imported by name the way the MCP server imports it.
// Needs `npm run build` at the repo root first (dist/api.mjs and dist/types/api.d.ts).
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
import {analyzeFile, audioExtensions, resolveTempoRange} from 'realtime-bpm-analyzer-cli';
// Built for the tests and not published
import {decodeFile} from '../dist/decode.mjs';

const fixture = name => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const packageDir = fileURLToPath(new URL('..', import.meta.url));

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

  it('runs the detector it is asked for, not peaks', async () => {
    // 5.4.0 ignored an unknown option, so --detector tempogram silently ran peaks. The answer
    // must be the library's tempogram on the same samples, and must differ from its peaks.
    const path = fixture('click-128.mp3');
    const decode = async () => decodeFile(path, {ffmpegPath: '/nonexistent/ffmpeg', maxDecodedBytes: 2 ** 31});
    for (const detector of ['tempogram', 'peaks']) {
      const {channelData, sampleRate} = await decode();
      const result = await analyzeFile(path, {detector});
      assert.deepEqual(result.candidates, await analyzeChannelData(channelData, sampleRate, {detector}), detector);
    }

    const {channelData, sampleRate} = await decode();
    assert.notDeepEqual(
      await analyzeChannelData(channelData, sampleRate, {detector: 'tempogram'}),
      await analyzeChannelData(channelData, sampleRate, {detector: 'peaks'}),
    );
  });

  it('asks for a library that has the tempogram', async () => {
    // npm resolves the lowest version a range allows when that one is installed already
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const range = manifest.dependencies['realtime-bpm-analyzer'];
    const [, major, minor] = /^\^(\d+)\.(\d+)\.\d+$/.exec(range) ?? [];
    assert.ok(Number(major) === 5 && Number(minor) >= 6, `range ${range} admits a library without the detector option`);
    // The detector option is read, not ignored: 5.4.0 accepted any name
    await assert.rejects(analyzeChannelData(new Float32Array(1), 44_100, {detector: 'magic'}), /detector/);
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

  it('analyses from a host run with --input-type, which the worker must not inherit', () => {
    // The package imports itself by name from its own folder, the way a consumer imports it
    const code = `import('realtime-bpm-analyzer-cli')
      .then(({analyzeFile}) => analyzeFile(${JSON.stringify(fixture('click-128.mp3'))}))
      .then(result => console.log(JSON.stringify(result)))`;
    // With a per-process flag too, which Node refuses in a worker's explicit execArgv
    for (const flags of [['--input-type=module'], ['--input-type=commonjs', '--v8-pool-size=2']]) {
      const run = spawnSync(process.execPath, [...flags, '-e', code], {cwd: packageDir, encoding: 'utf8', timeout: 30_000});
      assert.equal(run.status, 0, run.stderr);
      const result = JSON.parse(run.stdout);
      assert.equal(result.ok, true, `${flags.join(' ')}: ${result.error}`);
      assert.ok(Math.abs(result.bpm - 128) <= 1, `got ${result.bpm}`);
    }
  });

  it('packs the worker next to the entries that load it', () => {
    // CI imports the package through the workspace link, which has every file, so only the
    // tarball's file list shows that the worker ships
    const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {cwd: packageDir, encoding: 'utf8'}));
    const files = new Set(pack.files.map(file => file.path));
    for (const file of ['dist/api.mjs', 'dist/cli.mjs', 'dist/analyze-worker.mjs', 'dist/types/api.d.ts']) {
      assert.ok(files.has(file), `${file} is missing from the tarball: ${[...files].join(', ')}`);
    }
  });

  it('ships declarations a consumer can resolve without the package sources', async () => {
    // Only api.d.ts is published, so it must not import the other emitted .d.ts files
    const types = await readFile(new URL('../dist/types/api.d.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(types, /from '\.{1,2}\//);
  });
});
