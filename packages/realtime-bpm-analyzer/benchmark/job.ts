// The engine study's batch job: see job/readme.md. Bundled by benchmark/run.sh, started by job/entrypoint.sh.
//   job.mjs [tune]                                the data, then the dev sweep. The default
//   job.mjs fetch                                 the data only
//   job.mjs dev --detector a,b                    the data, then a dev scoring through the real path. No look
//   job.mjs hysteresis                            the data, then the calibration study's hysteresis sweep on dev and its pick. No look
//   job.mjs heldout --reason "..." [--detector]   the data, a dev scoring, then a held-out look, logged
//   job.mjs free-look --reason "..."              the engine study's one look at the held-out free mixes, then its verdict
//   job.mjs calibration-heldout --reason "..."    the calibration study's one held-out check of the shipped calibration, then its verdict
// Every stage is safe to kill and restart. Exit: 0 done, 1 failed, 2 bad arguments, 3 the sweep is
// done on clean data but an evaluation set did not come back whole.
import {spawn} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {dataRoot, loaders} from './lib/datasets';
import {freeLoaders} from './lib/free-mixes';
import {freeJobModeRefusal, freeLookScope, isFreeSet} from './lib/free-mixes-rows';
import {rebuild, stopCommands} from './lib/fetch';
import type {DataReport} from './lib/fetch';
import type {SetReport} from './lib/sources';
import {assertTunableSets, cleanSets} from './lib/licences';
import {detectors, lookDetectors, pickedConfiguration} from './lib/detectors';
import {freeLookRefusal, lookDetectorRefusal, lookRefusal, lookScopeRefusal} from './lib/look';
import type {RunFailure} from './lib/look';
import {bandCounts} from './lib/metrics';
import {guardShortfalls} from './lib/sweep';
import {sweepDetectors} from './lib/hysteresis-pick';
import {calibrationDetector, calibrationLogName, calibrationLookRefusal, calibrationLookScope} from './lib/calibration-samples';
import type {TrackResult} from './lib/types';

const benchmarkDir = process.cwd();
const jobDir = join(dataRoot, '_job');
const heldoutLog = join(jobDir, 'heldout-log.md');
const benchmarkSha = (process.env.RBA_BENCHMARK_SHA || 'local').slice(0, 12);
// Per commit: a later look must not find the results or the finished file of an earlier one
const heldoutOut = join(jobDir, `heldout-${benchmarkSha}.json`);
const heldoutProgress = join(jobDir, `heldout-progress-${benchmarkSha}.jsonl`);
const incompleteEvaluation = 3;
// The engine study's look at the held-out free mixes: its own files and log, so it touches nothing of the clean sets' looks
const freeLog = join(jobDir, 'free-heldout-log.md');
const freeOut = join(jobDir, `free-heldout-${benchmarkSha}.json`);
const freeProgress = join(jobDir, `free-heldout-progress-${benchmarkSha}.jsonl`);
const freeVerdict = {md: join(jobDir, `free-verdict-${benchmarkSha}.md`), json: join(jobDir, `free-verdict-${benchmarkSha}.json`)};
// The calibration study's held-out calibration check. Per track, staying on the volume: the runs, their progress and the samples.
// Aggregates, the only files that leave it: the dev re-fit's comparison and the verdict
const calibration = {
  log: join(jobDir, calibrationLogName),
  dev: join(jobDir, `calibration-dev-${benchmarkSha}.json`),
  devSamples: join(jobDir, `calibration-samples-dev-${benchmarkSha}.json`),
  refit: join(jobDir, `calibration-refit-${benchmarkSha}.json`),
  heldout: join(jobDir, `calibration-heldout-${benchmarkSha}.json`),
  progress: join(jobDir, `calibration-heldout-progress-${benchmarkSha}.jsonl`),
  heldoutSamples: join(jobDir, `calibration-samples-heldout-${benchmarkSha}.json`),
  verdict: {md: join(jobDir, `calibration-verdict-${benchmarkSha}.md`), json: join(jobDir, `calibration-verdict-${benchmarkSha}.json`)},
};
// The tables the library ships, as the benchmark committed them: a library test holds the two equal
const committedCalibration = 'results/rba-106-calibration-dev.json';

