import type {BpmAnalyzerEventMap, ProcessorOutputEvent, ProcessorInputEvent} from './types';

/**
 * Custom event class for BPM analyzer events with typed data
 * @internal
 */
class BpmAnalyzerEvent<T> extends CustomEvent<T> {
  constructor(type: string, data: T) {
    super(type, {detail: data});
  }
}

/**
 * Real-time BPM analyzer with typed event listeners.
 *
 * This class wraps an AudioWorkletNode and provides a clean, type-safe API
 * for analyzing beats per minute in real-time audio streams.
 *
 * @remarks
 * This class extends native EventTarget to provide typed event listeners
 * with full TypeScript autocomplete support. It implements the AudioNode
 * interface for seamless integration into Web Audio API graphs.
 *
 * @example
 * **Basic Usage**
 * ```typescript
 * const audioContext = new AudioContext();
 * const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
 *
 * // Listen for BPM events with full type safety
 * bpmAnalyzer.on('bpm', (data) => {
 *   console.log('Current BPM:', data.bpm[0].tempo);
 * });
 *
 * bpmAnalyzer.on('bpmStable', (data) => {
 *   console.log('Stable BPM:', data.bpm[0].tempo);
 *   console.log('Confidence:', data.bpm[0].count);
 * });
 *
 * // Connect to audio source - use .node for audio connections
 * const source = audioContext.createMediaElementSource(audioElement);
 * source.connect(bpmAnalyzer.node);
 * bpmAnalyzer.node.connect(audioContext.destination);
 * ```
 *
 * @example
 * **One-time Listeners**
 * ```typescript
 * analyzer.once('bpmStable', (data) => {
 *   console.log('First stable detection:', data.bpm[0].tempo);
 *   // This listener will be automatically removed after firing
 * });
 * ```
 *
 * @example
 * **Removing Listeners**
 * ```typescript
 * // Store handler reference for cleanup
 * const handleBPM = (event) => {
 *   console.log('BPM:', event.detail.bpm);
 * };
 *
 * // Add listener using native EventTarget API
 * analyzer.addEventListener('bpm', handleBPM);
 *
 * // Remove with same reference
 * analyzer.removeEventListener('bpm', handleBPM);
 * ```
 *
 * @example
 * **Controlling the Analyzer**
 * ```typescript
 * // Reset the analyzer state
 * analyzer.reset();
 *
 * // Stop analysis
 * analyzer.stop();
 *
 * // Disconnect from audio graph
 * analyzer.disconnect();
 * ```
 *
 * @group Classes
 */
export class BpmAnalyzer extends EventTarget {
  /**
   * The underlying AudioWorkletNode
   * @remarks
   * Exposed for advanced use cases. Most users should interact with the
   * BpmAnalyzer API instead of directly accessing the worklet node.
   */
  readonly node: AudioWorkletNode;

  /**
   * Creates a new BpmAnalyzer instance
   * @param workletNode - The AudioWorkletNode to wrap
   */
  constructor(workletNode: AudioWorkletNode) {
    super();
    this.node = workletNode;
    this.setupMessageHandler();
  }

  /**
   * Reset the analyzer state to start fresh analysis
   *
   * @remarks
   * This clears all internal state including detected peaks and intervals,
   * allowing the analyzer to start analyzing as if it were newly created.
   *
   * @example
   * ```typescript
   * // When switching to a different audio source
   * audioElement.src = 'new-song.mp3';
   * analyzer.reset();
   * ```
   */
  reset(): void {
    this.sendControlMessage({type: 'reset'});
  }

  /**
   * Stop the analyzer
   *
   * @remarks
   * This stops the analysis and resets the internal state. The analyzer
   * will no longer emit events until analysis is restarted.
   *
   * @example
   * ```typescript
   * analyzer.stop();
   * ```
   */
  stop(): void {
    this.sendControlMessage({type: 'stop'});
  }

  /**
   * Add an event listener for a specific event type
   *
   * @param event - The event name to listen for
   * @param listener - The callback function to invoke when the event is emitted
   *
   * @example
   * ```typescript
   * analyzer.on('bpm', (data) => {
   *   console.log('Current BPM:', data.bpm[0].tempo);
   * });
   * ```
   */
  on<K extends keyof BpmAnalyzerEventMap>(
    event: K,
    listener: (data: BpmAnalyzerEventMap[K]) => void,
  ): void {
    this.addEventListener(event, ((event_: BpmAnalyzerEvent<BpmAnalyzerEventMap[K]>) => {
      listener(event_.detail);
    }) as EventListener);
  }

  /**
   * Add a one-time event listener that will be removed after being called once
   *
   * @param event - The event name to listen for
   * @param listener - The callback function to invoke when the event is emitted
   *
   * @example
   * ```typescript
   * analyzer.once('bpmStable', (data) => {
   *   console.log('First stable BPM detected:', data.bpm[0].tempo);
   * });
   * ```
   */
  once<K extends keyof BpmAnalyzerEventMap>(
    event: K,
    listener: (data: BpmAnalyzerEventMap[K]) => void,
  ): void {
    const onceWrapper = (event_: BpmAnalyzerEvent<BpmAnalyzerEventMap[K]>) => {
      listener(event_.detail);
      this.removeEventListener(event, onceWrapper as EventListener);
    };

    this.addEventListener(event, onceWrapper as EventListener);
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
  connect(destinationNode: AudioNode, outputIndex?: number, inputIndex?: number): AudioNode;
  connect(destinationParameter: AudioParam, outputIndex?: number): void;
  connect(destination: AudioNode | AudioParam, outputIndex = 0, inputIndex = 0): AudioNode | void {
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
  disconnect(destinationNode?: AudioNode, outputIndex?: number, inputIndex?: number): void;
  disconnect(destinationParameter?: AudioParam, outputIndex?: number): void;
  disconnect(destination?: AudioNode | AudioParam | number, output?: number, input?: number): void {
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

  /**
   * Emit an event to all registered listeners
   */
  private emit<K extends keyof BpmAnalyzerEventMap>(event: K, data: BpmAnalyzerEventMap[K]): void {
    this.dispatchEvent(new BpmAnalyzerEvent(event as string, data));
  }

  /**
   * Set up the message handler to convert MessagePort events to typed events
   */
  private setupMessageHandler(): void {
    // Using onmessage is the standard pattern for MessagePort
    this.node.port.onmessage = (event: MessageEvent<ProcessorOutputEvent>) => {
      const eventData = event.data;

      // Map processor event types to emitter event names
      // eslint-disable-next-line default-case -- all event types are handled
      switch (eventData.type) {
        case 'bpm': {
          this.emit('bpm', eventData.data);
          break;
        }

        case 'bpmStable': {
          this.emit('bpmStable', eventData.data);
          break;
        }

        case 'analyzerReset': {
          this.emit('analyzerReset', undefined as void);
          break;
        }

        case 'analyzeChunk': {
          this.emit('analyzeChunk', eventData.data);
          break;
        }

        case 'validPeak': {
          this.emit('validPeak', eventData.data);
          break;
        }

        case 'error': {
          this.emit('error', eventData.data);
          break;
        }
      }
    };
  }

  /**
   * Send a control message to the processor
   */
  private sendControlMessage(message: ProcessorInputEvent): void {
    this.node.port.postMessage(message);
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
