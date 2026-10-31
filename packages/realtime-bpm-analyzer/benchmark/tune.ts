// Dev-only tuning, on licence-clean sets only (lib/licences.ts). Reading the PCM is what makes a dev pass slow, and most knobs sit after the
// onset stage, so this caches onset strength curves (not audio) and replays them.
//   tune.mjs --cache <dir> --build [--tuning json]    caches the curves of the dev split
//   tune.mjs --cache <dir> <tuning json>...           replays each tuning, printing its metrics
//   tune.mjs --cache <dir> --sweep <plan> --out <dir> replays a plan into sweep.jsonl, resuming it
// Replay timing is within one chunk of the real path. Reported numbers come from run.ts, not this.
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {createTempogramDetector, defaultTempogramTuning} from '../src/core/tempogram';
import type {TempogramTuning} from '../src/core/tempogram';
import {loaders} from './lib/datasets';
import {assertTunable, tuningSets} from './lib/licences';
import {decode, sampleRate, writeAtomic} from './lib/decode';
import {errorProfile, isCorrect, summarize} from './lib/metrics';
import {assertReplayable, bestRow, parseRows, scoreOf, stageTunings, tuningKey} from './lib/sweep';
import type {SetMetrics, SweepRow, SweepStage} from './lib/sweep';
import {workerCount} from './lib/workers';
import type {Track, TrackResult} from './lib/types';

type Job = {track: Track; cache: string; build: boolean; tuning: Partial<TempogramTuning>};

const framePeriod = 0.01;

function buildCurve(job: Job): void {
  const path = join(job.cache, `${job.track.set}-${job.track.id}.f32`);

  if (existsSync(path)) {
    return;
  }

  const pcm = decode(job.track);
  const detector = createTempogramDetector({sampleRate, tuning: {...job.tuning, warmupSeconds: 1e6}});
  const curve = detector.onsetCurve(pcm);

  writeAtomic(path, new Uint8Array(curve.buffer));
}

function replay({track, cache, tuning}: Job): TrackResult {
  const bytes = readFileSync(join(cache, `${track.set}-${track.id}.f32`));
  const curve = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const detector = createTempogramDetector({sampleRate, tuning});
  let final: number | null = null;
  let firstReadingAt: number | null = null;
  let firstCorrectAt: number | null = null;
  const stable: Array<[number, number]> = [];

  for (let i = 0; i < curve.length; i += 1) {
    const reading = detector.ingest(curve[i]);
    const top = reading?.candidates[0]?.tempo;

    if (top !== undefined) {
      const heard = (i + 1) * framePeriod;

      final = top;
      firstReadingAt ??= heard;

      if (firstCorrectAt === null && isCorrect(top, track.bpm)) {
        firstCorrectAt = heard;
      }

      if (reading!.isNewlyStable) {
        stable.push([heard, top]);
      }
    }
  }

  return {
    set: track.set, id: track.id, genre: track.genre, truth: track.bpm, duration: curve.length * framePeriod, final, firstReadingAt, firstCorrectAt, stable,
  };
}

async function pool(jobs: Job[]): Promise<TrackResult[]> {
  const results: TrackResult[] = [];
  let next = 0;

  await Promise.all(Array.from({length: workerCount()}, async () => new Promise<void>((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), {workerData: true});
    const feed = () => {
      if (next >= jobs.length) {
        void worker.terminate().then(() => {
          resolve();
        });
        return;
      }

      worker.postMessage(jobs[next]);
      next += 1;
    };

    worker.on('message', (result: TrackResult | null) => {
      if (result) {
        results.push(result);
      }

      feed();
    });
    worker.on('error', reject);
    feed();
  })));

  return results;
}

function metricsOf(results: readonly TrackResult[]): SetMetrics {
  const s = summarize(results);

  return {acc1: s.acc1, acc2: s.acc2, falseStable: s.falseStable, coverage: s.stableCoverage};
}