type Summary = {
  mode: string;
  sha: string;
  /** `all`, or the sets of a partial run, which proves less than a full one */
  scope: string;
  startedAt: string;
  finishedAt: string | null;
  stage: string;
  status: 'running' | 'ok' | 'incomplete' | 'failed';
  error: string | null;
  data: DataReport | null;
  curves: {built: number; expected: number} | null;
  sweep: unknown;
  /** Where the curves and the sweep's rows are */
  runDir: string | null;
  /** The real path's scores on dev, for the row beside the look's */
  dev: string | null;
  heldout: string | null;
  /** Tracks a look scored without, because their file cannot decode. Each one is named here */
  skipped: readonly RunFailure[];
  /** A look's verdict: its exit (0 pass, 1 fail) and its aggregate files */
  verdict?: {exit: number; md: string; json: string};
  /** The calibration check's dev re-fit, which must reproduce the committed tables before the look */
  refit?: string;
};

/** One file per mode: a fetch or a held-out look must not overwrite the sweep's evidence */
function pathOf(summary: Summary): string {
  return join(jobDir, `summary-${summary.mode}.json`);
}

function save(summary: Summary): void {
  writeFileSync(`${pathOf(summary)}.tmp`, `${JSON.stringify(summary, null, 2)}\n`);
  renameSync(`${pathOf(summary)}.tmp`, pathOf(summary));
}

let child: ChildProcess | null = null;

async function runEntry(entry: string, args: readonly string[], okCodes: readonly number[] = [0]): Promise<number> {
  return runCommand('./run.sh', [entry, ...args], okCodes, entry);
}

async function runCommand(command: string, args: readonly string[], okCodes: readonly number[], name: string): Promise<number> {
  const code = await new Promise<number>((resolve, reject) => {
    child = spawn(command, args, {stdio: 'inherit'})
      .on('error', reject)
      // A process killed by a signal has no status: a failure, never one of a mode's verdict codes
      .on('close', status => {
        resolve(status ?? -1);
      });
  });

  if (!okCodes.includes(code)) {
    throw new Error(`${name} exited ${code}`);
  }

  return code;
}

async function tune(summary: Summary, sets: readonly string[], plan: string): Promise<void> {
  const data = summary.data!;
  const expected = sets.reduce((sum, set) => sum + data.sets[set].dev, 0);
  const setArgs = ['--sets', sets.join(',')];
  // A row or curve only counts for the code and the sets that made it, so each pair resumes alone
  const runDir = join(jobDir, `tune-${summary.sha.slice(0, 12)}-${summary.scope.replaceAll(',', '+')}`);
  const curves = join(runDir, 'curves');

  mkdirSync(runDir, {recursive: true});
  summary.stage = 'curves';
  save(summary);
  await runEntry('tune', ['--cache', curves, '--build', ...setArgs]);

  const built = readdirSync(curves).filter(name => name.endsWith('.f32')).length;

  summary.curves = {built, expected};

  if (built !== expected) {
    throw new Error(`${built} curves for ${expected} dev tracks`);
  }

  summary.stage = 'sweep';
  save(summary);
  await runEntry('tune', ['--cache', curves, '--sweep', plan, '--out', runDir, ...setArgs]);
  summary.sweep = JSON.parse(readFileSync(join(runDir, 'sweep-report.json'), 'utf8'));
  summary.runDir = runDir;
}

/**
 * The sweep is a replay and holds no peaks, so the numbers beside a look come from here. It runs
 * first because a failure here spends no look, and in one job because the volume has one writer.
 */
async function devScores(summary: Summary, sets: readonly string[], detector: string): Promise<string> {
  const devOut = join(jobDir, `dev-${summary.sha.slice(0, 12)}.json`);

  summary.stage = 'dev';
  save(summary);

  if (!existsSync(devOut)) {
    await runEntry('run', ['--split', 'dev', '--detector', detector, '--sets', sets.join(','), '--out', devOut, '--progress', `${devOut}.progress`]);
  }

  summary.dev = devOut;

  return devOut;
}

