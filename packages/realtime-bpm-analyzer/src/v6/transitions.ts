/**
 * The v6 state contract as data and one pure reducer. The analyzer class (phase 3) owns no transition logic of
 * its own: it feeds every worklet message and every caller command through `reduce`, stores the state, posts
 * what it returns and dispatches the events with `dispatchInOrder`. Design note: `./readme.md`.
 */
import {
  PROTOCOL_VERSION,
  RELATION_TOLERANCE,
  type ActiveStatus,
  type AnalyzerError,
  type AnalyzerEvent,
  type AnalyzerState,
  type CandidateRelation,
  type EngineReason,
  type HostMessage,
  type Reading,
  type StateChangeReason,
  type Status,
  type WorkletMessage,
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
 * Every legal transition. Anything not listed is refused. Nothing leaves `stopped`. The engine never moves
 * from a status to itself: a step that keeps its status just updates the reading or the progress.
 */
export const TRANSITIONS: readonly TransitionRule[] = [
  {from: 'listening', to: 'settling', reason: 'first-reading', source: 'engine'},
  {from: 'settling', to: 'locked', reason: 'locked', source: 'engine'},
  {from: 'locked', to: 'settling', reason: 'unlocked', source: 'engine'},
  ...(['pulse-lost', 'audio-lost', 'tempo-changed'] as const).flatMap(reason => [
    {from: 'settling', to: 'listening', reason, source: 'engine'} as const,
    {from: 'locked', to: 'listening', reason, source: 'engine'} as const,
  ]),
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
  /** `processorerror`, `messageerror` or a failed startup: fatal. */
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

export function initialState(): AnalyzerState {
  return {status: 'listening', epoch: 0, progress: 0};
}

const unchanged = (state: AnalyzerState): ReducerResult => ({state, events: [], post: [], refused: null});

const withError = (state: AnalyzerState, error: AnalyzerError): ReducerResult =>
  ({state, events: [{type: 'error', detail: error}], post: [], refused: null});

function transition(from: AnalyzerState, to: AnalyzerState, reason: StateChangeReason): AnalyzerEvent {
  return {type: 'statechange', detail: {from, to, reason}};
}

function fail(state: AnalyzerState, error: AnalyzerError): ReducerResult {
  const to: AnalyzerState = {status: 'stopped', epoch: state.epoch, error};
  return {state: to, events: [transition(state, to, 'failed')], post: [], refused: null};
}

/**
 * The whole contract in one pure function: the next state, the events to dispatch in order, and what to post.
 * Once `stopped`, every input but `reset` is a no-op, and `reset` is refused.
 */
export function reduce(state: AnalyzerState, input: ReducerInput): ReducerResult {
  if (state.status === 'stopped') {
    return input.kind === 'reset'
      ? {...unchanged(state), refused: {name: 'InvalidStateError', message: 'reset() after stop()'}}
      : unchanged(state);
  }

  switch (input.kind) {
    case 'reset': {
      const to: AnalyzerState = {status: 'listening', epoch: state.epoch + 1, progress: 0};
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
  }
}

function reduceMessage(state: Exclude<AnalyzerState, {status: 'stopped'}>, data: unknown): ReducerResult {
  const header = readHeader(data);
  if (header === null) {
    return fail(state, {name: 'ProtocolMismatch', message: `processor protocol is not ${PROTOCOL_VERSION}: a stale processor file?`});
  }

  // A fatal fault ends the processor whatever epoch it was sent in: dropping it as stale would leave the
  // analyzer listening to a processor that will never send again
  const {record} = header;
  if (record.type === 'fault' && record.fatal === true) {
    return fail(state, isError(record.error) ? record.error : {name: 'ProcessorError', message: 'fatal fault'});
  }

  if (header.epoch < state.epoch) {
    return unchanged(state); // Measured before the last reset(): the in-flight race, closed here
  }

  if (header.epoch > state.epoch) {
    return withError(state, malformed(`epoch ${header.epoch} is ahead of ${state.epoch}`));
  }

  const message = parseMessage(record);
  if (typeof message === 'string') {
    return withError(state, malformed(message));
  }

  switch (message.type) {
    case 'ready':
      return unchanged(state);
    case 'debug':
      return {...unchanged(state), events: [{type: 'debug', detail: {engine: message.engine, data: message.data}}]};
    case 'fault':
      return message.fatal ? fail(state, message.error) : withError(state, message.error);
    case 'step':
      return reduceStep(state, message);
  }
}

type StepMessage = Extract<WorkletMessage, {type: 'step'}>;

function reduceStep(state: Exclude<AnalyzerState, {status: 'stopped'}>, step: StepMessage): ReducerResult {
  const moved = step.status !== state.status;
  if (moved !== (step.reason !== undefined)) {
    return withError(state, {name: 'IllegalTransition', message: moved ? `${state.status} to ${step.status} without a reason` : `reason ${step.reason} without a change from ${state.status}`});
  }

  if (step.reason !== undefined && !isLegal(state.status, step.status, step.reason, 'engine')) {
    return withError(state, {name: 'IllegalTransition', message: `${state.status} to ${step.status} for ${step.reason}`});
  }

  if (step.status !== 'listening' && state.status !== 'listening' && step.reading.audio.to < state.reading.audio.to) {
    return withError(state, malformed('reading audio went back in time within one epoch'));
  }

  const to: AnalyzerState = step.status === 'listening'
    ? {status: 'listening', epoch: state.epoch, progress: step.progress}
    : {status: step.status, epoch: state.epoch, reading: step.reading};
  const measurement: AnalyzerEvent = step.status === 'listening'
    ? {type: 'progress', detail: {fraction: step.progress}}
    : {type: 'reading', detail: step.reading};
  const events = step.reason === undefined ? [measurement] : [transition(state, to, step.reason), measurement];

  return {state: to, events, post: [], refused: null};
}

const malformed = (message: string): AnalyzerError => ({name: 'MalformedMessage', message});

/** The protocol and epoch, or null when the message is not this protocol's: a 5.x processor sends neither. */
function readHeader(data: unknown): {record: Record<string, unknown>; epoch: number} | null {
  if (!isRecord(data) || data.protocol !== PROTOCOL_VERSION) {
    return null;
  }

  // An epoch that is not a count reads as ahead of any state, so it is reported, not silently dropped
  const {epoch} = data;
  const valid = typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch >= 0;
  return {record: data, epoch: valid ? epoch : Infinity};
}

/**
 * Validates a message whose header already passed, and returns the reason as a string when it fails.
 * The casts below follow the checks that justify them: this is the one boundary where port data is trusted.
 */
function parseMessage(data: Record<string, unknown>): WorkletMessage | string {
  switch (data.type) {
    case 'ready':
      return data as WorkletMessage;
    case 'debug':
      return data.engine === 'peaks' || data.engine === 'tempogram' ? data as WorkletMessage : 'debug without an engine';
    case 'fault':
      return typeof data.fatal === 'boolean' && isError(data.error) ? data as WorkletMessage : 'fault without fatal or error';
    case 'step':
      return parseStep(data);
    default:
      return `unknown message type ${String(data.type)}`;
  }
}

const engineReasons: readonly string[] = ['first-reading', 'locked', 'unlocked', 'pulse-lost', 'audio-lost', 'tempo-changed'] satisfies EngineReason[];

function parseStep(data: Record<string, unknown>): WorkletMessage | string {
  if (data.reason !== undefined && !engineReasons.includes(data.reason as string)) {
    return `unknown reason ${String(data.reason)}`;
  }

  if (data.status === 'listening') {
    return isFraction(data.progress) ? data as WorkletMessage : 'listening step without a progress from 0 to 1';
  }

  if (data.status === 'settling' || data.status === 'locked') {
    return isReading(data.reading) ? data as WorkletMessage : 'step without a valid reading';
  }

  return `unknown status ${String(data.status)}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isFraction = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;
const relations: readonly string[] = ['top', 'half', 'double', 'other'] satisfies CandidateRelation[];
const errorNames: readonly string[] = ['ProtocolMismatch', 'MalformedMessage', 'IllegalTransition', 'ProcessorError', 'AnalysisError'] satisfies AnalyzerError['name'][];

function isError(value: unknown): value is AnalyzerError {
  return isRecord(value) && errorNames.includes(value.name as string) && typeof value.message === 'string';
}

/** The guarantees `Reading` documents, checked once at the boundary. */
export function isReading(value: unknown): value is Reading {
  if (!isRecord(value) || !isPositive(value.bpm) || !isFraction(value.confidence)) {
    return false;
  }

  const {candidates, audio, engine} = value;
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 5) {
    return false;
  }

  const candidatesOk = candidates.every((candidate: unknown, index) =>
    isRecord(candidate) && isPositive(candidate.bpm) && relations.includes(candidate.relation as string)
    && (candidate.relation === 'top') === (index === 0));
  const top: unknown = candidates[0];
  const audioOk = isRecord(audio) && typeof audio.from === 'number' && typeof audio.to === 'number'
    && audio.from >= 0 && audio.from <= audio.to && Number.isFinite(audio.to);

  return candidatesOk && isRecord(top) && top.bpm === value.bpm && audioOk && (engine === 'peaks' || engine === 'tempogram');
}

/** A candidate's relation to the top tempo, for the engine to label candidates the same way. */
export function relationTo(top: number, bpm: number): Exclude<CandidateRelation, 'top'> {
  const near = (target: number) => Math.abs(bpm - target) <= target * RELATION_TOLERANCE;
  if (near(top / 2)) {
    return 'half';
  }

  return near(top * 2) ? 'double' : 'other';
}

/**
 * Dispatches a step's events in order, and stops as soon as a listener has moved the state (a `reset()` or a
 * `stop()` inside a listener): the rest belong to a state that no longer exists.
 * Returns how many were dispatched.
 */
export function dispatchInOrder(
  result: ReducerResult,
  current: () => AnalyzerState,
  emit: (event: AnalyzerEvent) => void,
): number {
  let dispatched = 0;
  for (const event of result.events) {
    if (current() !== result.state) {
      break;
    }

    emit(event);
    dispatched += 1;
  }

  return dispatched;
}
