// Benchmark CLI, see benchmark/readme.md. Bundled by benchmark/run.sh.
//   run.mjs --split dev --detector peaks --out results/peaks-dev.json
//   run.mjs --split heldout --detector peaks,tempogram --reason "..." --out ...
// Held-out access goes through here on purpose: it needs a reason, a committed tree, and writes
// one line to heldout-log.md before reading a single label.
import {execFileSync} from 'node:child_process';
import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';
import {cpus} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {applyLowpass} from '../src/core/lowpass';
import {detectTempo} from '../src/core/detect-tempo';
import {resolveTempoRange} from '../src/core/tempo';
import {loaders} from './lib/datasets';
import {decode, sampleRate} from './lib/decode';
import {detectors} from './lib/detectors';
import {listen} from './lib/stream';
import type {TempogramTuning} from '../src/core/tempogram';
import type {Split, Track, TrackResult} from './lib/types';

type Job = {readonly detector: string; readonly track: Track; readonly tuning?: Partial<TempogramTuning>};

const workerCount = Math.max(1, cpus().length - 2);

async function runJob({detector, track, tuning}: Job): Promise<TrackResult> {
  const config = detectors[detector];
  const raw = decode(track);
  const pcm = config.lowpass ? applyLowpass(raw, sampleRate) : raw;
  const result = await listen(track, pcm, sampleRate, config.options, tuning);

  if (!config.offline) {
    return result;
  }

  const offline = await detectTempo(pcm, sampleRate, resolveTempoRange()).catch(() => []);

  return {...result, offline: offline[0]?.tempo ?? null};
}

function assertCommittedTree(benchmarkDir: string): string {
  const dirty = execFileSync('git', ['status', '--porcelain', '--', '..'], {cwd: benchmarkDir, encoding: 'utf8'}).trim();

  if (dirty) {
    throw new Error(`Held-out runs need a committed tree, so the log names the code that ran:\n${dirty}`);
  }

  return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: benchmarkDir, encoding: 'utf8'}).trim();
}

function selectTracks(benchmarkDir: string, split: Split, sets: string[]): Track[] {
  return sets.flatMap(set => {
    const ids = new Set((JSON.parse(readFileSync(join(benchmarkDir, 'splits', `${set}.json`), 'utf8')) as Record<Split, string[]>)[split]);

    return loaders[set]().filter(track => ids.has(track.id));
  });
}

async function runAll(jobs: Job[], onDone: (result: TrackResult, detector: string) => void): Promise<void> {
  let next = 0;
  const workers = Array.from({length: workerCount}, async () => new Promise<void>((resolve, reject) => {
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

async function main(): Promise<void> {
  const {values} = parseArgs({options: {
    split: {type: 'string'},
    detector: {type: 'string', default: 'peaks'},
    sets: {type: 'string', default: Object.keys(loaders).join(',')},
    out: {type: 'string'},
    reason: {type: 'string'},
    dir: {type: 'string'},
    limit: {type: 'string'},
    tuning: {type: 'string'},
  }});
  const benchmarkDir = values.dir!;
  const split = values.split as Split;
  const names = values.detector.split(',');

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

    appendFileSync(
      join(benchmarkDir, 'heldout-log.md'),
      `| ${new Date().toISOString()} | ${sha.slice(0, 12)} | ${names.join(', ')} | ${values.reason} |\n`,
    );
  }

  const tracks = selectTracks(benchmarkDir, split, values.sets.split(','));
  const limited = values.limit ? tracks.slice(0, Number(values.limit)) : tracks;
  const tuning = values.tuning ? JSON.parse(values.tuning) as Partial<TempogramTuning> : undefined;
  const jobs = names.flatMap(detector => limited.map(track => ({detector, track, tuning})));
  const results: Record<string, TrackResult[]> = Object.fromEntries(names.map(name => [name, []]));
  const start = Date.now();

  let done = 0;

  await runAll(jobs, (result, detector) => {
    results[detector].push(result);
    done += 1;

    if (done % 200 === 0) {
      console.error(`${done}/${jobs.length} after ${((Date.now() - start) / 1000).toFixed(0)} s`);
    }
  });

  for (const list of Object.values(results)) {
    list.sort((a, b) => (a.set + a.id < b.set + b.id ? -1 : 1));
  }

  writeFileSync(values.out!, `${JSON.stringify({split, sampleRate, results})}\n`);
  console.log(`${jobs.length} runs in ${((Date.now() - start) / 1000).toFixed(0)} s`);
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
