// Benchmark CLI, see benchmark/readme.md. Bundled by benchmark/run.sh.
//   run.mjs --split dev --detector peaks --out results/peaks-dev.json
//   run.mjs --split heldout --detector peaks,tempogram --reason "..." --out ...
// --progress keeps each finished result, so a killed held-out look continues instead of being spent
// twice. --heldout-log moves the log out of a tree that is read-only, as in the job's image.
// Held-out access goes through here on purpose: it needs a reason, a committed tree, and writes
// one line to heldout-log.md before reading a single label.
import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {parseArgs} from 'node:util';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {applyLowpass} from '../src/core/lowpass';
import {detectTempo} from '../src/core/detect-tempo';
import {resolveTempoRange} from '../src/core/tempo';
import {detectTempogram} from '../src/core/tempogram';
import {loaders} from './lib/datasets';
import {assertTunable, tuningSets} from './lib/licences';
import {decode, sampleRate, writeAtomic} from './lib/decode';
import {detectors} from './lib/detectors';
import {lookHeader, progressRows, resumesLook} from './lib/look';
import {listen} from './lib/stream';
import {workerCount} from './lib/workers';
import type {TempogramTuning} from '../src/core/tempogram';
import type {Split, Track, TrackResult} from './lib/types';

type Job = {readonly detector: string; readonly track: Track; readonly tuning?: Partial<TempogramTuning>};

async function runJob({detector, track, tuning}: Job): Promise<TrackResult> {
  const config = detectors[detector];
  const raw = decode(track);
  const pcm = config.lowpass ? applyLowpass(raw, sampleRate) : raw;
  const result = await listen(track, pcm, sampleRate, config.options, tuning ?? config.tuning);

  if (!config.offline) {
    return result;
  }

  const offline = config.options.detector === 'tempogram'
    ? detectTempogram(pcm, sampleRate)
    : await detectTempo(pcm, sampleRate, resolveTempoRange()).catch(() => []);

  return {...result, offline: offline[0]?.tempo ?? null};
}

function assertCommittedTree(benchmarkDir: string): string {
  // An image is its commit, and has no tree to ask
  if (process.env.RBA_BENCHMARK_SHA) {
    return process.env.RBA_BENCHMARK_SHA;
  }

  const dirty = execFileSync('git', ['status', '--porcelain', '--', '..'], {cwd: benchmarkDir, encoding: 'utf8'}).trim();

  if (dirty) {
    throw new Error(`Held-out runs need a committed tree, so the log names the code that ran:\n${dirty}`);
  }

  return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: benchmarkDir, encoding: 'utf8'}).trim();
}

function excludedFromHeldout(benchmarkDir: string, set: string): Set<string> {
  const path = join(benchmarkDir, 'splits', `${set}-excluded.json`);

  return new Set(existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as {heldout: string[]}).heldout : []);
}

function selectTracks(benchmarkDir: string, split: Split, sets: string[]): Track[] {
  return sets.flatMap(set => {
    const ids = new Set((JSON.parse(readFileSync(join(benchmarkDir, 'splits', `${set}.json`), 'utf8')) as Record<Split, string[]>)[split]);
    const excluded = split === 'heldout' ? excludedFromHeldout(benchmarkDir, set) : new Set<string>();

    return loaders[set]().filter(track => ids.has(track.id) && !excluded.has(track.id));
  });
}

/** A held-out look is spent once logged, so everything that could abort it is checked first */
function assertArguments(names: string[], sets: string[], out: string | undefined, limit: string | undefined): void {
  const unknown = [...names.filter(name => !(name in detectors)), ...sets.filter(set => !(set in loaders))];

  if (unknown.length > 0) {
    throw new Error(`Unknown detector or set: ${unknown.join(', ')}`);
  }

  if (!out || !existsSync(dirname(out))) {
    throw new Error('--out must be a file in an existing directory, relative to benchmark/');
  }

  if (limit !== undefined && !(Number(limit) > 0)) {
    throw new Error('--limit must be positive');
  }
}

async function runAll(jobs: Job[], onDone: (result: TrackResult, detector: string) => void): Promise<void> {
  let next = 0;
  const workers = Array.from({length: workerCount()}, async () => new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {workerData: true});
    let current: Job;
    const feed = () => {
      if (next >= jobs.length) {
        void worker.terminate().then(() => {
          resolve();
        });
        return;
      }

      current = jobs[next];
      next += 1;
      worker.postMessage(current);
    };

    worker.on('message', (result: TrackResult | {failed: string}) => {
      if ('failed' in result) {
        console.error(`skipped ${current.track.set}/${current.track.id}: ${result.failed}`);
      } else {
        onDone(result, current.detector);
      }

      feed();
    });
    worker.on('error', reject);
    feed();
  }));

  await Promise.all(workers);
}

