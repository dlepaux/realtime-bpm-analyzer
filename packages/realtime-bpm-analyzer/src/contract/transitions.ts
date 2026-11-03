/**
 * The v6 state contract as data and one pure reducer. The analyzer class (phase 3) owns no transition logic of
 * its own: it feeds every worklet message and every caller command through a dispatcher built on `reduce`.
 * Design note: `./readme.md`.
 */
import {
  PROTOCOL_VERSION,
  RELATION_TOLERANCE,
  type ActiveStatus,
  type AnalyzerError,
  type AnalyzerEvent,
  type AnalyzerState,
  type Candidate,
  type CandidateRelation,
  type EngineReason,
  type HostMessage,
  type ListeningReason,
  type Reading,
  type StateChangeReason,
  type Status,
} from './types';

/** Who may ask for a transition: the engine in a worklet message, the caller, or a fatal fault. */
export type TransitionSource = 'engine' | 'caller' | 'fault';

export type TransitionRule = {
  readonly from: ActiveStatus;
  readonly to: Status;
  readonly reason: StateChangeReason;
  readonly source: TransitionSource;
};

const active: readonly ActiveStatus[] = ['listening', 'settling', 'locked'];

/**
 * Every legal transition. Anything not listed is refused. Nothing leaves `stopped`. The engine moves a status
 * to itself only for `audio-lost` while listening, so a lost input is visible before the first reading.
 */
export const TRANSITIONS: readonly TransitionRule[] = [
  {from: 'listening', to: 'settling', reason: 'first-reading', source: 'engine'},
  {from: 'settling', to: 'locked', reason: 'locked', source: 'engine'},
  {from: 'locked', to: 'settling', reason: 'unlocked', source: 'engine'},
  ...(['pulse-lost', 'audio-lost', 'tempo-changed'] as const).flatMap(reason => [
    {from: 'settling', to: 'listening', reason, source: 'engine'} as const,
    {from: 'locked', to: 'listening', reason, source: 'engine'} as const,
  ]),
  {from: 'listening', to: 'listening', reason: 'audio-lost', source: 'engine'},
  ...active.map(from => ({from, to: 'listening', reason: 'reset', source: 'caller'}) as const),
  ...active.map(from => ({from, to: 'stopped', reason: 'stopped', source: 'caller'}) as const),
  ...active.map(from => ({from, to: 'stopped', reason: 'failed', source: 'fault'}) as const),
];

export function isLegal(from: Status, to: Status, reason: StateChangeReason, source: TransitionSource): boolean {
  return TRANSITIONS.some(rule =>
    rule.from === from && rule.to === to && rule.reason === reason && rule.source === source);
}

/** What the reducer consumes: anything the port delivered, or a call on the main thread. */
export type ReducerInput =
  | {readonly kind: 'message'; readonly data: unknown}
  | {readonly kind: 'reset'}
  | {readonly kind: 'stop'}
  /** `processorerror`, `messageerror`, a startup timeout: fatal. */
  | {readonly kind: 'fault'; readonly error: AnalyzerError};

/** A caller command refused, for the class to throw as a `DOMException` of this name. */
export type Refusal = {readonly name: 'InvalidStateError'; readonly message: string};

export type ReducerResult = {
  readonly state: AnalyzerState;
  /** In dispatch order. */
  readonly events: readonly AnalyzerEvent[];
  /** Messages for the processor, to post after storing `state`. */
  readonly post: readonly HostMessage[];
  readonly refused: Refusal | null;
};

type ActiveState = Exclude<AnalyzerState, {status: 'stopped'}>;

export function initialState(): AnalyzerState {
  return {status: 'listening', epoch: 0, progress: 0, reason: 'started'};
}

const resetAfterStop: Refusal = {name: 'InvalidStateError', message: 'reset() after stop()'};

const unchanged = (state: AnalyzerState): ReducerResult => ({state, events: [], post: [], refused: null});

