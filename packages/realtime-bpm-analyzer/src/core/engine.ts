import type {
  AudioSpan,
  Candidate,
  EngineName,
  EngineOption,
  OfflineEngineOption,
  Reading,
  TempoRange,
} from '../contract/types';
import {relationTo} from '../contract/transitions';
import {resolveTempoRange} from './tempo';
import {createTempogramDetector, defaultTempogramRange} from './tempogram';
import type {TempogramTuning} from './tempogram';
import {PeaksEngine} from './peaks-engine';
import type {BiquadFilterOptions, Tempo} from './types';

/** What one engine measured in one analysis step, before the tracker turns it into a status */
export type EngineStep = {
  /** False when this buffer completed no measurement (the tempogram reads every 0.5 s): only progress is new */
  readonly fresh: boolean;
  /** Best first, empty when there is no reading */
  readonly candidates: readonly Tempo[];
  /** Where the reading's audio begins, in seconds since the engine (re)started */
  readonly from: number;
  readonly pulse: boolean;
  readonly lockOffered: boolean;
  /** From 0 to 1, toward the first reading */
  readonly progress: number;
  /** Engine detail for `debug`, undefined when debug is off */
  readonly debug: unknown;
};

export type Engine = {
  readonly name: EngineName;
  readonly analyze: (channelData: Float32Array, bufferSize: number, sampleRate: number) => Promise<EngineStep>;
  /** Discards the history */
  readonly restart: () => void;
  /**
   * The tracker gave up a reading while the history stays (`pulse-lost`, or `unlocked` on a tempo change): the
   * engine must offer a lock again, even where its own rule would only offer the next one higher up
   */
  readonly onReadingLost: () => void;
};

/** The realtime engine settings, validated, as the worklet receives them */
export type ResolvedEngine = {
  readonly name: EngineName;
  readonly restartAfterSeconds?: number;
  /** Internal: tempogram overrides for the benchmark's tuning runs. No public option sets it. */
  readonly tuning?: Partial<TempogramTuning>;
};

/**
 * The engine when the caller names none, realtime and offline. RBA-51 DECISION 2026-11-03: the tempogram with its
 * 5.5.0 settings, after it passed the held-out look; `engine: 'peaks'` is the way back.
 */
export const defaultEngine: EngineName = 'tempogram';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * The 5.x option names v6 removed, with what replaces each. v6 would otherwise ignore them without a word, and
 * `{detector: 'tempogram'}` would quietly run peaks.
 */
const removedOptions: Readonly<Record<string, string>> = Object.freeze({
  detector: "use engine: 'peaks' or 'tempogram'",
  continuousAnalysis: "use engine: {name: 'peaks', restartAfterSeconds}",
  stabilizationTime: "use engine: {name: 'peaks', restartAfterSeconds}",
  muteTimeInIndexes: 'it has no replacement: remove it',
  tempogramMode: "use engine: {name: 'tempogram', mode}",
  frequencyValue: "use engine: {name: 'peaks', lowpass: {frequency}}",
  qualityValue: "use engine: {name: 'peaks', lowpass: {q}}",
});

/**
 * Refuses the option names 5.x knew and v6 removed, naming the replacement
 * @param options The caller's options, realtime or offline
 * @throws {TypeError} When one of them is set
 */
export function assertNoRemovedOptions(options: unknown): void {
  if (!isRecord(options)) {
    return;
  }

  const name = Object.keys(removedOptions).find(key => options[key] !== undefined);
  if (name !== undefined) {
    throw new TypeError(`The option ${name} was removed in v6: ${removedOptions[name]}.`);
  }
}

/**
 * Validates the realtime `engine` and `tempoRange` options together, on the main thread: a throw inside the
 * worklet would not reach the caller.
 * @param engine The caller's option, {@link defaultEngine} when absent
 * @param tempoRange The caller's range
 * @returns The engine and the range to run with
 * @throws {RangeError} When the engine, its settings or the range are invalid, or contradict the tempogram's mode
 */
