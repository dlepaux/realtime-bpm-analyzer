import type {
  AudioSpan,
  Candidate,
  EngineName,
  EngineOption,
  LowpassOption,
  OfflineEngineOption,
  Reading,
  TempoRange,
} from '../contract/types';
import {relationTo} from '../contract/transitions';
import {calibrate} from './calibration';
import {resolveTempoRange} from './tempo';
import {createTempogramDetector, defaultTempogramRange} from './tempogram';
import type {TempogramTuning} from './tempogram';
import {PeaksEngine} from './peaks-engine';
import {kindOf, resolveLowpass} from './lowpass';
import type {Tempo} from './types';
import * as consts from './consts';

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
 * The engine when the caller names none, realtime and offline: the tempogram with its 5.5.0 settings, since
 * 2026-11-03, after it passed the benchmark's held-out look; `engine: 'peaks'` is the way back.
 */
export const defaultEngine: EngineName = 'tempogram';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Why a realtime lowpass is refused, as an engine setting or as an option, and what to do instead */
const refusedRealtimeLowpass = 'the realtime analyzer takes none. Realtime peaks has a fixed lowpass inside analyzer.input; for '
  + 'another, connect getBiquadFilter(audioContext, {frequency, q}) to analyzer.node. Only analyzeFullBuffer and '
  + 'analyzeChannelData take engine.lowpass';

/**
 * The 5.x option names v6 removed, with what replaces each. v6 would otherwise ignore them without a word, and
 * `{detector: 'tempogram'}` would quietly run peaks. A map, not a record, so a key such as `constructor` finds nothing.
 */
const removedOptions: ReadonlyMap<string, string> = new Map([
  ['detector', "use engine: 'peaks' or 'tempogram'"],
  ['continuousAnalysis', "use engine: {name: 'peaks', restartAfterSeconds}"],
  ['stabilizationTime', "use engine: {name: 'peaks', restartAfterSeconds}"],
  ['muteTimeInIndexes', 'it has no replacement: remove it'],
  ['tempogramMode', "use engine: {name: 'tempogram', mode: 'measured'}"],
  ['frequencyValue', "with analyzeFullBuffer or analyzeChannelData, use engine: {name: 'peaks', lowpass: {frequency}}. Only they take one: realtime peaks has a fixed lowpass inside analyzer.input"],
  ['qualityValue', "with analyzeFullBuffer or analyzeChannelData, use engine: {name: 'peaks', lowpass: {q}}. Only they take one: realtime peaks has a fixed lowpass inside analyzer.input"],
]);

/**
 * The top-level options each function takes: `createRealtimeBpmAnalyzer`, then `analyzeFullBuffer` and
 * `analyzeChannelData`. The one list {@link assertOptions} checks, which tests/types/public-surface.ts holds equal to
 * the keys of `AnalyzerOptions` and `OfflineOptions`. Any other key throws a `TypeError` that names it,
 * whatever its value, as `engine` and the lowpass settings do (RBA-108's DECISION of 2026-11-16): refusing a key
 * after 6.1.0 would break callers, while accepting one later would not.
 */
export const optionKeys = Object.freeze({
  realtime: Object.freeze(['engine', 'tempoRange', 'processorUrl', 'liveInput', 'debug'] as const),
  offline: Object.freeze(['engine', 'tempoRange'] as const),
});

/** An engine setting given at the top level, where to put it, by function. Any other key gets the list of options. */
const misplacedOptions: Readonly<Record<keyof typeof optionKeys, ReadonlyMap<string, string>>> = Object.freeze({
  realtime: new Map([
    ['lowpass', refusedRealtimeLowpass],
    ['restartAfterSeconds', "it is a setting of peaks, given as engine: {name: 'peaks', restartAfterSeconds}"],
    ['mode', "it is a setting of the tempogram, given as engine: {name: 'tempogram', mode: 'measured'}"],
  ]),
  offline: new Map([
    ['lowpass', "it is a setting of peaks, given as engine: {name: 'peaks', lowpass}"],
    ['processorUrl', 'only createRealtimeBpmAnalyzer takes it'],
    ['liveInput', 'only createRealtimeBpmAnalyzer takes it'],
    ['debug', 'only createRealtimeBpmAnalyzer takes it, since whole-buffer analysis emits no events'],
  ]),
});