/**
 * The pick came from a replay, within one chunk of the real path. A guard that only the replay
 * passes is not passed, and failing here logs no look.
 */
function assertPickHoldsGuard(devOut: string): void {
  const {results} = JSON.parse(readFileSync(devOut, 'utf8')) as {results: Record<string, TrackResult[]>};
  const shortfalls = guardShortfalls(bandCounts(results[pickedConfiguration]));

  // The verdict resamples groups, so this is the free proof that a result carries one
  if (Object.values(results).flat().some(({group}) => group === undefined)) {
    throw new Error('A dev result has no group, and the look\'s would not either. No look was taken');
  }

  if (shortfalls.length > 0) {
    throw new Error(`${pickedConfiguration} is under the fast-tempo guard on dev, real path: ${shortfalls.join(', ')}. No look was taken`);
  }
}

async function heldout(summary: Summary, sets: readonly string[], reason: string, detector: string): Promise<void> {
  summary.stage = 'heldout';
  save(summary);
  await runEntry('run', [
    '--split', 'heldout', '--detector', detector, '--sets', sets.join(','), '--reason', reason, '--out', heldoutOut,
    '--progress', heldoutProgress,
  ]);
  summary.heldout = heldoutOut;
  summary.skipped = (JSON.parse(readFileSync(heldoutOut, 'utf8')) as {skipped: RunFailure[]}).skipped;
}

/**
 * The engine study's one look at the held-out free mixes, then the verdict committed before it. No dev scoring
 * first: 5.5.0 and peaks were scored on this dev half through the real path at 61446af, and the
 * candidate is the library as shipped, so there is no replayed pick to hold to a guard. The sets live on
 * the volume and have no source to fetch. A restart after the look's file only judges it again: the
 * verdict reads that file and nothing new.
 */
async function freeLook(summary: Summary, reason: string): Promise<void> {
  if (!existsSync(freeOut)) {
    summary.stage = 'heldout';
    save(summary);
    await runEntry('run', [
      '--split', 'heldout', '--detector', freeLookScope.detectors.join(','), '--sets', freeLookScope.sets.join(','), '--reason', reason,
      '--out', freeOut, '--progress', freeProgress,
    ]);
  }

  summary.heldout = freeOut;
  summary.skipped = (JSON.parse(readFileSync(freeOut, 'utf8')) as {skipped: RunFailure[]}).skipped;
  summary.stage = 'verdict';
  save(summary);

  const exit = await runEntry('free-verdict', [freeOut, freeVerdict.md, freeVerdict.json], [0, 1]);

  summary.verdict = {exit, ...freeVerdict};
  summary.status = 'ok';
}

/**
 * The free-mix sets are on the volume already and have no source to fetch here: their pipeline owns them,
 * and this only counts their dev tracks. A count of zero fails, as a set that did not come back.
 */
function freeSetReports(sets: readonly string[]): DataReport['sets'] {
  return Object.fromEntries(sets.filter(isFreeSet).map(set => {
    const dev = freeLoaders[set]().length;

    if (dev === 0) {
      throw new Error(`${set} has no dev track on the volume`);
    }

    // Held-out is not read, so it counts nothing here
    const report: SetReport = {dev, heldout: 0, found: dev, missing: [], unexpected: [], differs: []};

    return [set, report];
  }));
}

