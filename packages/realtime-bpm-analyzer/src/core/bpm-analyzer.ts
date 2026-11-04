import {createDispatcher} from '../contract/transitions';
import type {Dispatcher} from '../contract/transitions';
import {compatibleProtocol} from '../contract/protocol';
import {PROTOCOL, type ProtocolVersion} from '../contract/types';
import type {
  AnalyzerError,
  AnalyzerEvent,
  AnalyzerEventMap,
  AnalyzerEventType,
  AnalyzerState,
  BpmAnalyzerContract,
  ListenOptions,
} from '../contract/types';
import {contextNow, type Heard} from './context-now';
import {followTrackClock} from './sample-clock';

/**
 * How long the factory waits for the processor's `ready`. A 5.x processor (a stale `processorUrl` copy) never
 * sends one, so this is how it fails loudly at startup. The context is already running when the wait starts.
 */
export const readyTimeoutMs = 5000;

/**
 * How long after a `reset()` the processor may still send messages of older epochs before it is judged deaf to it.
 * Judged by when the processor sent each one (its `at`, the worklet's `currentTime`), not when the main thread got
 * to it: the port is FIFO and the audio clock runs while the main thread is blocked, so a backlog sent before the
 * worklet adopted the reset arrives late but stamped early, and a processor that keeps sending old epochs is
 * stamped later and later. Context time, because a suspended context sends nothing and must not fail an analyzer.
 */
export const staleAfterSeconds = 1;

type Listener = (detail: never) => void;

/** What the factory needs to wait on, kept off the public class */
const readiness = new WeakMap<BpmAnalyzer, Promise<void>>();

/** The processor's protocol from its first `ready`, kept off the public class */
const processorProtocols = new WeakMap<BpmAnalyzer, ProtocolVersion>();

/** How to fail each analyzer, kept off the public class: no caller may fail one */
const faults = new WeakMap<BpmAnalyzer, (error: AnalyzerError) => void>();

/** Proves a construction comes from this module: `new BpmAnalyzer()` from outside throws */
const constructionKey = Symbol('BpmAnalyzer construction');

/**
 * Fails the analyzer: `stopped` with reason `failed`
 * @param analyzer The analyzer
 * @param error What failed
 */
export function failAnalyzer(analyzer: BpmAnalyzer, error: AnalyzerError): void {
  faults.get(analyzer)?.(error);
}

/**
 * Builds an analyzer, the factory's only way to: the class keeps its constructor private
 * @param workletNode The AudioWorkletNode running the processor
 * @param createInput Builds the node sources connect to, when it is not the worklet itself
 * @param liveInput The track of a MediaStream source, whose clock keeps the analyzer's time true
 * @returns The analyzer
 */
export function constructAnalyzer(workletNode: AudioWorkletNode, createInput?: () => AudioNode, liveInput?: MediaStreamTrack): BpmAnalyzer {
  return construct(workletNode, createInput, liveInput);
}

// Assigned by the class's static block, the one place allowed to call its private constructor
let construct: typeof constructAnalyzer;

/**
 * The protocol the processor said it speaks in its first `ready`
 * @param analyzer The analyzer
 * @returns Its version, or `null` before `ready`. A feature that needs a later minor (beats, RBA-109) checks it,
 * and fails at once when the processor copy is out of date.
 */
export const processorProtocol = (analyzer: BpmAnalyzer): ProtocolVersion | null => processorProtocols.get(analyzer) ?? null;

/**
 * Waits for the processor's first `ready`
 * @param analyzer The analyzer
 * @param timeoutMs How long to wait
 * @returns Resolves on `ready`, and rejects when the analyzer fails or the time runs out, which fails it
 */
