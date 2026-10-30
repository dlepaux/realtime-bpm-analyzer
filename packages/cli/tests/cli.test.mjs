// Runs the built bin (dist/cli.mjs) as a child process, the way `npx realtime-bpm-analyzer-cli`
// runs it. Needs `npm run build` at the repo root first: it builds the library this package
// imports through the workspace, then the CLI.
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {execFile, spawnSync} from 'node:child_process';
import {chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeChannelData} from 'realtime-bpm-analyzer/node';
// The library's own fixtures, so the pinned bass-test values have a single source
import {bassTestExpected} from '../../realtime-bpm-analyzer/tests/fixtures/bass-test-expected.ts';
import {createClickTrack} from '../../realtime-bpm-analyzer/tests/fixtures/click-track.ts';

const cli = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url));
const fixture = name => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const bassTest = fileURLToPath(new URL('../../realtime-bpm-analyzer/tests/fixtures/bass-test.wav', import.meta.url));
const clickMp3 = fixture('click-128.mp3');
const clickFlac = fixture('click-100.flac');

/**
 * Runs the CLI and never rejects, so tests can assert on failing exit codes.
 * @param {string[]} args Command-line arguments
 * @param {Record<string, string>} [env] Extra environment variables
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function run(args, env = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], {env: {...process.env, ...env}}, (error, stdout, stderr) => {
      resolve({code: error ? error.code : 0, stdout, stderr});
    });
  });
}

/**
 * @param {string[]} args Arguments, --json is added
 * @param {Record<string, string>} [env] Extra environment variables
 * @returns {Promise<{code: number, results: object[]}>}
 */
