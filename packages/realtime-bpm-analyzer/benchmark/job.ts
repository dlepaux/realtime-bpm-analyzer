// The RBA-51 batch job: see job/readme.md. Bundled by benchmark/run.sh, started by job/entrypoint.sh.
//   job.mjs [tune]                                the data, then the dev sweep. The default
//   job.mjs fetch                                 the data only
//   job.mjs heldout --reason "..." [--detector]   the data, then a held-out look, logged
// Every stage is safe to kill and restart. Exit: 0 done, 1 failed, 2 bad arguments, 3 the sweep is
// done on clean data but an evaluation set did not come back whole.
import {spawn} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {dataRoot, loaders} from './lib/datasets';
import {rebuild, stopCommands} from './lib/fetch';
import type {DataReport} from './lib/fetch';
import {tuningSets} from './lib/licences';

const benchmarkDir = process.cwd();
const jobDir = join(dataRoot, '_job');
const heldoutOut = join(jobDir, 'heldout.json');
const incompleteEvaluation = 3;

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
  heldout: string | null;
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

async function runEntry(entry: string, args: readonly string[]): Promise<void> {
  const code = await new Promise<number>((resolve, reject) => {
    child = spawn('./run.sh', [entry, ...args], {stdio: 'inherit'})
      .on('error', reject)
      .on('close', status => {
        resolve(status ?? 1);
      });
  });

  if (code !== 0) {
    throw new Error(`${entry} exited ${code}`);
  }
}

async function tune(summary: Summary, sets: readonly string[]): Promise<void> {
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
  await runEntry('tune', ['--cache', curves, '--sweep', 'job/sweep-plan.json', '--out', runDir, ...setArgs]);
  summary.sweep = JSON.parse(readFileSync(join(runDir, 'sweep-report.json'), 'utf8'));
  summary.runDir = runDir;
}

async function heldout(summary: Summary, sets: readonly string[], reason: string, detector: string): Promise<void> {
  summary.stage = 'heldout';
  save(summary);
  await runEntry('run', [
    '--split', 'heldout', '--detector', detector, '--sets', sets.join(','), '--reason', reason, '--out', heldoutOut,
    '--progress', join(jobDir, 'heldout-progress.jsonl'), '--heldout-log', join(jobDir, 'heldout-log.md'),
  ]);
  summary.heldout = heldoutOut;
}

async function stages(summary: Summary, mode: string, wanted: readonly string[], options: {reason?: string; detector: string}): Promise<void> {
  summary.stage = 'data';
  save(summary);

  const clean = wanted.filter(set => tuningSets.has(set));
  const data = await rebuild(dataRoot, benchmarkDir, wanted);

  summary.data = data;

  const dirtyClean = data.incomplete.filter(set => tuningSets.has(set));

  if (dirtyClean.length > 0 || (mode === 'heldout' && data.incomplete.length > 0)) {
    throw new Error(`Incomplete sets, see data in this file: ${data.incomplete.join(', ')}`);
  }

  if (mode === 'tune') {
    await tune(summary, clean);
  } else if (mode === 'heldout') {
    await heldout(summary, wanted, options.reason!, options.detector);
  }

  summary.status = data.incomplete.length > 0 ? 'incomplete' : 'ok';
}

/** @returns The arguments, or null when they do not parse */
function parseJobArgs() {
  try {
    return parseArgs({allowPositionals: true, options: {
      sets: {type: 'string'},
      reason: {type: 'string'},
      detector: {type: 'string', default: 'peaks,tempogram-285,tempogram'},
    }});
  } catch {
    return null;
  }
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
  const wanted = args?.values.sets?.split(',') ?? Object.keys(loaders);

  if (!args || !['tune', 'fetch', 'heldout'].includes(mode) || !process.env.RBA_TEMPO_ROOT
    || (mode === 'heldout' && !args.values.reason) || !wanted.every(set => Object.hasOwn(loaders, set))) {
    console.error('usage: RBA_TEMPO_ROOT=<dir> entrypoint [tune|fetch|heldout --reason <why>] [--sets a,b]');
    return 2;
  }

  const {values} = args;

  if (mode === 'heldout' && existsSync(heldoutOut)) {
    return closeSpentLook();
  }

  mkdirSync(jobDir, {recursive: true});

  const summary: Summary = {
    mode,
    sha: process.env.RBA_BENCHMARK_SHA || 'local',
    scope: values.sets ?? 'all',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    stage: 'start',
    status: 'running',
    error: null,
    data: null,
    curves: null,
    sweep: null,
    runDir: null,
    heldout: null,
  };

  try {
    await stages(summary, mode, wanted, {reason: values.reason, detector: values.detector});
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
