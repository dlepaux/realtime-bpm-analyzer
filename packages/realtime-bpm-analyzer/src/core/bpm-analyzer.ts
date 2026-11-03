import {createDispatcher} from '../contract/transitions';
import type {Dispatcher} from '../contract/transitions';
import {PROTOCOL_VERSION} from '../contract/types';
import type {
  AnalyzerError,
  AnalyzerEvent,
  AnalyzerEventMap,
  AnalyzerEventType,
  AnalyzerState,
  BpmAnalyzerContract,
  ListenOptions,
} from '../contract/types';
import {followTrackClock} from './sample-clock';

/**
 * How long the factory waits for the processor's `ready`. A 5.x processor (a stale `processorUrl` copy) never
 * sends one, so this is how it fails loudly at startup. The context is already running when the wait starts.
 */
export const readyTimeoutMs = 5000;

/**
 * Messages from older epochs tolerated after a `reset()` before the processor is judged deaf to it. About as
 * many as arrive in 1.5 s of listening steps: a healthy processor sends one or two in flight. Counted rather
 * than timed, because a suspended context sends nothing at all, and a timer would fail an analyzer that is fine.
 */
export const staleMessagesTolerated = 16;

type Listener = (detail: never) => void;

/** What the factory needs to wait on, kept off the public class */
const readiness = new WeakMap<BpmAnalyzer, Promise<void>>();

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
      analyzer.fault({name: 'ProtocolError', message: `the processor sent no ready within ${timeoutMs} ms: a stale processor file?`});
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
  private staleMessages = 0;
  private markReady: () => void = () => undefined;
  private markFailed: () => void = () => undefined;

  /**
   * @param workletNode - The AudioWorkletNode running the processor
   * @param createInput - Builds the node sources connect to, when it is not the worklet itself
   * @param liveInput - The track of a MediaStream source, whose clock keeps the analyzer's time true
   * @hidden
   */
  constructor(workletNode: AudioWorkletNode, createInput: () => AudioNode = () => workletNode, liveInput?: MediaStreamTrack) {
    super();
    this.node = workletNode;
    this.createInput = createInput;
    readiness.set(this, new Promise<void>((resolve, reject) => {
      this.markReady = resolve;
      this.markFailed = reject;
    }));
    // Nobody may wait on it: a rejection nobody reads must not be reported as unhandled
    readiness.get(this)?.catch(() => undefined);
    this.dispatcher = createDispatcher(event => {
      this.emit(event);
    }, message => {
      this.node.port.postMessage(message);
    });
    this.stopFollowing = liveInput
      ? followTrackClock(liveInput, seconds => {
        if (this.state.status !== 'stopped') {
          this.node.port.postMessage({type: 'delivered', protocol: PROTOCOL_VERSION, seconds});
        }
      })
      : () => undefined;
    this.node.port.onmessage = (event: MessageEvent<unknown>) => {
      this.receive(event.data);
    };
    this.node.port.onmessageerror = () => {
      this.fault({name: 'ProcessorError', message: 'a processor message could not be deserialised'});
    };
    this.node.onprocessorerror = () => {
      this.fault({name: 'ProcessorError', message: 'the processor threw (processorerror)'});
    };
  }

  /**
   * Starts over: `listening` with the next epoch, then `statechange` (reason `reset`) and `progress` 0.
   * Nothing measured before the call is reported after it.
   * @throws {DOMException} `InvalidStateError` once stopped
   */
  reset(): void {
    this.staleMessages = 0;
    const refused = this.dispatcher.apply({kind: 'reset'});
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
    options?.signal?.addEventListener('abort', () => {
      this.removeIfCurrent(type, listener, wrapper);
    }, {once: true});

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
   * Fails the analyzer: `stopped` with reason `failed`
   * @param error - What failed
   * @hidden
   */
  fault(error: AnalyzerError): void {
    this.dispatcher.apply({kind: 'fault', error: Object.freeze({...error})});
    this.settle();
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
  }

  private emit(event: AnalyzerEvent): void {
    this.dispatchEvent(new CustomEvent(event.type, {detail: event.detail}));
  }

  /** Every port message goes through the reducer; `ready` and the epoch watchdog are read on the way */
  private receive(data: unknown): void {
    if (this.state.status === 'stopped') {
      return;
    }

    const message = typeof data === 'object' && data !== null ? data as {type?: unknown; protocol?: unknown; epoch?: unknown} : null;
    if (message?.type === 'ready' && message.protocol === PROTOCOL_VERSION && message.epoch === 0) {
      this.markReady();
    }

    const epoch = this.state.epoch;
    const stale = typeof message?.epoch === 'number' && message.epoch < epoch && message.type !== 'fault';
    this.staleMessages = stale ? this.staleMessages + 1 : message?.epoch === epoch ? 0 : this.staleMessages;
    if (this.staleMessages > staleMessagesTolerated) {
      this.fault({name: 'ProtocolError', message: `the processor kept sending epoch ${String(message?.epoch)} after reset() moved to ${epoch}`});
      return;
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