async function replayRow(stage: string, tuning: SweepRow['tuning'], tracks: Track[], cache: string): Promise<SweepRow> {
  const results = await pool(tracks.map(track => ({track, cache, build: false, tuning})));
  const sets = Object.fromEntries([...new Set(tracks.map(track => track.set))].map(set => [set, metricsOf(results.filter(r => r.set === set))]));

  return {stage, key: tuningKey(tuning), tuning, sets, score: scoreOf(sets)};
}

/** One line per finished tuning, so a kill loses at most the replay it interrupted */
async function sweep(tracks: Track[], cache: string, planPath: string, out: string): Promise<void> {
  const {stages} = JSON.parse(readFileSync(planPath, 'utf8')) as {stages: SweepStage[]};
  const logPath = join(out, 'sweep.jsonl');
  const text = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  const rows = parseRows(text);
  let planned = 0;

  assertReplayable(stages, Object.keys(defaultTempogramTuning));

  // A torn last line must not swallow the next row
  if (text !== '' && !text.endsWith('\n')) {
    appendFileSync(logPath, '\n');
  }

  for (const stage of stages) {
    const earlier = rows.filter(row => stages.findIndex(s => s.name === row.stage) < stages.indexOf(stage));

    for (const tuning of stageTunings(stage, earlier)) {
      planned += 1;

      if (!rows.some(row => row.key === tuningKey(tuning))) {
        const row = await replayRow(stage.name, tuning, tracks, cache);

        appendFileSync(logPath, `${JSON.stringify(row)}\n`);
        rows.push(row);
        console.log(`${stage.name} ${planned}: score ${row.score.toFixed(1)} ${row.key}`);
      }
    }
  }

  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, 20);

  writeFileSync(join(out, 'sweep-report.json'), `${JSON.stringify({planned, done: rows.length, tracks: tracks.length, best: bestRow(rows), top}, null, 2)}\n`);
}

async function main(): Promise<void> {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {
    cache: {type: 'string'},
    build: {type: 'boolean', default: false},
    tuning: {type: 'string', default: '{}'},
    sets: {type: 'string'},
    sweep: {type: 'string'},
    out: {type: 'string'},
  }});
  const cache = values.cache!;
  // Only ever the dev side: held-out tracks are filtered out here, before any audio or scoring
  const tracks = (values.sets?.split(',') ?? [...tuningSets]).flatMap(set => {
    const ids = new Set((JSON.parse(readFileSync(join(process.cwd(), 'splits', `${set}.json`), 'utf8')) as {dev: string[]}).dev);

    return loaders[set]().filter(track => ids.has(track.id));
  });

  assertTunable(tracks);
  mkdirSync(cache, {recursive: true});

  if (values.build) {
    await pool(tracks.map(track => ({track, cache, build: true, tuning: JSON.parse(values.tuning) as Partial<TempogramTuning>})));
    return;
  }

  if (values.sweep) {
    await sweep(tracks, cache, values.sweep, values.out!);
    return;
  }

  for (const json of positionals) {
    const tuning = JSON.parse(json) as Partial<TempogramTuning>;
    const results = await pool(tracks.map(track => ({track, cache, build: false, tuning})));
    const line = (list: TrackResult[]) => {
      const s = summarize(list);
      const fmt = (value: number | null) => (value === null ? '–' : `${(value * 100).toFixed(1)}`);

      return `A1 ${fmt(s.acc1)} A2 ${fmt(s.acc2)} t1 ${s.medianFirstCorrect?.toFixed(1) ?? '-'} FS ${fmt(s.falseStable)} FFS ${fmt(s.falseFirstStable)} cov ${fmt(s.stableCoverage)} n ${s.stableReadings} ${JSON.stringify(errorProfile(list))}`;
    };

    console.log(`## ${json}\n  all: ${line(results)}`);

    for (const set of new Set(tracks.map(track => track.set))) {
      console.log(`  ${set}: ${line(results.filter(r => r.set === set))}`);
    }
  }
}

if (isMainThread) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (workerData) {
  parentPort!.on('message', (job: Job) => {
    if (job.build) {
      buildCurve(job);
      parentPort!.postMessage(null);
    } else {
      parentPort!.postMessage(replay(job));
    }
  });
}