function transition(from: AnalyzerState, to: AnalyzerState, reason: StateChangeReason): AnalyzerEvent {
  return {type: 'statechange', detail: {from, to, reason}};
}

function fail(state: AnalyzerState, error: AnalyzerError): ReducerResult {
  const to: AnalyzerState = {status: 'stopped', epoch: state.epoch, error};
  // The processor is told too: a failure seen on the main thread (no ready, a protocol violation, the watchdog)
  // would otherwise leave it analysing for an analyzer that reports nothing more. A processor that failed
  // itself has stopped already, and ignores it.
  return {state: to, events: [transition(state, to, 'failed')], post: [{type: 'stop', protocol: PROTOCOL_VERSION}], refused: null};
}

const protocolError = (state: AnalyzerState, message: string) => fail(state, freeze({name: 'ProtocolError', message}));

function assertNever(value: never): never {
  throw new TypeError(`unhandled reducer input ${JSON.stringify(value)}`);
}

/**
 * The whole contract in one pure function: the next state, the events to dispatch in order, and what to post.
 * Once `stopped`, every input but `reset` is a no-op, and `reset` is refused.
 */
export function reduce(state: AnalyzerState, input: ReducerInput): ReducerResult {
  if (state.status === 'stopped') {
    return input.kind === 'reset'
      ? {...unchanged(state), refused: resetAfterStop}
      : unchanged(state);
  }

  switch (input.kind) {
    case 'reset': {
      const to: AnalyzerState = {status: 'listening', epoch: state.epoch + 1, progress: 0, reason: 'reset'};
      return {
        state: to,
        events: [transition(state, to, 'reset'), {type: 'progress', detail: {fraction: 0}}],
        post: [{type: 'reset', protocol: PROTOCOL_VERSION, epoch: to.epoch}],
        refused: null,
      };
    }
    case 'stop': {
      const to: AnalyzerState = {status: 'stopped', epoch: state.epoch, error: null};
      return {state: to, events: [transition(state, to, 'stopped')], post: [{type: 'stop', protocol: PROTOCOL_VERSION}], refused: null};
    }
    case 'fault':
      return fail(state, input.error);
    case 'message':
      return reduceMessage(state, input.data);
    default:
      return assertNever(input);
  }
}

function reduceMessage(state: ActiveState, data: unknown): ReducerResult {
  if (!isRecord(data) || data.protocol !== PROTOCOL_VERSION) {
    return protocolError(state, `processor protocol is not ${PROTOCOL_VERSION}: a stale processor file?`);
  }

  // A fatal fault ends the processor whatever epoch it was sent in: dropping it as stale would leave the
  // analyzer listening to a processor that will never send again
  if (data.type === 'fault' && data.fatal === true) {
    return fail(state, readError(data.error) ?? freeze({name: 'ProcessorError', message: 'fatal fault'}));
  }

  const {epoch} = data;
  if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 0 || epoch > state.epoch) {
    // The processor learns epochs only from reset(): one ahead of the state, or no count at all, is a bug
    return protocolError(state, `epoch ${JSON.stringify(epoch)} is not a count up to ${state.epoch}`);
  }

  if (epoch < state.epoch) {
    return unchanged(state); // Measured before the last reset(): the in-flight race, closed here
  }

  switch (data.type) {
    case 'ready':
      return unchanged(state);
    case 'debug':
      return data.engine === 'peaks' || data.engine === 'tempogram'
        ? {...unchanged(state), events: [{type: 'debug', detail: {engine: data.engine, data: data.data}}]}
        : protocolError(state, 'debug without an engine');
    case 'fault': {
      const error = readError(data.error);
      return data.fatal === false && error !== null
        ? {...unchanged(state), events: [{type: 'error', detail: error}]}
        : protocolError(state, 'fault without fatal or a known error');
    }
    case 'step':
      return reduceStep(state, data);
    default:
      // A type a later minor added, from a newer processor copy: ignored, as the processor ignores unknown host
      // messages. Its protocol and epoch passed, so it is no stale or foreign processor (PROTOCOL_VERSION)
      return unchanged(state);
  }
}