export function resolveEngine(engine: EngineOption | undefined, tempoRange: TempoRange | undefined): {engine: ResolvedEngine; tempoRange: TempoRange} {
  const range = resolveTempoRange(tempoRange);
  const value: unknown = engine ?? defaultEngine;

  if (value === 'peaks' || value === 'tempogram') {
    return {engine: {name: value}, tempoRange: range};
  }

  if (!isRecord(value) || (value.name !== 'peaks' && value.name !== 'tempogram')) {
    throw new RangeError(`Invalid engine: ${JSON.stringify(value)}. Use 'peaks' or 'tempogram'.`);
  }

  if (value.name === 'peaks') {
    const {restartAfterSeconds} = value;
    if (restartAfterSeconds === undefined) {
      return {engine: {name: 'peaks'}, tempoRange: range};
    }

    if (typeof restartAfterSeconds !== 'number' || !Number.isFinite(restartAfterSeconds) || restartAfterSeconds <= 0) {
      throw new RangeError(`Invalid engine.restartAfterSeconds: ${JSON.stringify(restartAfterSeconds)}. Use a positive number of seconds.`);
    }

    return {engine: {name: 'peaks', restartAfterSeconds}, tempoRange: range};
  }

  const {mode} = value;
  if (mode !== undefined && mode !== 'extension') {
    throw new RangeError(`Invalid engine.mode: ${JSON.stringify(mode)}. Use 'extension'.`);
  }

  // The mode changes no setting: it holds the caller to the range that was measured (RBA-51)
  const {min, max} = defaultTempogramRange;
  if (mode === 'extension' && tempoRange !== undefined && (range.min !== min || range.max !== max)) {
    throw new RangeError(`engine mode 'extension' searches ${min} to ${max} BPM, and tempoRange asks for another range.`);
  }

  return {engine: {name: 'tempogram'}, tempoRange: range};
}

/**
 * Validates the offline `engine` option
 * @param engine The caller's option, {@link defaultEngine} when absent
 * @returns The engine name, and the lowpass settings for `peaks`
 * @throws {RangeError} When the engine is unknown
 */
export function resolveOfflineEngine(engine: OfflineEngineOption | undefined): {name: EngineName; lowpass: BiquadFilterOptions} {
  const value: unknown = engine ?? defaultEngine;

  if (value === 'peaks' || value === 'tempogram') {
    return {name: value, lowpass: {}};
  }

  if (!isRecord(value) || value.name !== 'peaks') {
    throw new RangeError(`Invalid engine: ${JSON.stringify(value)}. Use 'peaks', 'tempogram' or {name: 'peaks', lowpass}.`);
  }

  const lowpass: unknown = value.lowpass ?? {};
  if (!isRecord(lowpass)) {
    throw new RangeError('Invalid engine.lowpass: use {frequency?, q?}.');
  }

  // The lowpass itself validates the numbers, with the messages it always gave
  return {name: 'peaks', lowpass: {frequencyValue: lowpass.frequency as number | undefined, qualityValue: lowpass.q as number | undefined}};
}

/**
 * Creates the engine the worklet runs
 * @param engine The validated engine settings
 * @param tempoRange The validated range
 * @param debug Whether to fill `EngineStep.debug`
 * @returns The engine
 */
export function createEngine(engine: ResolvedEngine, tempoRange: TempoRange, debug: boolean): Engine {
  if (engine.name === 'peaks') {
    const peaks = new PeaksEngine({tempoRange, restartAfterSeconds: engine.restartAfterSeconds, debug});
    return {
      name: 'peaks',
      analyze: async (channelData, bufferSize, sampleRate) => peaks.analyze(channelData, bufferSize, sampleRate),
      restart: () => {
        peaks.reset();
      },
      onReadingLost: () => {
        peaks.onReadingLost();
      },
    };
  }

  let detector: ReturnType<typeof createTempogramDetector> | undefined;
  return {
    name: 'tempogram',
    async analyze(channelData, _bufferSize, sampleRate) {
      // Made on the first buffer, the first time the sample rate is known
      detector ??= createTempogramDetector({sampleRate, tempoRange, tuning: engine.tuning});
      const reading = detector.process(channelData);
      const candidates = reading?.candidates ?? [];
      return {
        fresh: reading !== null,
        candidates,
        from: 0,
        pulse: candidates.length > 0,
        lockOffered: reading?.isStable ?? false,
        progress: detector.progress(),
        // frameTempo and leads let the benchmark replay the stable rule for other lock bands (RBA-106)
        debug: debug && reading ? {candidates, stable: reading.isStable, frameTempo: reading.frameTempo, leads: reading.leads} : undefined,
      };
    },
    restart: () => {
      detector?.reset();
    },
    onReadingLost: () => undefined,
  };
}

/**
 * The public reading for an engine's candidates: the one function realtime and offline both go through, so the
 * two report the same fields the same way.
 * @param tempos The engine's candidates, best first
 * @param audio The audio they cover
 * @param engine The engine that measured them
 * @returns The frozen reading, or null when there is no candidate
 */
export function toReading(tempos: readonly Tempo[], audio: AudioSpan, engine: EngineName): Reading | null {
  const top = tempos[0];
  if (top === undefined) {
    return null;
  }

  const candidates: Candidate[] = tempos.slice(0, 5).map((tempo, index) => Object.freeze({
    bpm: tempo.tempo,
    relation: index === 0 ? 'top' : relationTo(top.tempo, tempo.tempo),
  }));

  return Object.freeze({
    bpm: top.tempo,
    bpmExact: top.exact,
    confidence: Math.min(1, Math.max(0, top.confidence)),
    candidates: Object.freeze(candidates),
    audio: Object.freeze({from: audio.from, to: audio.to, contextTime: audio.contextTime}),
    engine,
  });
}
