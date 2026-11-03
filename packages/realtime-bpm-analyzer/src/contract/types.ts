/**
 * The v6 public types: what the analyzer reports, engine-neutral.
 *
 * `src/index.ts` and `src/node.ts` re-export the public part. Design note and the 5.x mapping: `./readme.md`.
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

/**
 * The realtime engine option: a bare name, or a name with the settings only that engine understands.
 * Realtime and offline take different settings, so each has its own type and none is accepted where it does
 * nothing.
 */
export type EngineOption =
  | EngineName
  | {
    readonly name: 'peaks';
    /**
     * Discard the history and start over every this many seconds of audio, so a tempo change is followed.
     * A restart outside `listening` is a `statechange` to `listening` with reason `tempo-changed`; a restart
     * while still listening is silent, as nothing was reported yet. Absent: never restarts.
     */
    readonly restartAfterSeconds?: number;
  }
  | {
    readonly name: 'tempogram';
    /** `extension` pins the measured settings for tab capture and refuses another `tempoRange`. */
    readonly mode?: 'extension';
  };

/** The offline engine option. Realtime callers place their own filter, so only offline takes a lowpass. */
export type OfflineEngineOption =
  | EngineName
  | {readonly name: 'peaks'; readonly lowpass?: {readonly frequency?: number; readonly q?: number}};

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
   * moves to `listening` with reason `audio-lost` while input is being lost.
   */
  readonly liveInput?: MediaStreamTrack;
  /** Emit `debug` events. Default false. */
  readonly debug?: boolean;
};

/** Options for whole-buffer analysis, in the browser and in Node. */
export type OfflineOptions = {
  readonly engine?: OfflineEngineOption;
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
  /**
   * The reported tempo, in BPM, inside `tempoRange`. Always equal to `candidates[0].bpm`. Other candidates may
   * fall outside the range: a `half` or `double` often does.
   */
  readonly bpm: number;
  /**
   * UNCALIBRATED, 0 to 1. For now the engine's own normalised score for the top tempo, so it means something
   * different per engine and between realtime and offline: `peaks` gives the share of interval votes within
   * ±1 BPM (about 0.46 on a perfect click), `tempogram` its accumulated salience. Compare values from one engine
   * only, and set no absolute cut-off on it.
   *
   * The aim (RBA-106) is a calibrated probability that `bpm` is within 4% of the true tempo, so that 0.8 is right
   * about 80% of the time on held-out data. If calibration shows it adds nothing, it is removed from the API.
   */
  readonly confidence: number;
  /**
   * At most 5, `candidates[0]` first with relation `top`, the rest in the engine's rank order, each labelled as
   * {@link relationTo} would. Never empty.
   */
  readonly candidates: readonly Candidate[];
  readonly audio: AudioSpan;
  readonly engine: EngineName;
};

/**
 * Whole-buffer result: the same {@link Reading} realtime emits, or `null` when no tempo was found.
 * `audio` spans the analysed buffer.
 */
export type OfflineResult = Reading | null;

/**
 * Error names, after the DOM's `...Error` names. Serialisable through `postMessage`: never an `Error` instance.
 * The detail is in `message`, which has no stable format.
 */
export type AnalyzerErrorName =
  /**
   * The processor broke the protocol: another version (a stale `processorUrl` copy), a malformed message, a
   * future epoch, a transition the table refuses or audio time going back. Fatal: carrying on would leave the
   * main thread and the processor disagreeing about the state.
   */
  | 'ProtocolError'
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

/** Why the analyzer is listening, so a late subscriber can tell a fresh start from a lost pulse or lost input. */
export type ListeningReason = 'started' | 'reset' | 'pulse-lost' | 'audio-lost' | 'tempo-changed';

/**
 * What the analyzer is doing now: a snapshot, like `AudioContext.state`. An object rather than a string,
 * because each status carries its own fields.
 *
 * - `listening`: no reading yet in this stretch of audio. `progress` runs 0 to 1 toward the first reading, and
 *   `reason` says why it is listening. `audio-lost` lasts until the next reading, and that is how a late
 *   subscriber learns live input is being lost.
 * - `settling`: readings are coming but have not agreed long enough to lock.
 * - `locked`: readings agree. Leaving needs more disagreement than entering (hysteresis), so it does not flap.
 * - `stopped`: final. `error` is null after `stop()`, set after a fatal fault.
 *
 * @remarks
 * Guarantees:
 * - Read it any time. A listener added late reads the current state here: events are never replayed.
 * - It is updated before any event about it is dispatched, so inside a listener it is already current, for every
 *   listener of every event of that step.
 * - Every snapshot is a new object: compare by reference to see whether anything changed.
 * - `epoch` counts `reset()` calls. Messages from an older epoch are dropped, so after `reset()` returns,
 *   nothing measured before it is ever reported.
 */