const engineReasons: readonly string[] = ['first-reading', 'locked', 'unlocked', 'pulse-lost', 'audio-lost', 'tempo-changed'] satisfies EngineReason[];

/** One analysis step: validated, checked against the table, and turned into the next state and its events. */
function reduceStep(state: ActiveState, data: Record<string, unknown>): ReducerResult {
  const {status, reason} = data;
  if (reason !== undefined && !engineReasons.includes(reason as string)) {
    return protocolError(state, `unknown reason ${JSON.stringify(reason)}`);
  }

  if (status !== 'listening' && status !== 'settling' && status !== 'locked') {
    return protocolError(state, `unknown status ${JSON.stringify(status)}`);
  }

  const engineReason = reason as EngineReason | undefined;
  const moved = status !== state.status || engineReason !== undefined;
  const repeated = state.status === 'listening' && status === 'listening' && engineReason === state.reason;
  if (moved && (engineReason === undefined || repeated || !isLegal(state.status, status, engineReason, 'engine'))) {
    return protocolError(state, `${state.status} to ${status} for ${engineReason ?? 'no reason'}`);
  }

  if (status === 'listening') {
    if (!isFraction(data.progress)) {
      return protocolError(state, 'listening step without a progress from 0 to 1');
    }

    // The table only lets these three reasons lead into listening; without one, the status held
    const entered = engineReason === 'pulse-lost' || engineReason === 'audio-lost' || engineReason === 'tempo-changed';
    const listeningReason: ListeningReason = entered ? engineReason : state.status === 'listening' ? state.reason : 'started';
    const to: AnalyzerState = {status, epoch: state.epoch, progress: data.progress, reason: listeningReason};
    const measurement: AnalyzerEvent = {type: 'progress', detail: {fraction: data.progress}};
    return {state: to, events: engineReason === undefined ? [measurement] : [transition(state, to, engineReason), measurement], post: [], refused: null};
  }

  const reading = readReading(data.reading);
  if (reading === null) {
    return protocolError(state, 'step without a valid reading');
  }

  if (state.status !== 'listening' && reading.audio.to < state.reading.audio.to) {
    return protocolError(state, 'reading audio went back in time within one epoch');
  }

  const to: AnalyzerState = {status, epoch: state.epoch, reading};
  const measurement: AnalyzerEvent = {type: 'reading', detail: reading};
  return {state: to, events: engineReason === undefined ? [measurement] : [transition(state, to, engineReason), measurement], post: [], refused: null};
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isFraction = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;
const errorNames: readonly string[] = ['ProtocolError', 'ProcessorError', 'AnalysisError'] satisfies AnalyzerError['name'][];

/** Payloads are shared by the state and every listener, so none may change one under the others. */
const freeze = <T>(value: T): T => Object.freeze(value);

function readError(value: unknown): AnalyzerError | null {
  return isRecord(value) && errorNames.includes(value.name as string) && typeof value.message === 'string'
    ? freeze({name: value.name as AnalyzerError['name'], message: value.message})
    : null;
}

function readCandidate(value: unknown, index: number, top: number): Candidate | null {
  if (!isRecord(value) || !isPositive(value.bpm)) {
    return null;
  }

  const expected: CandidateRelation = index === 0 ? 'top' : relationTo(top, value.bpm);
  return value.relation === expected && (index > 0 || value.bpm === top) ? freeze({bpm: value.bpm, relation: expected}) : null;
}

/** How far `bpmExact` may sit from `bpm`: the peaks engine's ±1 BPM window, plus half a BPM of rounding */
const EXACT_TEMPO_SPAN = 1.5;

/**
 * Checks the guarantees `Reading` documents, and rebuilds it from the known fields only, frozen: an engine
 * field added by mistake never reaches the public API.
 */
export function readReading(value: unknown): Reading | null {
  if (!isRecord(value) || !isPositive(value.bpm) || !isFraction(value.confidence)) {
    return null;
  }

  const {bpm, bpmExact, confidence, candidates, audio, engine} = value;
  if (!isPositive(bpmExact) || Math.abs(bpmExact - bpm) > EXACT_TEMPO_SPAN) {
    return null;
  }

  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 5) {
    return null;
  }

  const read = candidates.map((candidate: unknown, index) => readCandidate(candidate, index, bpm));
  const audioOk = isRecord(audio) && typeof audio.from === 'number' && typeof audio.to === 'number'
    && audio.from >= 0 && audio.from <= audio.to && Number.isFinite(audio.to)
    && (audio.contextTime === null || (typeof audio.contextTime === 'number' && Number.isFinite(audio.contextTime) && audio.contextTime >= 0));
  if (read.includes(null) || !audioOk || (engine !== 'peaks' && engine !== 'tempogram')) {
    return null;
  }

  return freeze({
    bpm,
    bpmExact,
    confidence,
    candidates: freeze(read as Candidate[]),
    audio: freeze({from: audio.from as number, to: audio.to as number, contextTime: audio.contextTime as number | null}),
    engine,
  });
}