type Progress = {readonly detector: string; readonly result: TrackResult};

function readProgress(path: string | undefined): string {
  return path && existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/**
 * Logs a look, unless its own progress file says this is that look resuming. The log line comes
 * first: a kill between the two logs the look twice, which overstates, and never scores unlogged.
 */
function logLook(logPath: string, look: string, progress: string | undefined): void {
  if (resumesLook(readProgress(progress), look)) {
    return;
  }

  appendFileSync(logPath, `| ${new Date().toISOString()} ${look}\n`);

  if (progress) {
    writeAtomic(progress, Buffer.from(lookHeader(look)));
  }
}

async function main(): Promise<void> {
  const {values} = parseArgs({options: {
    split: {type: 'string'},
    detector: {type: 'string', default: 'peaks'},
    sets: {type: 'string'},
    out: {type: 'string'},
    reason: {type: 'string'},
    dir: {type: 'string'},
    limit: {type: 'string'},
    tuning: {type: 'string'},
    progress: {type: 'string'},
    'heldout-log': {type: 'string'},
  }});
  const benchmarkDir = values.dir!;
  const split = values.split as Split;
  const names = values.detector.split(',');
  // Dev feeds tuning decisions, so it is the licence-clean sets unless a held-out run says otherwise
  const sets = (values.sets ?? (split === 'dev' ? [...tuningSets] : Object.keys(loaders)).join(',')).split(',');

  assertArguments(names, sets, values.out, values.limit);

  if (split !== 'dev' && split !== 'heldout') {
    throw new Error('--split must be dev or heldout');
  }

  if (split === 'heldout') {
    if (values.tuning) {
      throw new Error('Tuning is for dev: held-out scores the committed defaults');
    }

    if (!values.reason) {
      throw new Error('A held-out run needs --reason');
    }

    const sha = assertCommittedTree(benchmarkDir);

    logLook(
      values['heldout-log'] ?? join(benchmarkDir, 'heldout-log.md'),
      `| ${sha.slice(0, 12)} | ${names.join(', ')} | ${values.reason} (sets ${sets.join(', ')}, limit ${values.limit ?? 'none'}) |`,
      values.progress,
    );
  }

  const tracks = selectTracks(benchmarkDir, split, sets);

  if (split === 'dev') {
    assertTunable(tracks);
  }

  const limited = values.limit ? tracks.slice(0, Number(values.limit)) : tracks;
  const tuning = values.tuning ? JSON.parse(values.tuning) as Partial<TempogramTuning> : undefined;
  const kept = progressRows<Progress>(readProgress(values.progress));
  const isKept = new Set(kept.map(({detector, result}) => `${detector}/${result.set}/${result.id}`));
  const jobs = names.flatMap(detector => limited.map(track => ({detector, track, tuning})))
    .filter(({detector, track}) => !isKept.has(`${detector}/${track.set}/${track.id}`));
  const results: Record<string, TrackResult[]> = Object.fromEntries(names.map(name => [name, []]));
  const start = Date.now();

  for (const {detector, result} of kept) {
    results[detector].push(result);
  }

  let done = 0;

  await runAll(jobs, (result, detector) => {
    results[detector].push(result);
    done += 1;

    if (values.progress) {
      appendFileSync(values.progress, `\n${JSON.stringify({detector, result})}\n`);
    }

    if (done % 200 === 0) {
      console.error(`${done}/${jobs.length} after ${((Date.now() - start) / 1000).toFixed(0)} s`);
    }
  });

  for (const list of Object.values(results)) {
    list.sort((a, b) => (a.set + a.id < b.set + b.id ? -1 : 1));
  }

  // With progress kept, a shrunk run stays resumable: a final file would read as a finished look
  if (values.progress && done < jobs.length) {
    throw new Error(`${jobs.length - done} of ${jobs.length} runs were skipped: restart to retry them, finished ones are in ${values.progress}`);
  }

  writeAtomic(values.out!, Buffer.from(`${JSON.stringify({split, sampleRate, results})}\n`));
  console.log(`${jobs.length} runs in ${((Date.now() - start) / 1000).toFixed(0)} s`);

  // Scores are written anyway, a look cannot be repeated, but a shrunk denominator must not pass quietly
  if (done < jobs.length) {
    throw new Error(`${jobs.length - done} of ${jobs.length} runs were skipped: declare them with the scores`);
  }
}

if (isMainThread) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (workerData) {
  parentPort!.on('message', (job: Job) => {
    runJob(job).then(
      result => {
        parentPort!.postMessage(result);
      },
      (error: unknown) => {
        parentPort!.postMessage({failed: String(error)});
      },
    );
  });
}