export async function whenReady(analyzer: BpmAnalyzer, timeoutMs = readyTimeoutMs): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      failAnalyzer(analyzer, {name: 'ProtocolError', message: `the processor sent no ready within ${timeoutMs} ms: a stale processor file?`});
      reject(new Error('unreachable'));
    }, timeoutMs);
  });

  try {
    await Promise.race([readiness.get(analyzer), timeout]);
  } catch {
    const {state} = analyzer;
    const error = state.status === 'stopped' ? state.error : null;
    const failure = new Error(`realtime-bpm-analyzer processor failed to start: ${error?.message ?? 'unknown error'}`);
    failure.name = error?.name ?? 'ProcessorError';
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Real-time BPM analyzer: the `AudioNode`-like `EventTarget` that `createRealtimeBpmAnalyzer` returns.
 *
 * @remarks
 * `state` says what it is doing (`listening`, `settling`, `locked`, `stopped`), and events announce changes and
 * measurements: `statechange`, `reading`, `progress`, `error`, and `debug` with `debug: true`. Each analysis
 * step updates `state` first, then dispatches `statechange` if the status moved, then `reading` or `progress`.
 * A listener added late reads `state`: events are never replayed.
 *
 * @example
 * ```typescript
 * const analyzer = await createRealtimeBpmAnalyzer(audioContext);
 * source.connect(analyzer.input);
 *
 * analyzer.on('statechange', ({to}) => {
 *   if (to.status === 'locked') {
 *     console.log('Locked on', to.reading.bpm);
 *   }
 * });
 * const unsubscribe = analyzer.on('reading', reading => {
 *   console.log(reading.bpm, reading.candidates);
 * });
 *
 * analyzer.reset(); // new track: listening again, nothing measured before is reported
 * unsubscribe();
 * analyzer.stop();  // final
 * ```
 *
 * @group Classes
 */
export class BpmAnalyzer extends EventTarget implements BpmAnalyzerContract {
  /**
   * The underlying AudioWorkletNode
   * @remarks
   * Exposed for advanced use cases. Most users should interact with the BpmAnalyzer API instead.
   */
  readonly node: AudioWorkletNode;

  /**
   * Where to connect the audio source: `source.connect(analyzer.input)`
   * @remarks
   * Holds what the engine needs in front of it, the lowpass for `peaks` and nothing for `tempogram`, so changing
   * engine never changes the graph. Built on first use.
   */
  get input(): AudioNode {
    this.inputNode ??= this.createInput();

    return this.inputNode;
  }

  /** The current snapshot: see `AnalyzerState` for its guarantees */
  get state(): AnalyzerState {
    return this.dispatcher.state();
  }

  private inputNode?: AudioNode;
  private readonly createInput: () => AudioNode;
  private readonly stopFollowing: () => void;
  private readonly dispatcher: Dispatcher;
  private readonly listeners = new Map<AnalyzerEventType, Map<Listener, EventListener>>();
  // Per wrapper, how to drop its `signal`'s abort listener, so an unsubscribed listener leaves nothing on the signal
  private readonly abortDetach = new WeakMap<EventListener, () => void>();
  // The context time of the last reset(), while messages of older epochs are still expected
  private resetAt: number | null = null;
  // The last processor message's send time, for a clock that runs on where currentTime freezes (see contextNow)
  private heard: Heard | null = null;
  private markReady: () => void = () => undefined;
  private markFailed: () => void = () => undefined;

  static {
    construct = (workletNode, createInput, liveInput) => new BpmAnalyzer(constructionKey, workletNode, createInput, liveInput);
  }

  /**
   * Private: `createRealtimeBpmAnalyzer` is the only way in. The key refuses a JavaScript caller the type
   * would not stop.
   * @hidden
   */
  private constructor(key: typeof constructionKey, workletNode: AudioWorkletNode, createInput: () => AudioNode = () => workletNode, liveInput?: MediaStreamTrack) {
    if (key !== constructionKey) {
      throw new TypeError('BpmAnalyzer cannot be built with new: call createRealtimeBpmAnalyzer()');
    }

    super();
    this.node = workletNode;
    this.createInput = createInput;
    readiness.set(this, new Promise<void>((resolve, reject) => {
      this.markReady = resolve;
      this.markFailed = reject;
    }));
    // Nobody may wait on it: a rejection nobody reads must not be reported as unhandled
    readiness.get(this)?.catch(() => undefined);
    faults.set(this, error => {
      this.dispatcher.apply({kind: 'fault', error: Object.freeze({...error})});
      this.settle();
    });
    this.dispatcher = createDispatcher(event => {
      this.emit(event);
    }, message => {
      this.node.port.postMessage(message);
    });
    this.stopFollowing = liveInput
      ? followTrackClock(liveInput, seconds => {
        if (this.state.status !== 'stopped') {
          this.node.port.postMessage({type: 'delivered', protocol: PROTOCOL, seconds});
        }
      })
      : () => undefined;
    this.node.port.onmessage = (event: MessageEvent<unknown>) => {
      this.receive(event.data);
    };
    this.node.port.onmessageerror = () => {
      failAnalyzer(this, {name: 'ProcessorError', message: 'a processor message could not be deserialised'});
    };
    this.node.onprocessorerror = () => {
      failAnalyzer(this, {name: 'ProcessorError', message: 'the processor threw (processorerror)'});
    };
  }

  /**
   * Starts over: `listening` with the next epoch, then `statechange` (reason `reset`) and `progress` 0.
   * Nothing measured before the call is reported after it.
   * @throws {DOMException} `InvalidStateError` once stopped
   */
  reset(): void {
    this.resetAt = contextNow(this.node.context, this.heard);
    const refused = this.dispatcher.apply({kind: 'reset'});
    // A listener of the reset may have stopped the analyzer
    this.settle();
    if (refused !== null) {
      throw new DOMException(refused.message, refused.name);
    }
  }

  /** Final: moves to `stopped` and stops the processor. A second call does nothing. */
  stop(): void {
    this.dispatcher.apply({kind: 'stop'});
    this.settle();
  }

  /**
   * Adds a listener for an event's payload
   * @param type - The event
   * @param listener - Called with the payload
   * @param options - `once`, and a `signal` that removes the listener when it aborts
   * @returns The function that removes the listener
   */
  on<K extends AnalyzerEventType>(
    type: K,
    listener: (detail: AnalyzerEventMap[K]) => void,
    options?: ListenOptions,
  ): () => void {
    const byType = this.listeners.get(type) ?? new Map<Listener, EventListener>();
    this.listeners.set(type, byType);
    const existing = byType.get(listener);
    if (existing !== undefined) {
      return () => {
        this.removeIfCurrent(type, listener, existing);
      };
    }

    if (options?.signal?.aborted) {
      return () => undefined;
    }

    const wrapper: EventListener = event => {
      if (options?.once) {
        this.removeIfCurrent(type, listener, wrapper);
      }

      listener((event as CustomEvent<AnalyzerEventMap[K]>).detail);
    };

    byType.set(listener, wrapper);
    this.addEventListener(type, wrapper);
    const signal = options?.signal;
    if (signal !== undefined) {
      const onAbort = () => {
        this.removeIfCurrent(type, listener, wrapper);
      };

      signal.addEventListener('abort', onAbort, {once: true});
      this.abortDetach.set(wrapper, () => {
        signal.removeEventListener('abort', onAbort);
      });
    }

    return () => {
      this.removeIfCurrent(type, listener, wrapper);
    };
  }

  /**
   * Removes a listener added with `on()`. Unknown listeners are ignored.
   * @param type - The event
   * @param listener - The listener given to `on()`
   */
  off<K extends AnalyzerEventType>(type: K, listener: (detail: AnalyzerEventMap[K]) => void): void {
    const wrapper = this.listeners.get(type)?.get(listener);
    if (wrapper !== undefined) {
      this.removeIfCurrent(type, listener, wrapper);
    }
  }

  /**
   * Connect the analyzer to an audio destination
   *
   * @param destinationNode - The destination node to connect to
   * @param outputIndex - The output index (default: 0)
   * @param inputIndex - The input index on the destination (default: 0)
   * @returns The destination node for chaining
   *
   * @example
   * ```typescript
   * analyzer.connect(audioContext.destination);
   * ```
   */
  connect(
    destinationNode: AudioNode,
    outputIndex?: number,
    inputIndex?: number,
  ): AudioNode;
  connect(destinationParameter: AudioParam, outputIndex?: number): void;
  connect(
    destination: AudioNode | AudioParam,
    outputIndex = 0,
    inputIndex = 0,
  ): AudioNode | void {
    if (destination instanceof AudioNode) {
      return this.node.connect(destination, outputIndex, inputIndex);
    }

    this.node.connect(destination, outputIndex);
  }

  /**
   * Disconnect the analyzer from all destinations or a specific destination
   *
   * @param destinationNode - Optional destination node to disconnect from
   * @param outputIndex - The output index (default: 0)
   * @param inputIndex - The input index on the destination (default: 0)
   *
   * @example
   * ```typescript
   * // Disconnect from all destinations
   * analyzer.disconnect();
   *
   * // Disconnect from a specific destination
   * analyzer.disconnect(audioContext.destination);
   * ```
   */
  disconnect(
    destinationNode?: AudioNode,
    outputIndex?: number,
    inputIndex?: number,
  ): void;
  disconnect(destinationParameter?: AudioParam, outputIndex?: number): void;
  disconnect(
    destination?: AudioNode | AudioParam | number,
    output?: number,
    input?: number,
  ): void {
    if (destination === undefined) {
      this.node.disconnect();
    } else if (typeof destination === 'number') {
      this.node.disconnect(destination);
    } else if (destination instanceof AudioNode) {
      if (output !== undefined && input !== undefined) {
        this.node.disconnect(destination, output, input);
      } else if (output === undefined) {
        this.node.disconnect(destination);
      } else {
        this.node.disconnect(destination, output);
      }
    } else if (destination instanceof AudioParam) {
      if (output === undefined) {
        this.node.disconnect(destination);
      } else {
        this.node.disconnect(destination, output);
      }
    }
  }

  /** Removes a listener only if `on()` still holds this wrapper for it, so a stale unsubscribe is harmless */
  private removeIfCurrent(type: AnalyzerEventType, listener: Listener, wrapper: EventListener): void {
    const byType = this.listeners.get(type);
    if (byType?.get(listener) !== wrapper) {
      return;
    }

    byType.delete(listener);
    this.removeEventListener(type, wrapper);
    this.abortDetach.get(wrapper)?.();
    this.abortDetach.delete(wrapper);
  }

  private emit(event: AnalyzerEvent): void {
    this.dispatchEvent(new CustomEvent(event.type, {detail: event.detail}));
  }

  /** Every port message goes through the reducer; `ready` and the epoch watchdog are read on the way */
  private receive(data: unknown): void {
    if (this.state.status === 'stopped') {
      return;
    }

    const message = typeof data === 'object' && data !== null ? data as {type?: unknown; protocol?: unknown; epoch?: unknown; at?: unknown} : null;
    const protocol = message?.type === 'ready' && message.epoch === 0 ? compatibleProtocol(message.protocol) : null;
    if (protocol !== null) {
      processorProtocols.set(this, protocol);
      this.markReady();
    }

    if (typeof message?.at === 'number' && Number.isFinite(message.at)) {
      this.heard = {at: message.at, wall: performance.now()};
    }

    const epoch = this.state.epoch;
    if (message?.epoch === epoch) {
      this.resetAt = null;
    }

    const stale = typeof message?.epoch === 'number' && message.epoch < epoch && message.type !== 'fault';
    if (stale && message !== null && this.resetAt !== null) {
      const {at} = message;
      if (typeof at !== 'number' || !Number.isFinite(at)) {
        failAnalyzer(this, {name: 'ProtocolError', message: 'a processor message without its send time: a stale processor file?'});
        return;
      }

      if (at - this.resetAt > staleAfterSeconds) {
        failAnalyzer(this, {name: 'ProtocolError', message: `the processor kept sending epoch ${String(message.epoch)} after reset() moved to ${epoch}`});
        return;
      }
    }

    this.dispatcher.apply({kind: 'message', data});
    this.settle();
  }

  /** Once stopped, for any reason: the track clock stops, and a factory still waiting is told */
  private settle(): void {
    if (this.state.status === 'stopped') {
      this.stopFollowing();
      this.markFailed();
    }
  }

  /**
   * Get the audio context associated with this analyzer
   */
  get context(): BaseAudioContext {
    return this.node.context;
  }

  /**
   * Get the number of inputs
   */
  get numberOfInputs(): number {
    return this.node.numberOfInputs;
  }

  /**
   * Get the number of outputs
   */
  get numberOfOutputs(): number {
    return this.node.numberOfOutputs;
  }

  /**
   * Get the channel count
   */
  get channelCount(): number {
    return this.node.channelCount;
  }

  set channelCount(value: number) {
    this.node.channelCount = value;
  }

  /**
   * Get the channel count mode
   */
  get channelCountMode(): ChannelCountMode {
    return this.node.channelCountMode;
  }

  set channelCountMode(value: ChannelCountMode) {
    this.node.channelCountMode = value;
  }

  /**
   * Get the channel interpretation
   */
  get channelInterpretation(): ChannelInterpretation {
    return this.node.channelInterpretation;
  }

  set channelInterpretation(value: ChannelInterpretation) {
    this.node.channelInterpretation = value;
  }
}