/** A candidate's relation to the top tempo: the engine labels candidates with it, and the reducer checks. */
export function relationTo(top: number, bpm: number): Exclude<CandidateRelation, 'top'> {
  const near = (target: number) => Math.abs(bpm - target) <= target * RELATION_TOLERANCE;
  if (near(top / 2)) {
    return 'half';
  }

  return near(top * 2) ? 'double' : 'other';
}

/** Commands queued from listeners during one dispatch. A listener that resets on every event hits it. */
export const MAX_QUEUED_COMMANDS = 16;

export type Dispatcher = {
  readonly state: () => AnalyzerState;
  /** Applies an input, or queues it when called from a listener. Returns a refusal for the caller to throw. */
  readonly apply: (input: ReducerInput) => Refusal | null;
};

/**
 * The analyzer's dispatch loop: store the state, post, then dispatch every event of the step in order. A
 * command from a listener waits until the step is fully dispatched, so every listener sees the same events
 * against the same state. Bounded: past {@link MAX_QUEUED_COMMANDS} it throws rather than loop.
 */
export function createDispatcher(
  emit: (event: AnalyzerEvent) => void,
  post: (message: HostMessage) => void,
  initial: AnalyzerState = initialState(),
): Dispatcher {
  let state = initial;
  let dispatching = false;
  const queue: ReducerInput[] = [];

  const run = (input: ReducerInput): Refusal | null => {
    const result = reduce(state, input);
    state = result.state;
    result.post.forEach(post);
    result.events.forEach(emit);
    return result.refused;
  };

  const apply = (input: ReducerInput): Refusal | null => {
    if (dispatching) {
      // A stop or a fault queued ahead ends the dispatch stopped: the reset after it must throw now, as it
      // would once stopped, rather than be refused in the loop where nobody reads the refusal
      if (input.kind === 'reset' && (state.status === 'stopped' || queue.some(({kind}) => kind === 'stop' || kind === 'fault'))) {
        return resetAfterStop;
      }

      if (queue.length >= MAX_QUEUED_COMMANDS) {
        throw new RangeError(`more than ${MAX_QUEUED_COMMANDS} commands queued from listeners in one dispatch`);
      }

      queue.push(input);
      return null;
    }

    dispatching = true;
    try {
      const refused = run(input);
      for (let index = 0; index < MAX_QUEUED_COMMANDS && queue.length > 0; index += 1) {
        run(queue.shift()!);
      }

      if (queue.length > 0) {
        throw new RangeError(`listeners kept queueing commands past ${MAX_QUEUED_COMMANDS} in one dispatch`);
      }

      return refused;
    } finally {
      queue.length = 0;
      dispatching = false;
    }
  };

  return {state: () => state, apply};
}