export type AnalyzerState =
  | {readonly status: 'listening'; readonly epoch: number; readonly progress: number; readonly reason: ListeningReason}
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
  /** settling, locked or listening to listening: live input is being lost (`liveInput`). */
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
 * Dispatch order, for each analysis step: `state` is updated, then `statechange` fires if the status, the
 * listening reason or the epoch changed, then `reading` (settling, locked) or `progress` (listening). Never both a
 * `reading` and a `progress` for one step. A `reset()` or `stop()` called from a listener is queued: it runs once
 * every listener has had every event of the current step, so all listeners see the same sequence.
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
   * Starts over: moves to `listening` with the next epoch, dispatches `statechange` (reason `reset`) then
   * `progress` (0), and tells the processor. Synchronous, except from inside a listener, where it runs once the
   * current step's events are dispatched. Throws `InvalidStateError` once stopped.
   */
  reset(): void;
  /** Final: moves to `stopped` and stops the processor. A second call does nothing. */
  stop(): void;
};

/** Worklet to main thread. Every message carries the protocol version and the epoch it was measured in. */
export type WorkletMessage =
  /**
   * Sent when the processor starts, with epoch 0, and again each time it adopts the epoch of a `reset`. The
   * factory waits for the first, with a timeout, before it resolves, so a stale processor fails at startup: a 5.x
   * one never sends it. The later ones end the epoch watchdog's count.
   */
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
  /** Only sent with `debug: true`: the processor filters, not the reducer. */
  | {readonly type: 'debug'; readonly protocol: number; readonly epoch: number; readonly engine: EngineName; readonly data: unknown};

/** Main thread to worklet. The processor ignores unknown types, and adopts `epoch` from `reset`. */
export type HostMessage =
  | {readonly type: 'reset'; readonly protocol: number; readonly epoch: number}
  | {readonly type: 'stop'; readonly protocol: number}
  /** Seconds the live input has delivered, for the `liveInput` clock. */
  | {readonly type: 'delivered'; readonly protocol: number; readonly seconds: number};

/**
 * Hysteresis between locking and unlocking, and before a lost pulse, engine-neutral: it reads only `bpm`, the pulse and audio time.
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
  /** Report `pulse-lost` only after this many seconds without a pulse, so a break does not flap the state. */
  readonly pulseLostAfterSeconds: number;
};

/**
 * The hysteresis both engines report with. The one place these numbers live: the tempogram's stable rule reads
 * `lockBand` and `lockAfterSeconds` from here.
 *
 * TO TUNE on the benchmark's dev half (RBA-51, RBA-106), then check once on held-out data. Until then each is
 * today's behaviour, or the nearest thing to it:
 * - `lockBand` 0.02 and `lockAfterSeconds` 8: the tempogram's 5.x stable rule (`stableTolerance`, `stableSeconds`:
 *   80% of the frames of the last 8 s agree within 2%, besides its lead and salience, which stay engine detail).
 *   The 2% is also the band rba-pro copied by hand to tell stable from settling (`reading.ts`, `STABLE_TOLERANCE`).
 *   The peaks engine keeps its own lock rule (10 s of audio, then a fuller threshold rung, RBA-107): its readings
 *   jump by whole BPM, so a band on them was never measured.
 * - `unlockBand` 0.04: the benchmark's ±4% for a correct reading. Leaving a lock while the reading is still within
 *   it would be noise, and twice the lock band keeps the two apart.
 * - `unlockAfterSeconds` 2 and `pulseLostAfterSeconds` 2: new. 5.x dropped a tempogram lock on the first frame
 *   without a pulse, and rba-pro on the first reading outside 2%, so both flapped. Four tempogram frames.
 */
export const HYSTERESIS: Hysteresis = Object.freeze({
  lockBand: 0.02,
  lockAfterSeconds: 8,
  unlockBand: 0.04,
  unlockAfterSeconds: 2,
  pulseLostAfterSeconds: 2,
});
