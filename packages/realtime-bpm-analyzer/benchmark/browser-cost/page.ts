// Page entry, driven by run.ts through puppeteer
import {installWorkletShim} from './page-shim';
import {analyzeFullBuffer, getBiquadFilter} from '../../src/core/offline-pipeline';
import {applyLowpass} from '../../src/core/lowpass';
import type {EngineName} from '../../src/contract/types';
import {harnessOptions, timedProcessor, timedProcessorName, quantumKind, type TimingDump} from './timed-processor';
import {drumMix} from './signal';
import {ofKinds, quantumBudgetMs, quantumFrames, summarise, type Summary} from './stats';

/** Seconds of generated audio, looped for longer runs */
const loopSeconds = 30;

export type RunOptions = {engine: EngineName; sampleRate: number; seconds: number};

export type QuantumReport = {
  clock: string;
  minuteMs: number[];
  quanta: number;
  recorded: number;
  budgetMs: number;
  all: Summary | null;
  plain: Summary | null;
  analysis: Summary | null;
  reading: Summary | null;
  analysisStep: Summary | null;
  meanShare: number;
  overBudget: number;
  totalMs: number;
  maxMs: number;
  spilled: number;
  errors: number;
  lastBpm: number | null;
};

export type PlayoutStats = Record<string, number> | null;

declare global {
  interface Window {
    bench: typeof bench;
    // Exposed by run.ts: collects garbage and reads the page's heap through the DevTools Protocol
    heapSample?: () => Promise<number>;
  }
}

function report(dump: TimingDump, sampleRate: number): QuantumReport {
  const budgetMs = quantumBudgetMs(sampleRate);
  let overBudget = 0;

  for (const cost of dump.costs) {
    overBudget += cost > budgetMs ? 1 : 0;
  }

  return {
    clock: dump.clock,
    minuteMs: dump.minuteMs,
    quanta: dump.quanta,
    recorded: dump.recorded,
    budgetMs,
    all: summarise(dump.costs, dump.recorded),
    plain: summarise(ofKinds(dump.costs, dump.kinds, dump.recorded, [quantumKind.plain])),
    analysis: summarise(ofKinds(dump.costs, dump.kinds, dump.recorded, [quantumKind.analysis, quantumKind.reading])),
    reading: summarise(ofKinds(dump.costs, dump.kinds, dump.recorded, [quantumKind.reading])),
    analysisStep: summarise(dump.analysisCosts),
    meanShare: dump.quanta === 0 ? 0 : (dump.totalMs / dump.quanta) / budgetMs,
    overBudget,
    totalMs: dump.totalMs,
    maxMs: dump.maxMs,
    spilled: dump.spilled,
    errors: dump.errors,
    lastBpm: dump.lastBpm,
  };
}

function playout(context: AudioContext): PlayoutStats {
  const stats = (context as AudioContext & {playoutStats?: Record<string, unknown>}).playoutStats;

  if (!stats) {
    return null;
  }

  const fields = ['fallbackFramesDuration', 'fallbackFramesEvents', 'totalFramesDuration', 'averageLatency', 'minimumLatency', 'maximumLatency'];

  return Object.fromEntries(fields.filter(field => typeof stats[field] === 'number').map(field => [field, stats[field] as number]));
}

function requestDump(node: AudioWorkletNode): Promise<TimingDump> {
  return new Promise(resolve => {
    node.port.addEventListener('message', (event: MessageEvent<{type?: string; data?: TimingDump}>) => {
      if (event.data?.type === 'timing' && event.data.data) {
        resolve(event.data.data);
      }
    });
    node.port.start();
    node.port.postMessage({type: 'timing-dump'});
  });
}

const sleep = (ms: number) => new Promise(resolve => {
  setTimeout(resolve, ms);
});

/**
 * The library's processor in a real AudioWorklet, wired as createRealtimeBpmAnalyzer wires it: the
 * peaks engine behind the native lowpass, the tempogram on the full band. The output goes through a
 * zero gain, and the browser runs with --mute-audio.
 * @param options - Engine, rate and seconds
 * @returns Timings from inside the worklet, and the context's playout statistics when it has them
 */