/**
 * The keys each engine's object form takes, realtime and offline: the one list the resolvers check, which
 * tests/types/public-surface.ts holds equal to the keys of {@link EngineOption} and {@link OfflineEngineOption}, so
 * the types and the checks can't drift. Any other key throws a `TypeError` that names it, whatever its value, as the
 * lowpass settings do: refusing a key after 6.1.0 would break callers, while accepting one later would not.
 */
export const engineKeys = Object.freeze({
  realtime: Object.freeze({
    peaks: Object.freeze(['name', 'restartAfterSeconds'] as const),
    tempogram: Object.freeze(['name', 'mode'] as const),
  }),
  offline: Object.freeze({
    peaks: Object.freeze(['name', 'lowpass'] as const),
  }),
});

/**
 * What to use instead of a key a caller is likely to reach for, by where it was passed. Any other key, a typo
 * included, gets the settings that engine takes. Maps, not records, so a key such as `constructor` finds nothing.
 */
const refusedEngineKeys: Readonly<Record<keyof typeof engineKeys, ReadonlyMap<string, string>>> = Object.freeze({
  realtime: new Map([
    ['lowpass', refusedRealtimeLowpass],
    ['restartAfterSeconds', "only peaks takes it: the tempogram's memory of past tempos fades on its own, so it follows a tempo change"],
    ['mode', 'only the tempogram takes it'],
  ]),
  offline: new Map([
    ['restartAfterSeconds', 'whole-buffer analysis has no stream to follow: it analyses the buffer in one call, so nothing restarts'],
    ['mode', 'only the realtime tempogram takes it'],
  ]),
});

/**
 * Refuses any own key of an engine object outside that engine's set, so a setting the engine would not apply fails at
 * once instead of being dropped. The keys checked are those `Object.keys` lists, as for the lowpass settings.
 * @param value The caller's engine object
 * @param path Realtime or whole-buffer analysis
 * @param allowed The keys that engine takes there, `name` first
 * @throws {TypeError} Naming the first key outside `allowed`
 */
function assertEngineKeys(value: Readonly<Record<string, unknown>>, path: keyof typeof engineKeys, allowed: readonly string[]): void {
  const refused = Object.keys(value).find(key => !allowed.includes(key));
  if (refused === undefined) {
    return;
  }

  const settings = allowed.filter(key => key !== 'name');
  const where = path === 'realtime' ? 'Realtime' : 'Whole-buffer';
  const advice = refusedEngineKeys[path].get(refused) ?? `it takes only ${settings.join(' and ')}`;
  throw new TypeError(`${where} engine ${String(value.name)} takes no setting ${refused}: ${advice}.`);
}

/**
 * Refuses the option names 5.x knew and v6 removed, naming the replacement. The name's presence is the error,
 * whatever its value, as for every other refused key: `{detector: undefined}` too.
 * @param options The caller's options, realtime or offline
 * @throws {TypeError} When one of them is an own key
 */
export function assertNoRemovedOptions(options: unknown): void {
  if (!isRecord(options)) {
    return;
  }

  const name = Object.keys(options).find(key => removedOptions.has(key));
  if (name !== undefined) {
    throw new TypeError(`The option ${name} was removed in v6: ${removedOptions.get(name)}.`);
  }
}

/**
 * Checks the shape of the caller's top-level options, before any value: the 5.x names first, so their messages
 * win, then any own key outside {@link optionKeys}. `null` and `undefined` mean no options.
 * @param options The caller's options
 * @param path `createRealtimeBpmAnalyzer`, or whole-buffer analysis
 * @throws {TypeError} When the options are not an object, carry a 5.x name, or carry a key the function does not take
 */
export function assertOptions(options: unknown, path: keyof typeof optionKeys): void {
  if (options === undefined || options === null) {
    return;
  }

  if (!isRecord(options) || Array.isArray(options)) {
    throw new TypeError(`The options are an object, not ${kindOf(options)}.`);
  }

  assertNoRemovedOptions(options);
  const allowed: readonly string[] = optionKeys[path];
  const refused = Object.keys(options).find(key => !allowed.includes(key));
  if (refused === undefined) {
    return;
  }

  const where = path === 'realtime' ? 'createRealtimeBpmAnalyzer takes' : 'analyzeFullBuffer and analyzeChannelData take';
  const listed = `${allowed.slice(0, -1).join(', ')} and ${allowed[allowed.length - 1]}`;
  const advice = misplacedOptions[path].get(refused) ?? `${path === 'realtime' ? 'its' : 'their'} options are ${listed}`;
  throw new TypeError(`${where} no option ${refused}: ${advice}.`);
}

