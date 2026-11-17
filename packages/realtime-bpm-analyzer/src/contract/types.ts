/**
 * The v6 public types: what the analyzer reports, engine-neutral.
 *
 * `src/index.ts` and `src/node.ts` re-export the public part. Design note and the 5.x mapping: `./readme.md`.
 */

/**
 * A worklet protocol version, carried by every message between the analyzer and its processor.
 *
 * @remarks
 * Semver rules, because a `processorUrl` copy of the processor can drift from the library that loads it.
 * - `major` is checked strictly: a known message changed shape or meaning, which only a major release does. A
 *   processor of another major (a 5.x file included) fails at once with a `ProtocolError`.
 * - `minor` is checked tolerantly: a minor release may add message types, and bumps it when it does. A message type
 *   a side does not know passes only when it comes from a later minor than its own, so it is a feature a newer
 *   copy has. From the same or an older minor it is a bug, a typo included, and fatal. A known message that is
 *   malformed is fatal whatever the minor.
 *
 * The main thread keeps the processor's minor from its `ready`, so a feature that needs a newer processor (such as
 * beat events) can fail at once with an error saying the processor copy is out of date, instead of going silent.
 *
 * A minor that adds a value to a union the processor sends must keep that value from an older main thread, as
 * rule 1 of `./readme.md` (Room for 6.x) sets out.
 */
export type ProtocolVersion = {readonly major: number; readonly minor: number};

/** The protocol this build speaks: see {@link ProtocolVersion} */
export const PROTOCOL: ProtocolVersion = Object.freeze({major: 1, minor: 0});

/**
 * The tempo engine. May grow in a minor release, like every exported union but {@link Status}: give a `switch`
 * over it a `default` branch.
 *
 * - `peaks`: amplitude peaks after a lowpass.
 * - `tempogram`: spectral flux across several bands and a sliding autocorrelation.
 */
export type EngineName = 'peaks' | 'tempogram';

/**
 * The realtime engine option: a bare name, or a name with the settings only that engine understands.
 * Realtime and offline take different settings, so each has its own type and none is accepted where it does
 * nothing. An object takes `name` and that engine's settings only: `restartAfterSeconds` for `peaks`, `mode` for
 * `tempogram`. Any other key, such as `lowpass` (realtime `peaks` has a fixed lowpass inside `analyzer.input`) or a
 * typo, makes the factory's promise reject with a `TypeError` that names it, whatever its value. `null` or
 * `undefined` means the default, `tempogram`.
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
    /**
     * `measured` holds the analyzer to the settings the benchmark measured, on real-time audio at 90 to 180 BPM:
     * it reads exactly as the bare `tempogram` does, and refuses another `tempoRange`.
     */
    readonly mode?: 'measured';
  };

/**
 * The lowpass settings: the offline `engine: {name: 'peaks', lowpass}`, `getBiquadFilter` and Node's `applyLowpass`
 * take the same ones. `null` or `undefined` means the defaults. Anything else that is not an object, an array
 * included, throws a `TypeError` that names its type. No key but `frequency` and `q` is accepted: another throws a
 * `TypeError` that names it, whatever its value, `undefined` included. That covers the 5.x names `frequencyValue` and
 * `qualityValue`, the DOM's `Q`, `detune`, `type` and `gain`, which TypeScript lets through from a
 * `BiquadFilterOptions`, and typos. Each setting is a finite number: another type throws a `TypeError`, and `NaN` or
 * an infinity a `RangeError`, as does a value outside its range.
 */