async function stages(summary: Summary, mode: string, wanted: readonly string[], options: {reason?: string; detector: string; plan: string}): Promise<void> {
  if (mode === 'free-look') {
    await freeLook(summary, options.reason!);
    return;
  }

  // A restart after the check's file only judges it again: the verdict reads that file and nothing new
  if (mode === 'calibration-heldout' && existsSync(calibration.heldout)) {
    await calibrationVerdict(summary);
    summary.status = 'ok';
    return;
  }

  summary.stage = 'data';
  save(summary);

  const clean = wanted.filter(set => cleanSets.has(set));

  // Licence-clean is not enough to tune on: contested labels are scored and never tuned to. Before the fetch
  if (mode === 'tune') {
    assertTunableSets(clean);
  }

  const fetched = await rebuild(dataRoot, benchmarkDir, wanted.filter(set => !isFreeSet(set)));
  const data: DataReport = {...fetched, sets: {...fetched.sets, ...freeSetReports(wanted)}};

  summary.data = data;

  const dirtyClean = data.incomplete.filter(set => cleanSets.has(set));

  if (dirtyClean.length > 0 || ((mode === 'heldout' || mode === 'calibration-heldout') && data.incomplete.length > 0)) {
    throw new Error(`Incomplete sets, see data in this file: ${data.incomplete.join(', ')}`);
  }

  if (mode === 'tune') {
    await tune(summary, clean, options.plan);
  } else if (mode === 'dev') {
    await devScores(summary, clean, options.detector);
  } else if (mode === 'hysteresis') {
    await hysteresisSweep(summary, clean);
  } else if (mode === 'heldout') {
    assertPickHoldsGuard(await devScores(summary, clean, options.detector));
    await heldout(summary, wanted, options.reason!, options.detector);
  } else if (mode === 'calibration-heldout') {
    await calibrationDevRefit(summary, wanted);
    await calibrationLook(summary, wanted, options.reason!);
    await calibrationVerdict(summary);
  }

  summary.status = data.incomplete.length > 0 ? 'incomplete' : 'ok';
}

/**
 * The calibration study's hysteresis sweep: every row of both engines' grids on dev, then the rule committed in
 * lib/hysteresis-pick.ts picks, and the picked rows' readings are kept for the calibration. Dev only.
 */
async function hysteresisSweep(summary: Summary, sets: readonly string[]): Promise<void> {
  const devOut = await devScores(summary, sets, sweepDetectors.join(','));
  const sha = summary.sha.slice(0, 12);

  summary.stage = 'hysteresis';
  save(summary);
  await runEntry('hysteresis', ['--in', devOut, '--out', join(jobDir, `hysteresis-report-${sha}.json`), '--samples', join(jobDir, `calibration-samples-${sha}.json`)]);
}

/**
 * The calibration study's check, first step: the tempogram on dev with this harness, its samples, and calibration.py's re-fit,
 * which must give the committed tables exactly and find every recorded confidence to be the committed table read at
 * the recorded raw score. It proves the raw scores are recorded right and that the image ships those
 * tables. A failure here takes no look.
 */
async function calibrationDevRefit(summary: Summary, sets: readonly string[]): Promise<void> {
  summary.stage = 'calibration-dev';
  save(summary);
  if (!existsSync(calibration.dev)) {
    await runEntry('run', ['--split', 'dev', '--detector', calibrationDetector, '--sets', sets.join(','), '--out', calibration.dev, '--progress', `${calibration.dev}.progress`]);
  }

  summary.dev = calibration.dev;
  await runEntry('calibration-samples', ['--in', calibration.dev, '--out', calibration.devSamples]);
  summary.stage = 'calibration-refit';
  save(summary);
  await runCommand('python3', ['-I', 'calibration.py', 'refit', calibration.devSamples, committedCalibration, calibration.refit], [0], 'the dev re-fit, so no look was taken,');
  summary.refit = calibration.refit;
}

/** The check itself: logged once in its own log before a label is read, and resumable from its progress file */
async function calibrationLook(summary: Summary, sets: readonly string[], reason: string): Promise<void> {
  summary.stage = 'heldout';
  save(summary);
  await runEntry('run', [
    '--split', 'heldout', '--look', 'calibration', '--detector', calibrationDetector, '--sets', sets.join(','), '--reason', reason,
    '--out', calibration.heldout, '--progress', calibration.progress,
  ]);
}