/**
 * Validates the realtime `engine` and `tempoRange` options together, on the main thread: a throw inside the
 * worklet would not reach the caller.
 * @param engine The caller's option, {@link defaultEngine} when absent
 * @param tempoRange The caller's range
 * @returns The engine and the range to run with
 * @throws {RangeError} When the engine, its settings or the range are invalid, or contradict the tempogram's mode
 * @throws {TypeError} When the engine object carries a key outside {@link engineKeys}`.realtime` for its name
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

  assertEngineKeys(value, 'realtime', engineKeys.realtime[value.name]);
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
  if (mode !== undefined && mode !== 'measured') {
    throw new RangeError(`Invalid engine.mode: ${JSON.stringify(mode)}. Use 'measured'.`);
  }

  // The mode changes no setting: it holds the caller to the range that was measured
  const {min, max} = defaultTempogramRange;
  if (mode === 'measured' && tempoRange !== undefined && (range.min !== min || range.max !== max)) {
    throw new RangeError(`engine mode 'measured' searches ${min} to ${max} BPM, and tempoRange asks for another range.`);
  }

  return {engine: {name: 'tempogram'}, tempoRange: range};
}

/**
 * Validates the offline `engine` option
 * @param engine The caller's option, {@link defaultEngine} when absent
 * @param sampleRate The rate of the samples, which bounds the lowpass frequency
 * @returns The engine name, and the lowpass settings for `peaks`
 * @throws {RangeError} When the engine is unknown, the sample rate is under 2 Hz for `peaks`, or a lowpass value is out
 * of range (see {@link resolveLowpass})
 * @throws {TypeError} When the engine object carries a key other than `name` and `lowpass`, or `lowpass` is not an
 * object, `null` or `undefined`, carries a key other than `frequency` and `q`, or holds a setting that is not a number
 */
export function resolveOfflineEngine(
  engine: OfflineEngineOption | undefined,
  sampleRate: number,
): {name: EngineName; lowpass: LowpassOption} {
  const value: unknown = engine ?? defaultEngine;

  if (value === 'tempogram') {
    return {name: value, lowpass: {}};
  }

  if (value === 'peaks') {
    assertPeaksSampleRate(sampleRate);
    return {name: value, lowpass: {}};
  }

  if (!isRecord(value) || value.name !== 'peaks') {
    throw new RangeError(`Invalid engine: ${JSON.stringify(value)}. Use 'peaks', 'tempogram' or {name: 'peaks', lowpass}.`);
  }

  assertEngineKeys(value, 'offline', engineKeys.offline.peaks);
  // Checked here, before the costly filtering, with the same rules every lowpass path applies. The floor comes after,
  // so a call with a lowpass fault fails on it first, as in 6.1.0
  const {lowpass} = value;
  resolveLowpass(lowpass, sampleRate);
  assertPeaksSampleRate(sampleRate);
  const settings = (lowpass ?? {}) as LowpassOption;
  return {name: 'peaks', lowpass: {frequency: settings.frequency, q: settings.q}};
}

/**
 * The peaks engine's own floor, checked before the costly filtering. The search itself refuses the same rates (see
 * `findPeaksAtThreshold`), so this only makes the error come first.
 * @param sampleRate The rate of the samples
 * @throws {RangeError} When the rate is under {@link consts.peaksMinSampleRate}, `NaN` included
 */
function assertPeaksSampleRate(sampleRate: number): void {
  if (!(sampleRate >= consts.peaksMinSampleRate)) {
    throw new RangeError(
      `Invalid sample rate: ${sampleRate}. The peaks engine needs at least ${consts.peaksMinSampleRate} Hz, `
        + 'where the skip after a peak is a whole sample.',
    );
  }
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
        // frameTempo and leads let the benchmark replay the stable rule for other lock bands
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
 * @param tempoRange The resolved range the analysis ran on, which decides whether the confidence was measured
 * @returns The frozen reading, or null when there is no candidate
 */
export function toReading(tempos: readonly Tempo[], audio: AudioSpan, engine: EngineName, tempoRange: TempoRange): Reading | null {
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
    // The engine's raw score, mapped to the chance this reading is right, or null when the reading's tempo or the
    // analysis's range is outside the measured tempo range
    confidence: calibrate(engine, top.confidence, top.tempo, tempoRange),
    candidates: Object.freeze(candidates),
    audio: Object.freeze({from: audio.from, to: audio.to, contextTime: audio.contextTime}),
    engine,
  });
}
