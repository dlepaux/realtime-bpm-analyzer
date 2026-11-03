/**
 * The v6 public types: what the analyzer reports, engine-neutral.
 *
 * Not exported yet. Nothing in `src/index.ts` or `src/node.ts` imports this folder, so the 5.x bundles and
 * declarations are unchanged. Phase 3 of RBA-108 wires it in and removes the 5.x surface.
 * Design note and the 5.x mapping: `./readme.md`.
 */

/** Version of the worklet protocol. Bumped on any change to {@link WorkletMessage} or {@link HostMessage}. */
export const PROTOCOL_VERSION = 1;

/**
 * The tempo engine.
 *
 * - `peaks`: amplitude peaks after a lowpass.
 * - `tempogram`: spectral flux across several bands and a sliding autocorrelation.
 */
export type EngineName = 'peaks' | 'tempogram';

/** The engine option: a bare name, or a name with the settings only that engine understands. */
export type EngineOption =
  | EngineName
  | {
    readonly name: 'peaks';
    /**
     * Discard the history and start over every this many seconds of audio, so a tempo change is followed.
     * Each restart is a `statechange` to `listening` with reason `tempo-changed`. Absent: never restarts.
     */
    readonly restartAfterSeconds?: number;
    /** Lowpass applied before peak picking, offline only. Realtime callers place their own filter. */
    readonly lowpass?: {readonly frequency?: number; readonly q?: number};
  }
  | {
    readonly name: 'tempogram';
    /** `extension` pins the measured settings for tab capture and refuses another `tempoRange`. */
    readonly mode?: 'extension';
  };

/**
 * Range every tempo is reported in, in BPM. `max` must be at least twice `min`, so every tempo has an octave
 * inside it. Default 90 to 180.
 */
export type TempoRange = {
  readonly min: number;
  readonly max: number;
};

/** Options for the realtime analyzer. Invalid values throw a `RangeError` or `TypeError` synchronously. */
export type AnalyzerOptions = {
  /** Default decided in RBA-51. */
  readonly engine?: EngineOption;
  readonly tempoRange?: TempoRange;
  /** URL of the processor file, for pages and extensions whose CSP refuses `blob:`. Default: an inlined `blob:`. */
  readonly processorUrl?: string | URL;
  /**
   * The track behind a MediaStream source. The analyzer follows its clock, counts lost input as silence, and
   * leaves `locked` with reason `audio-lost` while input is being lost.
   */
  readonly liveInput?: MediaStreamTrack;
  /** Emit `debug` events. Default false. */
  readonly debug?: boolean;
};

/** Options for whole-buffer analysis, in the browser and in Node. */
export type OfflineOptions = {
  readonly engine?: EngineOption;
  readonly tempoRange?: TempoRange;
};

/**
 * How a candidate's tempo relates to the reading's tempo.
 *
 * - `top`: the reading's own tempo. Only `candidates[0]` has it.
 * - `half` / `double`: half or twice the top tempo, within {@link RELATION_TOLERANCE}.
 * - `other`: anything else, 3:2 relatives included.
 */
export type CandidateRelation = 'top' | 'half' | 'double' | 'other';

/** Relative tolerance for `half` and `double`: 0.02 means within 2% of the exact ratio. */
export const RELATION_TOLERANCE = 0.02;

/**
 * Another tempo the engine considered.
 *
 * @remarks
 * No confidence of its own: only the reading's tempo is calibrated (RBA-106). A per-candidate confidence
 * comes back only if calibration covers it.
 */
export type Candidate = {
  readonly bpm: number;
  readonly relation: CandidateRelation;
};

/**
 * The audio a reading covers, in seconds of analysed audio since the epoch began (since the analyzer started
 * or since the last `reset()`). Lost live input counted as silence is included, so this is audio time, not
 * wall time. `from <= to`, and `to` never decreases within an epoch.
 */
export type AudioSpan = {
  readonly from: number;
  readonly to: number;
};

/**
 * One measurement: the tempo the engine reports for a span of audio.
 *
 * @remarks
 * The same type in realtime and offline, whichever engine runs: every field means the same thing in all four.
 * A reading is a measurement, not a state. Whether the analyzer trusts it is `state.status`.
 */
export type Reading = {
  /** The reported tempo, in BPM, inside `tempoRange`. Always equal to `candidates[0].bpm`. */
  readonly bpm: number;
  /**
   * Calibrated probability, 0 to 1, that `bpm` is within 4% of the true tempo: 0.8 is right about 80% of the
   * time on the held-out set. Removed from the API if RBA-106 shows it adds nothing.
   */
  readonly confidence: number;
  /** At most 5, `candidates[0]` first with relation `top`, the rest in the engine's rank order. Never empty. */
  readonly candidates: readonly Candidate[];
  readonly audio: AudioSpan;
  readonly engine: EngineName;
};