export type LowpassOption = {
  /**
   * Cutoff in Hz, above 0 and below half the sample rate once rounded to the 32-bit float Web Audio stores, or a
   * `RangeError` names the value, the rate and the range.
   * (5.x, after Web Audio, clamped it silently: 0 or below gave silence, and Nyquist or above no filter at all.)
   * Default 200, which keeps the kick drum and the bass, and is valid at any rate above 400 Hz.
   */
  readonly frequency?: number;
  /**
   * Resonance at the cutoff in dB, as Web Audio reads a lowpass `Q`, not the Audio EQ Cookbook's linear Q: the
   * biquad's α is sin(ω0) / (2 × 10^(q/20)). So 0 dB is a linear Q of 1, a positive `q` raises a peak at the cutoff,
   * and a negative one rounds it off. From -758 to 770 dB, where 10^(q/20) is a normal, finite 32-bit float as Web
   * Audio computes it, or a `RangeError` names the value and the range. Default 1.
   */
  readonly q?: number;
};

/**
 * The offline engine option. Realtime `peaks` has a fixed lowpass inside `analyzer.input`, so only offline takes
 * lowpass settings. The object form is `peaks` only, and takes `name` and `lowpass` only: any other key, such as
 * `restartAfterSeconds` or a typo, makes the promise reject with a `TypeError` that names it, whatever its value.
 * `null` or `undefined` means the default, `tempogram`.
 */
export type OfflineEngineOption =
  | EngineName
  | {readonly name: 'peaks'; readonly lowpass?: LowpassOption};

/**
 * Range every tempo is reported in, in BPM. `max` must be at least twice `min`, so every tempo has an octave
 * inside it. `max` must be at most 2^31 - 1, so a whole BPM fits a signed 32-bit integer, and `max / min` must be a
 * finite number; a value past either bound is refused with a `RangeError`. Default 90 to 180, the range
 * `Reading.confidence` was measured on: any other range gives every reading confidence `null`, and an explicit
 * `{min: 90, max: 180}` is the default. Any key other than `min` and `max` is refused with a `TypeError` that names
 * it.
 */
export type TempoRange = {
  readonly min: number;
  readonly max: number;
};

/**
 * Options for the realtime analyzer. `createRealtimeBpmAnalyzer` checks them before it loads the processor: for an
 * invalid value, the promise it returns rejects with a `RangeError` or a `TypeError`. It takes these keys only: any
 * other own key, a typo included, rejects with a `TypeError` that names it, whatever its value.
 */
