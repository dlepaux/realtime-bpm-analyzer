// Dev-only tuning, on licence-clean sets only (lib/licences.ts). Reading the PCM is what makes a dev pass slow, and most knobs sit after the
// onset stage, so this caches onset strength curves (not audio) and replays them.
//   tune.mjs --cache <dir> --build [--tuning json]    caches the curves of the dev split
//   tune.mjs --cache <dir> <tuning json>...           replays each tuning, printing its metrics
// Replay timing is within one chunk of the real path. Reported numbers come from run.ts, not this.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {cpus} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import {createTempogramDetector} from '../src/core/tempogram';
import type {TempogramTuning} from '../src/core/tempogram';
import {loaders} from './lib/datasets';
import {assertTunable, tuningSets} from './lib/licences';
import {decode, sampleRate} from './lib/decode';
import {errorProfile, isCorrect, summarize} from './lib/metrics';
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

  writeFileSync(path, Buffer.from(curve.buffer));
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

  await Promise.all(Array.from({length: Math.max(1, cpus().length - 2)}, async () => new Promise<void>((resolve, reject) => {
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

async function main(): Promise<void> {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {
    cache: {type: 'string'},
    build: {type: 'boolean', default: false},
    tuning: {type: 'string', default: '{}'},
    sets: {type: 'string'},
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