async function runJson(args, env) {
  const {code, stdout} = await run(['--json', ...args], env);
  return {code, results: JSON.parse(stdout).results};
}

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
// root reads any file whatever its mode, so the unreadable-file test needs a regular user
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe('realtime-bpm-analyzer CLI', () => {
  it('prints help and the package version', async () => {
    const help = await run(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /^Usage: realtime-bpm-analyzer/);

    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const version = await run(['--version']);
    assert.equal(version.code, 0);
    assert.equal(version.stdout.trim(), manifest.version);
  });

  it('names every bin after one file, so npx realtime-bpm-analyzer-cli can pick one', async () => {
    // npx runs the bin named after the package, or, when none is, the only file every bin
    // points to (bins as aliases). This package has no bin named after it.
    const {bin} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(bin).sort(), ['rba', 'realtime-bpm-analyzer']);
    assert.deepEqual(new Set(Object.values(bin)), new Set(['dist/cli.mjs']));
  });

  for (const [label, args, pattern] of [
    ['no path', [], /Missing a file or folder/],
    ['an unknown option', ['--bogus', bassTest], /Unknown option '--bogus'/],
    ['a range narrower than an octave', ['--min-bpm', '100', '--max-bpm', '150', bassTest], /at least twice min/],
    ['a non-numeric tempo', ['--min-bpm', 'fast', bassTest], /positive finite/],
  ]) {
    it(`exits 2 on ${label}`, async () => {
      const {code, stdout, stderr} = await run(args);
      assert.equal(code, 2);
      assert.equal(stdout, '');
      assert.match(stderr, pattern);
    });
  }

  it('keeps the decoders out of the library\'s browser bundles and /node entry', async () => {
    // Resolved like any consumer resolves it: the workspace link to the in-repo library
    const library = new URL('./', import.meta.resolve('realtime-bpm-analyzer/package.json'));
    for (const bundle of ['index.esm.js', 'index.js', 'node.mjs', 'node.cjs', 'realtime-bpm-processor.js']) {
      const code = await readFile(new URL(`dist/${bundle}`, library), 'utf8');
      assert.doesNotMatch(code, /@audio\/decode|child_process/, bundle);
    }
  });

  it('fills a missing --min-bpm or --max-bpm with the library\'s default range', async () => {
    // The CLI copies the defaults (90, 180): the library rejects a range built from wrong ones
    assert.match((await run(['--max-bpm', '179', bassTest])).stderr, /max \(179\) must be at least twice min \(90\)/);
    assert.match((await run(['--min-bpm', '91', bassTest])).stderr, /max \(180\) must be at least twice min \(91\)/);

    // ...and they are the library's own: tempos on both edges fold the same way with and without them
    for (const bpm of [89, 90, 180, 181]) {
      const channelData = createClickTrack(bpm, 22_050, 20);
      assert.deepEqual(
        await analyzeChannelData(channelData, 22_050, {tempoRange: {min: 90, max: 180}}),
        await analyzeChannelData(channelData, 22_050),
        `${bpm} BPM`,
      );
    }
  });

  it('runs the detector named by --detector, with its own default range', async () => {
    const {results: [peaks]} = await runJson([fixture('click-140.ogg')]);
    const {results: [tempogram]} = await runJson(['--detector', 'tempogram', fixture('click-140.ogg')]);

    assert.ok(Math.abs(tempogram.bpm - 140) <= 2, `got ${tempogram.bpm}`);
    assert.notDeepEqual(tempogram.candidates, peaks.candidates);
    // The tempogram's range is 50..240: a lone --min-bpm is measured against 240, not 180
    assert.equal((await run(['--detector', 'tempogram', '--min-bpm', '100', bassTest])).code, 0);
    assert.match((await run(['--detector', 'tempogram', '--min-bpm', '121', bassTest])).stderr, /max \(240\) must be at least twice min \(121\)/);
  });

  it('refuses an unknown detector', async () => {
    const {code, stderr} = await run(['--detector', 'magic', bassTest]);

    assert.equal(code, 2);
    assert.match(stderr, /Invalid detector: magic/);
  });

  it('prints the BPM, confidence and candidates as text by default', async () => {
    const {code, stdout} = await run([clickMp3]);
    assert.equal(code, 0);
    assert.match(stdout, /click-128\.mp3: 128 BPM \(confidence 0\.\d\d\)\n {2}candidates: 128 \(count \d+, confidence 0\.\d\d\), /);
  });

  it('finds the bass-test fixture tempo the browser finds', async () => {
    const {code, results: [result]} = await runJson([bassTest]);
    assert.equal(code, 0);
    assert.equal(result.bpm, bassTestExpected.tempo);
    assert.equal(result.candidates[0].count, bassTestExpected.count);
  });

  for (const [name, bpm] of [['bass-test.wav', bassTestExpected.tempo], ['click-128.mp3', 128], ['click-100.flac', 100], ['click-140.ogg', 140], ['click-140.opus', 140]]) {
    it(`decodes ${name} with the bundled decoder`, async () => {
      // An unusable FFMPEG_PATH proves no ffmpeg was involved
      const {code, results: [result]} = await runJson([name === 'bass-test.wav' ? bassTest : fixture(name)], {FFMPEG_PATH: '/nonexistent/ffmpeg'});
      assert.equal(code, 0);
      assert.equal(result.bpm, bpm);
    });
  }

  it('prints a stable JSON shape', async () => {
    const {results: [result]} = await runJson([clickFlac]);
    assert.deepEqual(Object.keys(result), ['file', 'ok', 'bpm', 'confidence', 'candidates']);
    assert.equal(result.file, clickFlac);
    assert.equal(result.ok, true);
    assert.equal(result.confidence, result.candidates[0].confidence);
    assert.ok(result.candidates.length > 0 && result.candidates.length <= 5);

    for (const candidate of result.candidates) {
      assert.deepEqual(Object.keys(candidate), ['tempo', 'count', 'confidence']);
    }

    const counts = result.candidates.map(candidate => candidate.count);
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  });

  it('folds tempos into --min-bpm/--max-bpm', async () => {
    const {results: [result]} = await runJson(['--min-bpm', '50', '--max-bpm', '100', fixture('click-140.ogg')]);
    assert.equal(result.bpm, 70);
  });

  it('hands M4A to ffmpeg, and says so when ffmpeg is missing', async () => {
    const {code, results: [result]} = await runJson([fixture('click-128.m4a')], {FFMPEG_PATH: '/nonexistent/ffmpeg'});
    assert.equal(code, 1);
    assert.equal(result.ok, false);
    assert.match(result.error, /ffmpeg was not found/);
  });

  it('decodes M4A through ffmpeg when it is installed', {skip: hasFfmpeg ? false : 'ffmpeg not installed'}, async () => {
    const {code, results: [result]} = await runJson([fixture('click-128.m4a')]);
    assert.equal(code, 0);
    assert.equal(result.bpm, 128);
  });

  describe('format detection and ffmpeg', () => {
    let root;
    // An ID3v2.4 tag of 256 padding bytes, as taggers put in front of FLAC or ADTS AAC too
    const id3Tag = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 2, 0]), Buffer.alloc(256)]);

    /**
     * Writes an executable stand-in for ffmpeg that records its arguments.
     * @param {string} name File name
     * @param {string} body Script body; `args` holds the arguments
     * @returns {Promise<string>} Its path
     */
    async function fakeFfmpeg(name, body) {
      const path = join(root, name);
      await writeFile(path, `#!/usr/bin/env node\nconst args = process.argv.slice(2);\n${body}\n`);
      await chmod(path, 0o755);
      return path;
    }

    before(async () => {
      root = await mkdtemp(join(tmpdir(), 'rba-cli-fmt-'));
    });

    after(async () => {
      await rm(root, {recursive: true, force: true});
    });

    it('looks behind an ID3 tag before picking a decoder', async () => {
      const flac = join(root, 'tagged.flac');
      await writeFile(flac, Buffer.concat([id3Tag, await readFile(clickFlac)]));
      // ADTS AAC (sync word, layer bits 00) behind the tag must not reach the MP3 decoder
      const aac = join(root, 'tagged.aac');
      await writeFile(aac, Buffer.concat([id3Tag, Buffer.from([0xFF, 0xF1, 0x50, 0x80]), Buffer.alloc(512)]));

      const {results} = await runJson([flac, aac], {FFMPEG_PATH: '/nonexistent/ffmpeg'});
      assert.equal(results[0].bpm, 100);
      assert.equal(results[1].ok, false);
      assert.match(results[1].error, /bundled decoders do not read this format.*ffmpeg was not found/);
    });

    it('reads float PCM from ffmpeg and passes the file with a file: prefix', async () => {
      const argsLog = join(root, 'args.json');
      // 20 s of 60 Hz clicks at 120 BPM and 44.1 kHz, the rate the CLI asks ffmpeg for
      const ffmpeg = await fakeFfmpeg('ffmpeg-ok.mjs', `
        import {writeFileSync} from 'node:fs';
        writeFileSync(${JSON.stringify(argsLog)}, JSON.stringify(args));
        const rate = 44100, pcm = Buffer.alloc(rate * 20 * 4);
        for (let i = 0; i < rate * 20; i += 1) {
          const t = (i % (rate / 2)) / rate;
          pcm.writeFloatLE(t < 0.08 ? 0.9 * Math.exp(-t * 40) * Math.sin(2 * Math.PI * 60 * t) : 0, i * 4);
        }
        process.stdout.write(pcm);`);

      const {code, results: [result]} = await runJson([fixture('click-128.m4a')], {FFMPEG_PATH: ffmpeg});
      assert.equal(code, 0);
      assert.equal(result.bpm, 120);
      const args = JSON.parse(await readFile(argsLog, 'utf8'));
      assert.equal(args[args.indexOf('-i') + 1], `file:${fixture('click-128.m4a')}`);
      assert.deepEqual(args.slice(-5), ['-f', 'f32le', '-ar', '44100', 'pipe:1']);
    });

    it('reports the last line ffmpeg printed when it fails', async () => {
      const ffmpeg = await fakeFfmpeg('ffmpeg-fail.mjs', `
        process.stderr.write('banner\\nInvalid data found when processing input\\n');
        process.exitCode = 1;`);

      const {code, results: [result]} = await runJson([fixture('click-128.m4a')], {FFMPEG_PATH: ffmpeg});
      assert.equal(code, 1);
      assert.equal(result.error, 'ffmpeg could not decode the file: Invalid data found when processing input');
    });
  });

  describe('folder mode', () => {
    let root;

    before(async () => {
      root = await mkdtemp(join(tmpdir(), 'rba-cli-'));
      await mkdir(join(root, 'sub', 'deeper'), {recursive: true});
      await mkdir(join(root, 'empty'));
      await copyFile(clickMp3, join(root, 'b-click.mp3'));
      await copyFile(clickFlac, join(root, 'sub', 'a-click.flac'));
      await copyFile(fixture('click-140.opus'), join(root, 'sub', 'deeper', 'c-click.opus'));
      await writeFile(join(root, 'notes.txt'), 'not audio');
      // An ID3 header with no MPEG frames behind it: the MP3 decoder yields no samples
      await writeFile(join(root, 'a-broken.mp3'), Buffer.concat([Buffer.from('ID3\x04\0\0\0\0\0\0'), Buffer.alloc(2048, 7)]));
    });

    after(async () => {
      await rm(root, {recursive: true, force: true});
    });

    it('analyses the folder\'s own files in order, reports a broken one and exits 1', async () => {
      const {code, results} = await runJson([root]);
      assert.equal(code, 1);
      assert.deepEqual(results.map(result => result.file), [join(root, 'a-broken.mp3'), join(root, 'b-click.mp3')]);
      assert.equal(results[0].ok, false);
      assert.match(results[0].error, /No audio samples decoded/);
      assert.equal(results[1].bpm, 128);
    });

    it('walks sub-folders with --recursive', async () => {
      const {results} = await runJson(['--recursive', root]);
      assert.deepEqual(results.map(result => result.file), [
        join(root, 'a-broken.mp3'),
        join(root, 'b-click.mp3'),
        join(root, 'sub', 'a-click.flac'),
        join(root, 'sub', 'deeper', 'c-click.opus'),
      ]);
      assert.deepEqual(results.slice(2).map(result => result.bpm), [100, 140]);
    });

    it('exits 0 when every file is analysed', async () => {
      const {code, stdout, stderr} = await run([join(root, 'sub')]);
      assert.equal(code, 0);
      assert.match(stdout, /a-click\.flac: 100 BPM/);
      assert.equal(stderr, '');
    });

    it('fails a folder with no audio files', async () => {
      const {code, results} = await runJson([join(root, 'empty')]);
      assert.equal(code, 1);
      assert.deepEqual(results, [{file: join(root, 'empty'), ok: false, error: 'No audio files found.'}]);
    });

    it('reports an unreadable file and keeps going', {skip: isRoot ? 'root reads any file' : false}, async () => {
      const locked = join(root, 'locked.wav');
      await copyFile(bassTest, locked);
      await chmod(locked, 0o000);

      try {
        const {code, stderr, stdout} = await run([locked, clickMp3]);
        assert.equal(code, 1);
        assert.match(stderr, /locked\.wav: error: EACCES/);
        assert.match(stdout, /click-128\.mp3: 128 BPM/);
      } finally {
        await rm(locked, {force: true});
      }
    });

    it('reports a missing path without stopping the batch', async () => {
      const {code, results} = await runJson([join(root, 'missing.mp3'), clickMp3]);
      assert.equal(code, 1);
      assert.equal(results[0].ok, false);
      assert.match(results[0].error, /ENOENT/);
      assert.equal(results[1].bpm, 128);
    });
  });
});