export type AnalyzerOptions = {
  /**
   * Default `tempogram`. `peaks` puts a fixed lowpass inside `analyzer.input`; the tempogram takes the full band.
   */
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

/**
 * Options for whole-buffer analysis, in the browser and in Node. Only these two keys: any other own key, a typo or a
 * realtime option included, rejects with a `TypeError` that names it, whatever its value.
 */
export type OfflineOptions = {
  /** Default `tempogram`, as for the realtime analyzer. Only `peaks` takes lowpass settings. */
  readonly engine?: OfflineEngineOption;
  readonly tempoRange?: TempoRange;
};

/**
 * How a candidate's tempo relates to the reading's tempo. May grow in a minor release.
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
 * No confidence of its own: only the reading's tempo is calibrated. A per-candidate confidence
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
  /**
   * Realtime: the `AudioContext.currentTime` at which the last analysed sample, the one at `to`, reached the
   * analyzer, stamped in the worklet. It anchors audio time to the context clock: a moment `t` of analysed audio
   * (a beat, in 6.x) is at `contextTime - (to - t)` on the clock `AudioContext` schedules on. That holds back to
   * the last lost live input, which audio time counts as silence. The time the sound reached the analyzer, so add
   * `outputLatency` to line something up with what the listener hears.
   *
   * `null` offline, where no context clock runs.
   */
  readonly contextTime: number | null;
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
   * The same tempo unrounded, in BPM: the engine's own estimate before it is rounded to `bpm`. For timing, not for
   * display. A beat grid or a marker export laid on `bpm` drifts: a real 127.6 BPM shown as 128 puts the markers
   * about 0.56 s off after 3 minutes. Lay the grid on `60 / bpmExact` seconds instead, and keep showing `bpm`.
   *
   * Each engine measures it, never derives it from `bpm`: `peaks` takes the vote-weighted mean of the unrounded
   * interval tempos within 1 BPM of `bpm`, and `tempogram` the interpolated top of its tempo curve. So it is
   * within 1.5 BPM of `bpm`, and `Math.round(bpmExact)` can differ from `bpm` by one when the peaks votes straddle
   * two whole numbers: `bpm` is the whole number with the most votes, not a rounding of `bpmExact`.
   */
  readonly bpmExact: number;
  /**
   * The chance, 0 to 1, that `bpm` is within 4% of the true tempo right now: 0.8 is right about 80% of the time.
   * Each engine's raw score (`peaks` the share of interval votes within ±1 BPM, `tempogram` its accumulated
   * salience) goes through that engine's table in `core/calibration.ts`, so on the default range values from either
   * engine, realtime or offline, mean the same thing. A reading at half or double the tempo counts as wrong.
   *
   * Fitted on the benchmark's dev half (benchmark/results/rba-106-calibration-dev.md), then checked once on the
   * real-time readings of its held-out half, which it had not seen: the tempogram's table held there
   * (benchmark/results/rba-106-calibration-heldout-verdict.md). Offline readings were not part of that check. Peaks'
   * table was fitted on dev only. Treat the values as an estimate for music like the benchmark's.
   *
   * `null`: unmeasured, when `bpm` is outside 90 to 180 or when the analysis ran on a custom tempo range. Both halves
   * were read by analyses on the default range, 90 to 180 BPM, so the calibration says nothing about any other: a
   * custom range changes which candidate each engine picks, so even a reading inside 90 to 180 BPM from a 60 to 200
   * analysis has a score nobody measured. The confidence is then `null` rather than a number with no proven meaning.
   * An explicit `{min: 90, max: 180}` is the default range.
   *
   * Also `null` on the default range for one kind of reading: the offline peaks engine's, when it found the beats only
   * relative to a quiet or bass-light file's own level, after its fixed thresholds found none (RBA-221). The tables
   * never saw such a reading, and the file may hold no beat at all, since noise whose level after the engine's lowpass
   * filter is above -70 dBFS can read a tempo this way. Every other reading on the default range has a number.
   */
  readonly confidence: number | null;
  /**
   * At most 5, `candidates[0]` first with relation `top`, the rest in the engine's rank order, each labelled with
   * its {@link CandidateRelation} to the top tempo. Never empty.
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
 * Error names, after the DOM's `...Error` names. May grow in a minor release. Serialisable through `postMessage`: never an `Error` instance.
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

/**
 * The analyzer's status, the discriminant of {@link AnalyzerState}. The one closed union: a new status would
 * change what the existing ones mean, so it waits for a major release, and an exhaustive `switch` over it is safe.
 */
export type Status = AnalyzerState['status'];

/** Any status but `stopped`. */
export type ActiveStatus = Exclude<Status, 'stopped'>;

/**
 * Why the analyzer is listening, so a late subscriber can tell a fresh start from a lost pulse or lost input.
 * May grow in a minor release.
 */
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
 *   The tempo can still move while locked, with no `statechange`: within the unlock band, and when peaks moves its
 *   lock to a fuller rung. Show the latest `reading`, not only the one of the move to `locked`.
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

/** Reasons the engine gives, inside a worklet message. May grow in a minor release. */
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

/**
 * Every reason a `statechange` can carry. May grow in a minor release: branch on `to.status`, which is closed, and
 * treat an unknown reason as informational.
 */
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
 * Payload of `kick`: one kick drum the analyzer heard, as soon as it heard it, whichever engine runs.
 *
 * @remarks
 * A kick is a sudden rise of energy under 150 Hz: the drum's attack. It is heard, not predicted, so it always
 * comes after the sound reached the analyzer: at the listener, about 20 ms after in Chromium and 22 to 26 ms in
 * Firefox, in the median on CI. A kick reported before a `reset()` is dropped, as a reading is.
 */
export type Kick = {
  /**
   * When the kick's attack reached the analyzer, in seconds on the `AudioContext.currentTime` clock, like
   * {@link AudioSpan.contextTime}. For audio the context plays (a media element, a stream, a buffer), the listener
   * hears it at `contextTime + baseLatency + outputLatency`. From a mic, the room heard it at about `contextTime`: it
   * has already passed by the time the event fires.
   */
  readonly contextTime: number;
  /**
   * From 0 to 1: the kick's peak in the bass over the loudest kick's of the last 3.5 s, itself included, as an
   * amplitude ratio. 1 is as loud as the loudest recent kick, 0.5 is 6 dB softer. Relative, so the range is the same from a
   * quiet mic and a loud file. A kick more than 6 dB under that loudest one is not reported, so in practice it
   * reads from 0.5 to 1. The meaning holds if that gate ever moves, so map the whole 0 to 1.
   */
  readonly strength: number;
};

/**
 * Engine detail, only with `debug: true`. Not part of the contract: its shape changes with any release.
 */
export type DebugInfo = {readonly engine: EngineName; readonly data: unknown};

/**
 * The analyzer's events. May grow in a minor release: a new event type is additive, as nobody listens to it yet.
 *
 * @remarks
 * Dispatch order, for each analysis step: `state` is updated, then `statechange` fires if the status, the
 * listening reason or the epoch changed, then `reading` (settling, locked) or `progress` (listening). Never both a
 * `reading` and a `progress` for one step. A `reset()` or `stop()` called from a listener is queued: it runs once
 * every listener has had every event of the current step, so all listeners see the same sequence.
 *
 * - `statechange`: on every transition, and only then.
 * - `reading`: on each analysis step outside `listening` that measured something new. A measurement, not a state.
 *   The rate is the engine's: `peaks` measures every 4096-sample buffer, about 11 times a second at 44.1 or
 *   48 kHz, and `tempogram` on each tempogram update, about twice a second.
 * - `progress`: on each analysis step while `listening`, and once right after `reset()`, with 0.
 * - `error`: non-fatal faults. A fatal one is a `statechange` to `stopped` with reason `failed` instead.
 * - `debug`: engine detail, only with `debug: true`.
 * - `kick`: on each kick drum heard, in `listening`, `settling` and `locked` alike, as soon as it is heard. Apart
 *   from the steps: it moves no state, and comes between their events, never inside one step's sequence.
 *
 * Reserved for a later 6.x: a `beat` event, on the `AudioContext` clock ({@link AudioSpan.contextTime}). It
 * belongs to the epoch and the stretch of audio it was predicted in: `reset()` and every move to `listening`
 * cancel every predicted beat not yet dispatched, so no beat of an older epoch or a lost pulse is ever reported.
 */
export type AnalyzerEventMap = {
  readonly statechange: StateChange;
  readonly reading: Reading;
  readonly progress: Progress;
  readonly error: AnalyzerError;
  readonly debug: DebugInfo;
  readonly kick: Kick;
};

export type AnalyzerEventType = keyof AnalyzerEventMap;

/** One event as data, in dispatch order: what the reducer returns. */
export type AnalyzerEvent =
  | {readonly type: 'statechange'; readonly detail: StateChange}
  | {readonly type: 'reading'; readonly detail: Reading}
  | {readonly type: 'progress'; readonly detail: Progress}
  | {readonly type: 'error'; readonly detail: AnalyzerError}
  | {readonly type: 'debug'; readonly detail: DebugInfo}
  | {readonly type: 'kick'; readonly detail: Kick};

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

/**
 * Worklet to main thread. Every message carries the processor's protocol version and the epoch it was measured in.
 * The main thread validates every type it knows strictly, and passes a type it does not know only when it comes from
 * a later protocol minor than its own (see {@link ProtocolVersion}).
 */
export type WorkletMessage =
  /**
   * Sent when the processor starts, with epoch 0, and again each time it adopts the epoch of a `reset`. The
   * factory waits for the first, with a timeout, before it resolves, so a stale processor fails at startup: a 5.x
   * one never sends it. The later ones end the epoch watchdog's wait.
   */
  | {readonly type: 'ready'; readonly protocol: ProtocolVersion; readonly epoch: number}
  /**
   * One per analysis step while listening. `reason` only when this step moved the status. A start-over
   * (`tempo-changed` with `restartAfterSeconds`, `audio-lost` with `liveInput`) sends one of its own, so one step
   * can send two.
   */
  | {
    readonly type: 'step';
    readonly protocol: ProtocolVersion;
    readonly epoch: number;
    readonly status: 'listening';
    readonly progress: number;
    readonly reason?: EngineReason;
  }
  /** One per analysis step with a reading. `reason` only when this step moved the status. */
  | {
    readonly type: 'step';
    readonly protocol: ProtocolVersion;
    readonly epoch: number;
    readonly status: 'settling' | 'locked';
    readonly reading: Reading;
    readonly reason?: EngineReason;
  }
  | {readonly type: 'fault'; readonly protocol: ProtocolVersion; readonly epoch: number; readonly fatal: boolean; readonly error: AnalyzerError}
  /** Only sent with `debug: true`: the processor filters, not the reducer. */
  | {readonly type: 'debug'; readonly protocol: ProtocolVersion; readonly epoch: number; readonly engine: EngineName; readonly data: unknown}
  /** One per kick heard, posted in the render quantum that confirmed it. */
  | {readonly type: 'kick'; readonly protocol: ProtocolVersion; readonly epoch: number; readonly contextTime: number; readonly strength: number};

/**
 * A {@link WorkletMessage} as it crosses the port: the processor stamps each one with the worklet's `currentTime`
 * when it posts it. The epoch watchdog judges an old epoch by when it was sent, not when the main thread got to it,
 * so a blocked main thread cannot fail a healthy analyzer.
 */
export type PostedWorkletMessage = WorkletMessage & {readonly at: number};

/**
 * Main thread to worklet. The processor applies the main thread's rule to the types it does not know (see
 * {@link ProtocolVersion}), and adopts `epoch` from `reset`.
 */
export type HostMessage =
  | {readonly type: 'reset'; readonly protocol: ProtocolVersion; readonly epoch: number}
  | {readonly type: 'stop'; readonly protocol: ProtocolVersion}
  /** Seconds the live input has delivered, for the `liveInput` clock. */
  | {readonly type: 'delivered'; readonly protocol: ProtocolVersion; readonly seconds: number};

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
 * Swept on the benchmark's dev half and kept (benchmark/results/rba-v6-hysteresis-dev.md). The pick rule
 * runs per engine, and these numbers are shared. The tempogram's pick (the default engine) moves only
 * `pulseLostAfterSeconds`, to 3, which changes none of its measures. Peaks' pick, `pulseLostAfterSeconds` 1, sits at
 * the edge of its grid and drops to listening almost four times as often. Neither pick is taken: one set of values
 * serves both engines, the tempogram's pick changes nothing measured, and peaks' trades locks for its edge. Not
 * checked on held-out data, though the held-out calibration check ran under them. Where each value comes from:
 * - `lockBand` 0.02 and `lockAfterSeconds` 8: the tempogram's 5.x stable rule (`stableTolerance`, `stableSeconds`:
 *   80% of the frames of the last 8 s agree within 2%, besides its lead and salience, which stay engine detail).
 *   The 2% is also the band rba-pro copied by hand to tell stable from settling (`reading.ts`, `STABLE_TOLERANCE`).
 *   The peaks engine keeps its own lock rule (10 s of audio, then a fuller threshold rung): its readings
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