/**
 * Whole-buffer result: the same {@link Reading} realtime emits, or `null` when no tempo was found.
 * `audio` spans the analysed buffer.
 */
export type OfflineResult = Reading | null;

/** Error names. Serialisable through `postMessage`: never an `Error` instance. */
export type AnalyzerErrorName =
  /** The processor speaks another protocol version: a stale `processorUrl` copy. Fatal. */
  | 'ProtocolMismatch'
  /** A worklet message failed validation: wrong shape, future epoch. The message is dropped. */
  | 'MalformedMessage'
  /** The engine asked for a transition the table refuses. The message is dropped. */
  | 'IllegalTransition'
  /** The processor threw, or its port failed (`processorerror`, `messageerror`). Fatal. */
  | 'ProcessorError'
  /** One analysis step failed. Non-fatal: the next step runs. */
  | 'AnalysisError';

export type AnalyzerError = {
  readonly name: AnalyzerErrorName;
  readonly message: string;
};

/** The analyzer's status, the discriminant of {@link AnalyzerState}. */
export type Status = AnalyzerState['status'];

/** Any status but `stopped`. */
export type ActiveStatus = Exclude<Status, 'stopped'>;

/**
 * What the analyzer is doing now: a snapshot, like `AudioContext.state`.
 *
 * - `listening`: no reading yet in this stretch of audio. `progress` runs 0 to 1 toward the first reading.
 * - `settling`: readings are coming but have not agreed long enough to lock.
 * - `locked`: readings agree. Leaving needs more disagreement than entering (hysteresis), so it does not flap.
 * - `stopped`: final. `error` is null after `stop()`, set after a fatal fault.
 *
 * @remarks
 * Guarantees:
 * - Read it any time. A listener added late reads the current state here: events are never replayed.
 * - It is updated before any event about it is dispatched, so inside a listener it is already current.
 * - Every snapshot is a new object: compare by reference to see whether anything changed.
 * - `epoch` counts `reset()` calls. Messages from an older epoch are dropped, so after `reset()` returns,
 *   nothing measured before it is ever reported.
 */
export type AnalyzerState =
  | {readonly status: 'listening'; readonly epoch: number; readonly progress: number}
  | {readonly status: 'settling'; readonly epoch: number; readonly reading: Reading}
  | {readonly status: 'locked'; readonly epoch: number; readonly reading: Reading}
  | {readonly status: 'stopped'; readonly epoch: number; readonly error: AnalyzerError | null};

/** Reasons the engine gives, inside a worklet message. */
export type EngineReason =
  /** listening to settling: the first reading of this stretch. */
  | 'first-reading'
  /** settling to locked: readings agreed long enough. */
  | 'locked'
  /** locked to settling: readings left the unlock band, though a tempo is still heard. */
  | 'unlocked'
  /** settling or locked to listening: no pulse is heard any more. */
  | 'pulse-lost'
  /** settling or locked to listening: live input is being lost (`liveInput`). */
  | 'audio-lost'
  /** settling or locked to listening: the engine discarded its history to follow a new tempo. */
  | 'tempo-changed';

/** Reasons that come from the caller: `reset()` and `stop()`. */
export type CallerReason = 'reset' | 'stopped';

/** Every reason a `statechange` can carry. */
export type StateChangeReason = EngineReason | CallerReason | 'failed';

/**
 * Payload of `statechange`. `to` is the object `analyzer.state` holds at dispatch.
 * A `reset()` while listening is a change too, from listening to listening: the epoch moved.
 */
export type StateChange = {
  readonly from: AnalyzerState;
  readonly to: AnalyzerState;
  readonly reason: StateChangeReason;
};

/** Payload of `progress`: the same number as `state.progress`. */
export type Progress = {readonly fraction: number};

/**
 * Engine detail, only with `debug: true`. Not part of the contract: its shape changes with any release.
 */
export type DebugInfo = {readonly engine: EngineName; readonly data: unknown};

/**
 * The analyzer's events.
 *
 * @remarks
 * Dispatch order, for each analysis step: `state` is updated, then `statechange` fires if the status or epoch
 * changed, then `reading` (settling, locked) or `progress` (listening). Never both a `reading` and a `progress`
 * for one step. If a listener calls `reset()` or `stop()`, the rest of that step's events are not dispatched.
 *
 * - `statechange`: on every transition, and only then.
 * - `reading`: on each analysis step outside `listening`, about twice a second. A measurement, not a state.
 * - `progress`: on each analysis step while `listening`, and once right after `reset()`, with 0.
 * - `error`: non-fatal faults. A fatal one is a `statechange` to `stopped` with reason `failed` instead.
 * - `debug`: engine detail, only with `debug: true`.
 */