async function realtime({engine, sampleRate, seconds}: RunOptions) {
  const context = new AudioContext({sampleRate, latencyHint: 'interactive'});

  await context.audioWorklet.addModule('/worklet.js');

  const node = new AudioWorkletNode(context, timedProcessorName, {processorOptions: harnessOptions(engine)});
  const source = new AudioBufferSourceNode(context, {loop: true});
  const pcm = drumMix(sampleRate, loopSeconds);
  const buffer = new AudioBuffer({length: pcm.length, sampleRate, numberOfChannels: 1});
  const mute = new GainNode(context, {gain: 0});

  buffer.copyToChannel(pcm, 0);
  source.buffer = buffer;
  (engine === 'peaks' ? source.connect(getBiquadFilter(context)) : source).connect(node);
  node.connect(mute).connect(context.destination);
  await context.resume();

  const before = playout(context);
  const wallStart = performance.now();

  source.start();
  await sleep(seconds * 1000);

  const dump = await requestDump(node);
  const after = playout(context);
  const wallSeconds = (performance.now() - wallStart) / 1000;
  const {baseLatency, outputLatency} = context;

  source.stop();
  await context.close();

  return {engine, sampleRate, seconds, wallSeconds, baseLatency, outputLatency, playoutBefore: before, playoutAfter: after, ...report(dump, sampleRate)};
}

/**
 * The same timed processor class on the page's main thread, which CPU throttling reaches. Fed the
 * quanta back to back as fast as it runs; the peaks engine gets the JS lowpass the benchmark uses in
 * place of the native one, outside the timing.
 * @param options - Engine, rate and seconds
 * @param heapEverySeconds - Audio seconds between heap samples, 0 for none
 * @returns Timings, and the heap samples
 */
async function replay({engine, sampleRate, seconds}: RunOptions, heapEverySeconds = 0) {
  installWorkletShim();
  (globalThis as unknown as {sampleRate: number}).sampleRate = sampleRate;

  // Loaded after the shim, which it reads when it loads
  const {RealTimeBpmProcessor} = await import('../../src/processor/realtime-bpm-processor');
  const Processor = timedProcessor(RealTimeBpmProcessor, () => performance.now(), 'performance.now, main thread');
  const processor = new Processor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: harnessOptions(engine)});
  const loopFrames = Math.floor((loopSeconds * sampleRate) / quantumFrames) * quantumFrames;
  const generated = drumMix(sampleRate, loopSeconds).subarray(0, loopFrames);
  const pcm = engine === 'peaks' ? applyLowpass(generated, sampleRate) : generated;
  const quanta = Math.round((seconds * sampleRate) / quantumFrames);
  const output = [[new Float32Array(quantumFrames)]];
  const heap: Array<{seconds: number; usedBytes: number}> = [];
  const wallStart = performance.now();

  for (let q = 0; q < quanta; q += 1) {
    const offset = (q * quantumFrames) % loopFrames;

    processor.process([[pcm.subarray(offset, offset + quantumFrames)]], output, {});

    if (processor.pending) {
      await processor.pending;
      processor.pending = null;
      // Lets the processor's own `finally` clear its in-progress flag before the next buffer fills
      await Promise.resolve();
      await Promise.resolve();
    }

    const second = Math.floor(((q + 1) * quantumFrames) / sampleRate);

    if (second !== Math.floor((q * quantumFrames) / sampleRate)) {
      // A task boundary each audio second drains the posted events
      await sleep(0);

      if (heapEverySeconds > 0 && second % heapEverySeconds === 0 && window.heapSample) {
        heap.push({seconds: second, usedBytes: await window.heapSample()});
      }
    }
  }

  const wallSeconds = (performance.now() - wallStart) / 1000;

  return {engine, sampleRate, seconds, wallSeconds, heap, ...report(processor.dump(), sampleRate)};
}

/**
 * analyzeFullBuffer on a generated clip, timed from the call to the answer
 * @param options - Engine, rate and clip length
 * @param repeats - Calls, the first one carries the JIT warm-up
 * @returns Each call's wall time and the top tempo
 */
async function offline({engine, sampleRate, seconds}: RunOptions, repeats: number) {
  const pcm = drumMix(sampleRate, seconds);
  const buffer = new AudioBuffer({length: pcm.length, sampleRate, numberOfChannels: 1});
  const timesMs: number[] = [];
  let tempo: number | null = null;

  buffer.copyToChannel(pcm, 0);

  for (let r = 0; r < repeats; r += 1) {
    const start = performance.now();
    const reading = await analyzeFullBuffer(buffer, {engine});

    timesMs.push(performance.now() - start);
    tempo = reading?.bpm ?? null;
  }

  return {engine, sampleRate, seconds, timesMs, tempo};
}

function probe() {
  return {
    userAgent: navigator.userAgent,
    crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    hasPlayoutStats: 'playoutStats' in AudioContext.prototype,
    hasRenderCapacity: 'renderCapacity' in AudioContext.prototype,
  };
}

const bench = {realtime, replay, offline, probe};

window.bench = bench;
