// Markdown tables from run.ts's JSON files. Usage, through run.sh: report a.json b.json ...
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import type {QuantumReport} from './page';
import type {Summary} from './stats';

type Heap = Array<{seconds: number; usedBytes: number}>;
type Run = QuantumReport & {engine: string; sampleRate: number; seconds: number; wallSeconds: number; heap?: Heap; playoutBefore?: Record<string, number> | null; playoutAfter?: Record<string, number> | null};
type Offline = {engine: string; seconds: number; timesMs: number[]; tempo: number | null};
type Result = {
  suite: string;
  throttle?: number;
  machine: {cpuModel: string; cpuCount: number; totalMemGiB: number};
  browser?: string;
  probe?: Record<string, unknown>;
  realtime?: Run[] | Run;
  replay?: Run[] | Run;
  offline?: Offline[];
  workletHeap?: Heap;
  targets?: string[];
  with?: Record<string, {minified: number; gzip: number; tempogramModuleBytes: number}>;
  without?: Record<string, {minified: number; gzip: number}>;
};

const {positionals} = parseArgs({allowPositionals: true, options: {root: {type: 'string'}}});
const results = positionals.map(file => JSON.parse(readFileSync(file, 'utf8')) as Result);
const ms = (value: number | undefined) => (value === undefined ? 'n/a' : value < 1 ? value.toFixed(3) : value.toFixed(2));
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const mib = (bytes: number) => (bytes / (1024 ** 2)).toFixed(2);

function quantumRow(run: Run, throttle: number): string {
  const all = run.all as Summary;
  const step = run.analysisStep;
  const fallback = run.playoutAfter?.fallbackFramesEvents === undefined ? 'n/a' : String(run.playoutAfter.fallbackFramesEvents - (run.playoutBefore?.fallbackFramesEvents ?? 0));

  return `| ${run.engine} | ${run.sampleRate / 1000} kHz | ${throttle}x | ${run.quanta} | ${ms(all.mean)} | ${ms(all.p95)} | ${ms(all.p99)} | ${ms(run.maxMs)} | ${pct(run.meanShare)} | ${pct(all.p99 / run.budgetMs)} | ${pct(run.maxMs / run.budgetMs)} | ${ms(step?.mean)} | ${ms(step?.p99)} | ${ms(step?.max)} | ${run.overBudget} | ${run.spilled} | ${fallback} | ${run.lastBpm?.toFixed(1) ?? 'none'} |`;
}

const quantumHeader = '| engine | rate | throttle | quanta | mean ms | p95 ms | p99 ms | max ms | mean share | p99 share | max share | analysis mean ms | analysis p99 ms | analysis max ms | quanta over budget | spilled | fallback events | last BPM |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|';

function section(title: string, rows: string[]): void {
  if (rows.length > 0) {
    console.log(`\n### ${title}\n\n${rows.join('\n')}`);
  }
}

const byThrottle = results.filter(result => result.suite === 'cost').sort((a, b) => (a.throttle ?? 1) - (b.throttle ?? 1));
const machines = new Set(results.map(result => `${result.machine.cpuModel}, ${result.machine.cpuCount} CPUs, ${result.machine.totalMemGiB.toFixed(1)} GiB${result.browser ? `, ${result.browser}` : ''}`));

console.log(`Machines: ${[...machines].join('; ')}`);
console.log(`Probe: ${JSON.stringify(results.find(result => result.probe)?.probe ?? {})}`);
console.log(`Worklet clock: ${(byThrottle[0]?.realtime as Run[] | undefined)?.[0]?.clock ?? 'n/a'}`);

section('Realtime, inside the AudioWorklet', [quantumHeader, ...byThrottle.flatMap(result => (result.realtime as Run[]).map(run => quantumRow(run, result.throttle ?? 1)))]);
section('Main-thread replay of the same processor class', [quantumHeader, ...byThrottle.flatMap(result => (result.replay as Run[]).map(run => quantumRow(run, result.throttle ?? 1)))]);
section('Offline, analyzeFullBuffer at 44.1 kHz', [
  '| engine | clip | throttle | first call ms per audio s | median ms per audio s | calls | top tempo |\n|---|---:|---|---:|---:|---:|---:|',
  ...byThrottle.flatMap(result => (result.offline ?? []).map(run => `| ${run.engine} | ${run.seconds} s | ${result.throttle ?? 1}x | ${ms(run.timesMs[0] / run.seconds)} | ${ms(median(run.timesMs) / run.seconds)} | ${run.timesMs.length} | ${run.tempo?.toFixed(1) ?? 'none'} |`)),
]);

const heapRow = (label: string, engine: string, heap: Heap | undefined) => {
  if (!heap || heap.length === 0) {
    return `| ${engine} | ${label} | not exposed | | | |`;
  }

  const used = heap.map(sample => sample.usedBytes);

  return `| ${engine} | ${label} | ${heap.length} | ${mib(used[0])} at ${heap[0].seconds} s | ${mib(used.at(-1)!)} at ${heap.at(-1)!.seconds} s | ${mib(Math.max(...used))} |`;
};

section('Memory, heap after a forced GC, 44.1 kHz', [
  '| engine | where | samples | first MiB | last MiB | max MiB |\n|---|---|---:|---:|---:|---:|',
  ...results.filter(result => result.suite === 'memory').flatMap(result => {
    const realtime = result.realtime as Run;
    const replay = result.replay as Run;

    return [
      heapRow(`AudioWorklet isolate, realtime ${realtime.seconds} s`, realtime.engine, result.workletHeap),
      heapRow(`main-thread replay ${replay.seconds} s`, replay.engine, replay.heap),
    ];
  }),
]);

section('Memory runs, realtime timing over the whole run', [quantumHeader, ...results.filter(result => result.suite === 'memory').map(result => quantumRow(result.realtime as Run, 1))]);

const sizes = results.find(result => result.suite === 'bundle');

if (sizes?.with && sizes.without) {
  section('Bundle, minified, gzip -9 (bytes)', [
    '| bundle | minified | gzip | without tempogram, minified | without, gzip | added, minified | added, gzip | tempogram.ts bytes in output |\n|---|---:|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(sizes.with).map(([name, size]) => {
      const without = sizes.without![name];

      return `| ${name} | ${size.minified} | ${size.gzip} | ${without.minified} | ${without.gzip} | ${size.minified - without.minified} | ${size.gzip - without.gzip} | ${size.tempogramModuleBytes} |`;
    }),
  ]);
}

const targets = results.find(result => result.targets)?.targets;

if (targets) {
  console.log(`\nDevTools targets seen during the memory run: ${targets.join('; ')}`);
}