/** The held-out samples, then calibration.py's verdict against HELDOUT_BAR: 0 pass, 1 fail, both a finished check */
async function calibrationVerdict(summary: Summary): Promise<void> {
  summary.heldout = calibration.heldout;
  summary.skipped = (JSON.parse(readFileSync(calibration.heldout, 'utf8')) as {skipped: RunFailure[]}).skipped;
  summary.stage = 'verdict';
  save(summary);
  await runEntry('calibration-samples', ['--in', calibration.heldout, '--out', calibration.heldoutSamples]);

  // 0 pass and 1 fail are both a judged check; a refusal or a crash exits 2 and records no verdict, so it can be retried.
  // An earlier attempt's files go first, so only this attempt's can be read as the verdict
  rmSync(calibration.verdict.md, {force: true});
  rmSync(calibration.verdict.json, {force: true});
  const exit = await runCommand('python3', ['-I', 'calibration.py', 'heldout', calibration.heldoutSamples, committedCalibration, calibration.verdict.md, calibration.verdict.json], [0, 1], 'the verdict');
  const written = existsSync(calibration.verdict.md) && existsSync(calibration.verdict.json)
    ? JSON.parse(readFileSync(calibration.verdict.json, 'utf8')) as {passed?: unknown} : undefined;
  if (written?.passed !== (exit === 0)) {
    throw new Error(`the verdict exited ${exit} but ${calibration.verdict.json} does not say ${exit === 0 ? 'pass' : 'fail'}`);
  }

  summary.verdict = {exit, ...calibration.verdict};
}

/**
 * The calibration check may start, or resume its own progress or its verdict. Anything else is refused before
 * anything runs, the data and the dev re-fit included.
 * @returns Why not, or null
 */
function refuseCalibrationLook(reason: string, sets: string | undefined, detector: string | undefined): string | null {
  if (sets !== undefined || detector !== undefined) {
    return 'The calibration check takes no --sets or --detector: its scope is fixed in lib/calibration-samples.ts';
  }

  // Its files are named by the image's commit, which is what keeps a re-judge on the code that took the look
  if (!process.env.RBA_BENCHMARK_SHA) {
    return 'The calibration check runs from a built image only: RBA_BENCHMARK_SHA names the code that takes and judges it';
  }

  // Once the look's file exists, a restart only judges it again, which reads nothing new: allowed until a verdict is recorded
  const summaryPath = join(jobDir, 'summary-calibration-heldout.json');
  const previous = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) as Summary : undefined;
  if (existsSync(calibration.heldout)) {
    return previous?.verdict === undefined ? null : `${calibration.heldout} exists and was judged: the check has run`;
  }

  const log = existsSync(calibration.log) ? readFileSync(calibration.log, 'utf8') : '';
  const isResuming = existsSync(calibration.progress) && statSync(calibration.progress).size > 0;

  return calibrationLookRefusal(log, isResuming, reason, calibrationLookScope.detectors, calibrationLookScope.sets);
}

/** @returns The arguments, or null when they do not parse */
function parseJobArgs() {
  try {
    return parseArgs({allowPositionals: true, options: {
      sets: {type: 'string'},
      reason: {type: 'string'},
      detector: {type: 'string'},
      plan: {type: 'string', default: 'job/sweep-plan.json'},
    }});
  } catch {
    return null;
  }
}

/** @returns Why a look must not start, or null. It holds before anything runs, a dev scoring included */
function refuseLook(reason: string, names: readonly string[], sets: readonly string[]): string | null {
  const refusal = lookDetectorRefusal(pickedConfiguration, names, lookDetectors) ?? lookScopeRefusal(names, sets, lookDetectors, Object.keys(loaders));

  if (refusal) {
    return refusal;
  }

  const log = existsSync(heldoutLog) ? readFileSync(heldoutLog, 'utf8') : '';

  return lookRefusal(log, existsSync(heldoutProgress) && statSync(heldoutProgress).size > 0, reason);
}

/**
 * The free-mix look may start, or resume its own progress or its verdict. Anything else is refused
 * before anything runs.
 * @returns Why not, or null
 */
function refuseFreeLook(reason: string, sets: string | undefined, detector: string | undefined): string | null {
  if (sets !== undefined || detector !== undefined) {
    return 'The free-mix look takes no --sets or --detector: its scope is fixed in lib/free-mixes-rows.ts';
  }

  const summaryPath = join(jobDir, 'summary-free-look.json');
  const isRunning = existsSync(summaryPath) && (JSON.parse(readFileSync(summaryPath, 'utf8')) as Summary).status === 'running';

  if (existsSync(freeOut)) {
    return isRunning ? null : `${freeOut} exists: that look is spent`;
  }

  const log = existsSync(freeLog) ? readFileSync(freeLog, 'utf8') : '';

  return freeLookRefusal(log, existsSync(freeProgress) && statSync(freeProgress).size > 0, reason);
}

