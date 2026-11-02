// What bounds the time of one file: the lowest sample rate analysed, an abort, and a timeout.
// On generated WAV files, so the cost is known. Needs `npm run build` at the repo root first.
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analyzeFile} from 'realtime-bpm-analyzer-cli';
// Built for the tests and not published
import {decodeFile} from '../dist/decode.mjs';
import {clickWav} from './click-wav.mjs';

const tooLowRate = /^Sample rate too low to analyze: \d+ Hz, the lowest is 8000 Hz\.$/;

describe('bounds on the work one file costs', () => {
  let root;
  let long;
  let decodeMs;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'rba-cli-long-'));
    // About 20 minutes at 8 kHz: its tempogram takes seconds, ten times its decode
    long = join(root, 'long-8k.wav');
    await writeFile(long, clickWav(8000, 10_000_000));
    // The slower of two decodes, so a cold first one does not set the abort too early
    for (let run = 0; run < 2; run += 1) {
      const started = performance.now();
      await decodeFile(long, {ffmpegPath: '/nonexistent/ffmpeg', maxDecodedBytes: 2 ** 31});
      decodeMs = Math.max(decodeMs ?? 0, performance.now() - started);
    }
  });

  after(async () => {
    await rm(root, {recursive: true, force: true});
  });

  describe('sample rate', () => {
    for (const rate of [1, 100, 7999]) {
      it(`refuses ${rate} Hz before decoding the file`, async () => {
        // 1 Hz never ended before (the peaks detector stalled), 100 Hz cost a minute per 10 MB
        const path = join(root, `rate-${rate}.wav`);
        await writeFile(path, clickWav(rate, 10_000_000));
        const started = performance.now();
        const result = await analyzeFile(path);
        assert.equal(result.ok, false);
        assert.match(result.error, tooLowRate);
        assert.ok(performance.now() - started < 1000, 'decoded the file before refusing it');
      });
    }

    it('analyses 8 kHz, the lowest rate it reads', async () => {
      const path = join(root, 'rate-8000.wav');
      await writeFile(path, clickWav(8000, 8000 * 30));
      const result = await analyzeFile(path);
      assert.equal(result.ok, true, result.error);
      assert.ok(Math.abs(result.bpm - 128) <= 1, `got ${result.bpm}`);
    });
  });

  it('stops the analysis when the signal aborts, not when it ends', async () => {
    // Aborted well after a decode ends, so the abort lands in the analysis, which takes ten times longer
    const abortAfterMs = Math.round((2 * decodeMs) + 300);
    const started = performance.now();
    const result = await analyzeFile(long, {detector: 'tempogram', signal: AbortSignal.timeout(abortAfterMs)});
    const elapsed = performance.now() - started;
    assert.deepEqual(result, {file: long, ok: false, error: 'Cancelled.'});
    assert.ok(elapsed < abortAfterMs + 500, `took ${Math.round(elapsed)} ms to stop, aborted at ${Math.round(abortAfterMs)} ms`);
  });

  it('gives up after timeoutMs with a plain error', async () => {
    const timeoutMs = Math.round((2 * decodeMs) + 300);
    const started = performance.now();
    const result = await analyzeFile(long, {detector: 'tempogram', timeoutMs});
    const elapsed = performance.now() - started;
    assert.equal(result.ok, false);
    assert.match(result.error, /^Took longer than the [\d.]+ seconds? limit for one file\.$/);
    assert.ok(elapsed < timeoutMs + 500, `took ${Math.round(elapsed)} ms to stop, timeout ${Math.round(timeoutMs)} ms`);
  });

  for (const timeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
    it(`refuses timeoutMs ${timeoutMs} instead of throwing`, async () => {
      const result = await analyzeFile(long, {timeoutMs});
      assert.equal(result.ok, false);
      assert.match(result.error, /^Invalid timeoutMs: /);
    });
  }

  it('finishes a file within its timeout', async () => {
    const path = join(root, 'short.wav');
    await writeFile(path, clickWav(44_100, 44_100 * 20));
    const result = await analyzeFile(path, {timeoutMs: 60_000, signal: new AbortController().signal});
    assert.equal(result.ok, true, result.error);
    assert.ok(Math.abs(result.bpm - 128) <= 1, `got ${result.bpm}`);
  });
});
