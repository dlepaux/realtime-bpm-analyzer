// Who ends the analysis worker, on each path. On Node 22.0.0, a terminate() that lands while the
// worker is exiting by itself can deadlock the worker's teardown: terminate never settles, the
// live thread holds the host's event loop, and analyzeFile never returns (RBA-241: the CLI hung
// about once in 150 runs, and CI's Node 22 job for 72 minutes). So the two endings must never
// overlap: the host ends a worker that answered, and waits for one that ended by itself.
// Needs `npm run build` at the repo root first.
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import workerThreads from 'node:worker_threads';
import {copyFile, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// node --test has no timeout of its own: a hang fails under its test's name, instead of holding CI
// for hours (RBA-241). Each top-level suite passes it to its tests, and each hook takes it.
const hangLimit = {timeout: 60_000};

const fixture = name => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const packageDir = fileURLToPath(new URL('..', import.meta.url));

// Long enough for a worker that exits by itself to have done so, many times over: the race in
// production is a window of milliseconds, and this makes the overlap certain instead of rare
const exitGraceMs = 1000;

/** What one worker did, in the order the host saw it */
const lives = [];
const RealWorker = workerThreads.Worker;

/**
 * The real Worker, recording whether it exited before the host asked it to, and holding the
 * host's terminate() back long enough that a worker which exits by itself is caught doing so.
 */
class RecordingWorker extends RealWorker {
  constructor(...args) {
    super(...args);
    const life = {terminateCalled: false, exitedOnItsOwn: false, exitCode: undefined};
    this.life = life;
    lives.push(life);
    this.once('exit', code => {
      life.exitCode = code;
      life.exitedOnItsOwn = !life.terminateCalled;
    });
  }

  async terminate() {
    if (this.life.exitCode === undefined) {
      await Promise.race([once(this, 'exit'), new Promise(resolve => {
        setTimeout(resolve, exitGraceMs);
      })]);
    }

    this.life.terminateCalled = true;
    return super.terminate();
  }
}

describe('the analysis worker\'s lifetime', hangLimit, () => {
  let analyzeFile;

  before(async () => {
    // node:worker_threads' named export follows the module object once synced, so the bundle's
    // `import {Worker}` builds a RecordingWorker
    workerThreads.Worker = RecordingWorker;
    syncBuiltinESMExports();
    ({analyzeFile} = await import('realtime-bpm-analyzer-cli'));
  }, hangLimit);

  after(() => {
    workerThreads.Worker = RealWorker;
    syncBuiltinESMExports();
  }, hangLimit);

  it('stays alive after it answers, until the host ends it', async () => {
    lives.length = 0;
    const result = await analyzeFile(fixture('click-128.mp3'));
    assert.equal(result.ok, true, result.error);
    assert.equal(lives.length, 1);
    const [life] = lives;
    assert.equal(life.exitedOnItsOwn, false, 'the worker exited by itself, so a terminate could overlap its exit');
    assert.equal(life.terminateCalled, true);
    // 1 is the code of a terminated worker
    assert.equal(life.exitCode, 1);
  });

  it('is waited for, not terminated, when it ends by itself', async () => {
    // A worker that fails to load ends on its own: the copy of api.mjs has no analyze-worker.mjs next to it
    const lone = await mkdtemp(join(packageDir, 'dist', 'bundled-'));
    try {
      await copyFile(join(packageDir, 'dist', 'api.mjs'), join(lone, 'api.mjs'));
      const {analyzeFile: analyzeAlone} = await import(pathToFileURL(join(lone, 'api.mjs')).href);
      lives.length = 0;
      const result = await analyzeAlone(fixture('click-128.mp3'));
      assert.equal(result.ok, false);
      assert.match(result.error, /Cannot find module .*analyze-worker\.mjs/);
      assert.equal(lives.length, 1);
      const [life] = lives;
      assert.equal(life.terminateCalled, false, 'the host terminated a worker that was already ending');
      assert.notEqual(life.exitCode, undefined, 'analyzeFile returned before the worker had exited');
    } finally {
      await rm(lone, {recursive: true, force: true});
    }
  });

  it('is ended by the host when an abort stops the analysis', async () => {
    lives.length = 0;
    const controller = new AbortController();
    const analysis = analyzeFile(fixture('click-128.mp3'), {signal: controller.signal});
    // Aborted once the worker runs, so the abort lands on a live worker and not on the decode
    while (lives.length === 0) {
      await new Promise(resolve => {
        setImmediate(resolve);
      });
    }

    controller.abort();
    assert.deepEqual(await analysis, {file: fixture('click-128.mp3'), ok: false, error: 'Cancelled.'});
    const [life] = lives;
    assert.equal(life.terminateCalled, true);
    assert.notEqual(life.exitCode, undefined, 'analyzeFile returned before the worker had exited');
  });
});