/**
 * Scoring a finished look again would be a new look: that takes deleting its file by hand. A kill
 * can land after the file and before the summary, and then this restart only closes the summary.
 */
function closeSpentLook(): number {
  const path = join(jobDir, 'summary-heldout.json');
  const summary = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Summary : null;

  if (summary?.status !== 'running') {
    console.error(`${heldoutOut} exists: that look is spent`);
    return 2;
  }

  save({...summary, status: 'ok', heldout: heldoutOut, finishedAt: new Date().toISOString()});
  console.log(`status ok, the look had finished, summary in ${path}`);

  return 0;
}

async function main(): Promise<number> {
  const args = parseJobArgs();
  const mode = args?.positionals[0] ?? 'tune';
  const wanted = mode === 'calibration-heldout' ? [...calibrationLookScope.sets] : args?.values.sets?.split(',') ?? Object.keys(loaders);

  // The clean sets' heldout mode never takes a free set: the free-mix look is its own mode
  if (!args || !['tune', 'fetch', 'dev', 'hysteresis', 'heldout', 'free-look', 'calibration-heldout'].includes(mode) || !process.env.RBA_TEMPO_ROOT
    || ((mode === 'heldout' || mode === 'free-look' || mode === 'calibration-heldout') && !args.values.reason) || !wanted.every(set => Object.hasOwn(loaders, set) || isFreeSet(set))
    || freeJobModeRefusal(mode, wanted) !== null) {
    console.error('usage: RBA_TEMPO_ROOT=<dir> entrypoint [tune|fetch|dev|hysteresis|heldout --reason <why>|free-look --reason <why>|calibration-heldout --reason <why>] [--sets a,b]');
    return 2;
  }

  const {values} = args;

  if (mode === 'free-look') {
    const freeRefusal = refuseFreeLook(values.reason!, values.sets, values.detector);

    if (freeRefusal) {
      console.error(freeRefusal);
      return 2;
    }
  }

  if (mode === 'calibration-heldout') {
    const calibrationRefusal = refuseCalibrationLook(values.reason!, values.sets, values.detector);

    if (calibrationRefusal) {
      console.error(calibrationRefusal);
      return 2;
    }
  }

  if (mode === 'heldout' && existsSync(heldoutOut)) {
    return closeSpentLook();
  }

  const detector = values.detector ?? (mode === 'heldout' ? lookDetectors : Object.keys(detectors)).join(',');
  const refusal = mode === 'heldout' ? refuseLook(values.reason!, detector.split(','), wanted) : null;

  if (refusal) {
    console.error(refusal);
    return 2;
  }

  mkdirSync(jobDir, {recursive: true});

  const summary: Summary = {
    mode,
    sha: process.env.RBA_BENCHMARK_SHA || 'local',
    scope: mode === 'free-look' ? freeLookScope.sets.join(',') : mode === 'calibration-heldout' ? calibrationLookScope.sets.join(',') : values.sets ?? 'all',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    stage: 'start',
    status: 'running',
    error: null,
    data: null,
    curves: null,
    sweep: null,
    runDir: null,
    dev: null,
    heldout: null,
    skipped: [],
  };

  try {
    await stages(summary, mode, wanted, {reason: values.reason, detector, plan: values.plan});
  } catch (error) {
    summary.status = 'failed';
    summary.error = String(error);
  }

  summary.finishedAt = new Date().toISOString();
  save(summary);
  console.log(`status ${summary.status}, stage ${summary.stage}, summary in ${pathOf(summary)}${summary.error ? `: ${summary.error}` : ''}`);

  return {ok: 0, incomplete: incompleteEvaluation, failed: 1, running: 1}[summary.status];
}

// As PID 1, node would ignore these without a handler. The children go first: outside a container
// they would outlive this process and write alongside the restart
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    child?.kill(signal);
    stopCommands(signal);
    process.exit(143);
  });
}

main().then(
  code => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