export type AnalyzerEventMap = {
  readonly statechange: StateChange;
  readonly reading: Reading;
  readonly progress: Progress;
  readonly error: AnalyzerError;
  readonly debug: DebugInfo;
};

export type AnalyzerEventType = keyof AnalyzerEventMap;

/** One event as data, in dispatch order: what the reducer returns. */
export type AnalyzerEvent =
  | {readonly type: 'statechange'; readonly detail: StateChange}
  | {readonly type: 'reading'; readonly detail: Reading}
  | {readonly type: 'progress'; readonly detail: Progress}
  | {readonly type: 'error'; readonly detail: AnalyzerError}
  | {readonly type: 'debug'; readonly detail: DebugInfo};

/** Options for `on()`, a subset of `AddEventListenerOptions`. */
export type ListenOptions = {
  /** Remove the listener after its first call. */
  readonly once?: boolean;
  /** Remove the listener when this signal aborts. */
  readonly signal?: AbortSignal;
};

/**
 * The analyzer's surface, an `AudioNode`-like `EventTarget`. Events are `CustomEvent`s whose `detail` is the
 * payload, so `addEventListener` works too.
 */
export type BpmAnalyzerContract = {
  /** The current snapshot. See {@link AnalyzerState} for its guarantees. */
  readonly state: AnalyzerState;
  /**
   * Adds a listener for the payload, and returns the function that removes it. The same listener added twice
   * for one type is called once, as with `addEventListener`.
   */
  on<K extends AnalyzerEventType>(
    type: K,
    listener: (detail: AnalyzerEventMap[K]) => void,
    options?: ListenOptions,
  ): () => void;
  /** Removes a listener added with `on()`. Unknown listeners are ignored. */
  off<K extends AnalyzerEventType>(type: K, listener: (detail: AnalyzerEventMap[K]) => void): void;
  /**
   * Starts over: synchronously moves to `listening` with the next epoch, dispatches `statechange` (reason
   * `reset`) then `progress` (0), and tells the processor. Throws `InvalidStateError` once stopped.
   */
  reset(): void;
  /** Final: moves to `stopped` and stops the processor. A second call does nothing. */
  stop(): void;
};

/** Worklet to main thread. Every message carries the protocol version and the epoch it was measured in. */
export type WorkletMessage =
  /** Sent once when the processor starts, so a stale processor fails at startup rather than mid-analysis. */
  | {readonly type: 'ready'; readonly protocol: number; readonly epoch: number}
  /** One per analysis step while listening. `reason` only when this step moved the status. */
  | {
    readonly type: 'step';
    readonly protocol: number;
    readonly epoch: number;
    readonly status: 'listening';
    readonly progress: number;
    readonly reason?: EngineReason;
  }
  /** One per analysis step with a reading. `reason` only when this step moved the status. */
  | {
    readonly type: 'step';
    readonly protocol: number;
    readonly epoch: number;
    readonly status: 'settling' | 'locked';
    readonly reading: Reading;
    readonly reason?: EngineReason;
  }
  | {readonly type: 'fault'; readonly protocol: number; readonly epoch: number; readonly fatal: boolean; readonly error: AnalyzerError}
  | {readonly type: 'debug'; readonly protocol: number; readonly epoch: number; readonly engine: EngineName; readonly data: unknown};

/** Main thread to worklet. The processor ignores unknown types, and adopts `epoch` from `reset`. */
export type HostMessage =
  | {readonly type: 'reset'; readonly protocol: number; readonly epoch: number}
  | {readonly type: 'stop'; readonly protocol: number}
  /** Seconds the live input has delivered, for the `liveInput` clock. */
  | {readonly type: 'delivered'; readonly protocol: number; readonly seconds: number};

/**
 * Hysteresis between locking and unlocking, engine-neutral: it reads only `bpm` and audio time.
 * The engine applies it; the reducer enforces only the table.
 */
export type Hysteresis = {
  /** Lock once the top tempo stays within this relative band of one tempo... */
  readonly lockBand: number;
  /** ...for this many seconds of audio. */
  readonly lockAfterSeconds: number;
  /** Unlock only once it leaves this wider band... */
  readonly unlockBand: number;
  /** ...for this many seconds of audio. */
  readonly unlockAfterSeconds: number;
};

/**
 * PLACEHOLDER values, to be set in phase 3 from the benchmark (RBA-51 dev half). Only the shape and the
 * invariant `unlockBand > lockBand` are part of this contract.
 */
export const HYSTERESIS_PLACEHOLDER: Hysteresis = {
  lockBand: 0.02,
  lockAfterSeconds: 8,
  unlockBand: 0.04,
  unlockAfterSeconds: 2,
};
