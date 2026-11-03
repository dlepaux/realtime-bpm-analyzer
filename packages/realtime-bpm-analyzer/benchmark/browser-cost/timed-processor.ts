import type {RealTimeBpmProcessor} from '../../src/processor/realtime-bpm-processor';
import {PROTOCOL_VERSION} from '../../src/contract/types';
import type {EngineName, PostedWorkletMessage} from '../../src/contract/types';
import {resolveEngine} from '../../src/core/engine';
import type {ProcessorOptions} from '../../src/core/session';

/** Name the worklet registers the timed processor under */
export const timedProcessorName = 'timed-bpm-processor';

/** A quantum that only fed the aggregator, one that ran an analysis, and one whose analysis gave a reading */
export const quantumKind = {plain: 0, analysis: 1, reading: 2} as const;

/** Quanta recorded one by one: 68 s at 48 kHz. Later quanta still count in the totals and the maximum. */
export const recordCapacity = 1 << 15;

/** Audio minutes the per-minute totals cover */
export const minuteBuckets = 64;

export type TimingDump = {
  clock: string;
  // Milliseconds spent per audio minute, from the first quantum: shows a cost that grows with the run
  minuteMs: number[];
  quanta: number;
  recorded: number;
  costs: Float64Array;
  kinds: Uint8Array;
  analyses: number;
  analysisCosts: Float64Array;
  totalMs: number;
  maxMs: number;
  // Analyses still running when the next quantum began: their cost spilled past their own quantum
  spilled: number;
  errors: number;
  lastBpm: number | null;
};

type HarnessMessage = {data?: {type?: string}};

/**
 * The processor options createRealtimeBpmAnalyzer hands the worklet for this engine, at its defaults
 * @param engine - Engine to time
 * @returns The validated options
 */
export function harnessOptions(engine: EngineName): ProcessorOptions {
  return {...resolveEngine(engine, undefined), debug: false, liveInput: false, protocol: PROTOCOL_VERSION};
}

/**
 * Subclass of the library's own processor that times each render quantum, without changing what it does.
 * The analysis is async but awaits nothing outside the audio thread, so it finishes in the microtask
 * checkpoint after `process()` returns: a quantum that starts one is timed until it settles.
 * @param Base - The library's processor class, as loaded in this realm
 * @param now - Clock in milliseconds
 * @param clock - Name of that clock, for the report
 * @returns The timed class
 */
export function timedProcessor(Base: typeof RealTimeBpmProcessor, now: () => number, clock: string) {
  return class TimedBpmProcessor extends Base {
    costs = new Float64Array(recordCapacity);
    minuteMs = new Float64Array(minuteBuckets);
    framesPerMinute = 60 * (globalThis as unknown as {sampleRate: number}).sampleRate;
    kinds = new Uint8Array(recordCapacity);
    analysisCosts = new Float64Array(recordCapacity);
    quanta = 0;
    analyses = 0;
    totalMs = 0;
    maxMs = 0;
    spilled = 0;
    errors = 0;
    lastBpm: number | null = null;
    calls = 0;
    quantumStart = 0;
    analysisThisQuantum = false;
    readingThisAnalysis = false;
    pending: Promise<void> | null = null;

    constructor(options: ConstructorParameters<typeof RealTimeBpmProcessor>[0]) {
      super(options);
      this.wrapAnalysis();
      this.wrapPort();
    }

    wrapAnalysis(): void {
      const session = this.session;
      if (session === null) {
        throw new Error('The processor refused its options: the harness has nothing to time');
      }

      this.session = {
        ...session,
        analyze: (...args: Parameters<typeof session.analyze>) => {
          const call = this.calls;
          const quantumStart = this.quantumStart;
          const start = now();

          this.analysisThisQuantum = true;
          const analysis = session.analyze(...args);
          // The processor posts the step's messages in its own callback, which runs after this one, so whether the
          // step gave a reading is read off the messages it returns, not off the port. The time ends there, so it
          // leaves out the posting
          this.pending = analysis.then(messages => {
            this.readingThisAnalysis = messages.some(message => message.type === 'step' && message.status !== 'listening');
          }, () => {
            this.readingThisAnalysis = false;
          }).finally(() => {
            const end = now();

            this.analysisCosts[this.analyses % recordCapacity] = end - start;
            this.analyses += 1;

            if (this.calls !== call) {
              this.spilled += 1;
            }

            this.record(end - quantumStart, this.readingThisAnalysis ? quantumKind.reading : quantumKind.analysis);
          });

          return analysis;
        },
      };
    }

    wrapPort(): void {
      const port = this.port;
      const post = port.postMessage.bind(port);

      port.postMessage = (event: PostedWorkletMessage) => {
        if (event.type === 'step' && event.status !== 'listening') {
          this.lastBpm = event.reading.bpm;
        }

        if (event.type === 'fault') {
          this.errors += 1;
        }

        post(event);
      };

      port.addEventListener('message', (event: HarnessMessage) => {
        if (event.data?.type === 'timing-dump') {
          (port as MessagePort).postMessage({type: 'timing', data: this.dump()});
        }
      });
    }

    record(cost: number, kind: number): void {
      if (this.quanta < recordCapacity) {
        this.costs[this.quanta] = cost;
        this.kinds[this.quanta] = kind;
      }

      this.minuteMs[Math.min(minuteBuckets - 1, Math.floor((this.quanta * 128) / this.framesPerMinute))] += cost;
      this.quanta += 1;
      this.totalMs += cost;
      this.maxMs = Math.max(this.maxMs, cost);
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
      this.calls += 1;
      this.quantumStart = now();
      this.analysisThisQuantum = false;

      const keepAlive = super.process(inputs, outputs, parameters);

      if (!this.analysisThisQuantum) {
        this.record(now() - this.quantumStart, quantumKind.plain);
      }

      return keepAlive;
    }

    dump(): TimingDump {
      return {
        clock,
        minuteMs: [...this.minuteMs.subarray(0, Math.ceil((this.quanta * 128) / this.framesPerMinute))],
        quanta: this.quanta,
        recorded: Math.min(this.quanta, recordCapacity),
        costs: this.costs.slice(0, Math.min(this.quanta, recordCapacity)),
        kinds: this.kinds.slice(0, Math.min(this.quanta, recordCapacity)),
        analyses: this.analyses,
        analysisCosts: this.analysisCosts.slice(0, Math.min(this.analyses, recordCapacity)),
        totalMs: this.totalMs,
        maxMs: this.maxMs,
        spilled: this.spilled,
        errors: this.errors,
        lastBpm: this.lastBpm,
      };
    }
  };
}
