import {realtimeBpmProcessorName} from '../core/consts';
import {chunkAggregator} from '../core/utils';
import {createSampleClock} from '../core/sample-clock';
import type {SampleClock} from '../core/sample-clock';
import {createSession} from '../core/session';
import type {ProcessorOptions, Session} from '../core/session';
import type {AggregateData} from '../core/types';
import {compatibleProtocol, describeProtocol, mayAddTypes, ownProtocol} from '../contract/protocol';
import {PROTOCOL} from '../contract/types';
import type {AnalyzerErrorName, PostedWorkletMessage, ProtocolVersion, WorkletMessage} from '../contract/types';

/**
 * Those declaration are from the package @types/audioworklet. But it is not compatible with the lib 'dom'.
 */
/* eslint-disable no-var */
declare var sampleRate: number;
// The context time of the render quantum, given by the AudioWorkletGlobalScope
declare var currentTime: number;

interface AudioWorkletProcessor {
  readonly port: AuthorizedMessagePort;
}

// Define a type for a message port that only accepts specific message types
interface AuthorizedMessagePort extends MessagePort {
  postMessage(message: PostedWorkletMessage): void;
}

type AudioWorkletProcessorParameters = {
  numberOfInputs: number;
  numberOfOutputs: number;
  processorOptions: ProcessorOptions;
};

declare var AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new (options?: AudioWorkletProcessorParameters): AudioWorkletProcessor;
};

interface AudioWorkletProcessorImpl extends AudioWorkletProcessor {
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

interface WorkletGlobalScope {}

declare var WorkletGlobalScope: {
  prototype: WorkletGlobalScope;
  new (): WorkletGlobalScope;
};

interface AudioWorkletGlobalScope extends WorkletGlobalScope {
  readonly currentFrame: number;
  readonly currentTime: number;
  readonly sampleRate: number;
  registerProcessor(
    name: string,
    processorCtor: AudioWorkletProcessorConstructor,
  ): void;
}

declare var AudioWorkletGlobalScope: {
  prototype: AudioWorkletGlobalScope;
  new (): AudioWorkletGlobalScope;
};

interface AudioWorkletProcessorConstructor {
  new (options: any): AudioWorkletProcessorImpl;
}

declare function registerProcessor(
  name: string,
  processorCtor: AudioWorkletProcessorConstructor,
): void;
/* eslint-enable no-var */

/** Frames of a render quantum, fixed by the Web Audio specification */
const renderQuantumFrames = 128;

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

export class RealTimeBpmProcessor extends AudioWorkletProcessor {
  aggregate: (pcmData: Float32Array) => AggregateData;
  session: Session | null = null;
  stopped = false;
  // Guards against re-entrant analysis calls. process() is invoked every render quantum; without this flag, a
  // slow analysis could have several concurrent invocations mutating the session's shared state.
  analysisInProgress = false;
  // Made by the first report of a live input's clock: a source the audio thread pulls waits for it and loses nothing.
  sampleClock: SampleClock | null = null;
  // Only an analyzer made with `liveInput` reports a clock: from any other, `delivered` is ignored
  liveInput = false;
  // The main thread's protocol. A later minor that adds a union value maps it here to one this minor knows, so an
  // older main thread never receives a value it rejects as malformed (ProtocolVersion). Nothing to map at minor 0.
  hostProtocol: ProtocolVersion | null = null;
  silentQuantum = new Float32Array(renderQuantumFrames);

  constructor(options: AudioWorkletProcessorParameters) {
    super(options);

    this.aggregate = chunkAggregator();
    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();

    const processorOptions = options.processorOptions;
    // The major only: an analyzer one minor apart still talks, and the unknown-type rule covers what it adds
    const hostProtocol = compatibleProtocol(processorOptions?.protocol);
    if (hostProtocol === null) {
      this.fail('ProtocolError', `the analyzer speaks protocol ${describeProtocol(processorOptions?.protocol)}, this processor ${ownProtocol}: a stale processor file?`);
      return;
    }

    this.hostProtocol = hostProtocol;
    this.liveInput = processorOptions.liveInput === true;
    this.session = createSession(processorOptions, () => this.sampleClock);
    this.post({type: 'ready', protocol: PROTOCOL, epoch: 0});
  }

  /** Every message leaves stamped with when it was sent, for the main thread's epoch watchdog */
  post(message: WorkletMessage): void {
    this.port.postMessage({...message, at: currentTime});
  }

  /**
   * Ends the processor with a fatal fault: the main thread stops, whatever epoch it is in
   * @param name The error's name
   * @param message What went wrong
   */
  fail(name: AnalyzerErrorName, message: string): void {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.post({type: 'fault', protocol: PROTOCOL, epoch: this.session?.epoch() ?? 0, fatal: true, error: {name, message}});
  }

  /**
   * Handle message event
   * @param event Contain event data from main process
   */
  onMessage(event: MessageEvent<unknown>): void {
    const data: unknown = event?.data;
    if (typeof data !== 'object' || data === null || !('type' in data) || this.stopped || this.session === null) {
      return;
    }

    try {
      this.handle(data as {type: unknown; protocol?: unknown; epoch?: unknown; seconds?: unknown});
    } catch (error) {
      this.fail('ProcessorError', errorMessage(error));
    }
  }

  handle(data: {type: unknown; protocol?: unknown; epoch?: unknown; seconds?: unknown}): void {
    const protocol = compatibleProtocol(data.protocol);
    if (protocol === null) {
      this.fail('ProtocolError', `host message of protocol ${describeProtocol(data.protocol)}, this processor speaks ${ownProtocol}`);
      return;
    }

    // The main thread's rule, mirrored: only a later minor may have added a type, which an older processor copy
    // skips. From the same or an older minor an unknown type is a bug or a typo (ProtocolVersion)
    const known = data.type === 'reset' || data.type === 'stop' || data.type === 'delivered';
    if (!known) {
      if (!mayAddTypes(protocol)) {
        this.fail('ProtocolError', `unknown host message type ${JSON.stringify(data.type)} from protocol ${describeProtocol(protocol)}`);
      }

      return;
    }

    if (data.type === 'stop') {
      this.stopped = true;
      return;
    }

    if (data.type === 'reset') {
      const {epoch} = data;
      if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch <= this.session!.epoch()) {
        this.fail('ProtocolError', `reset to epoch ${String(epoch)}, which is not after ${this.session!.epoch()}`);
        return;
      }

      this.session!.adopt(epoch).forEach(message => {
        this.post(message);
      });
      return;
    }

    if (!this.liveInput) {
      return;
    }

    // The main thread sends only finite counts (followTrackClock), so anything else is a malformed known message
    const {seconds} = data;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
      this.fail('ProtocolError', `delivered ${String(seconds)} seconds, which is not a finite number`);
      return;
    }

    this.sampleClock ??= createSampleClock(sampleRate);
    this.sampleClock.observe(seconds);
  }

  /**
   * Process function to handle chunks of data
   * @param inputs Inputs (the data we need to process)
   * @param _outputs Outputs (not useful for now)
   * @param _parameters Parameters
   * @returns False once stopped, so the browser may drop the processor
   */
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    if (this.stopped || this.session === null) {
      return false;
    }

    try {
      this.render(inputs[0]?.[0]);
    } catch (error) {
      this.fail('ProcessorError', errorMessage(error));
    }

    return !this.stopped;
  }

  render(currentChunk: Float32Array | undefined): void {
    // Ahead of the check below: time goes by for an input that is disconnected too, and nothing of it is lost.
    const owesSilence = this.sampleClock?.advance(renderQuantumFrames) ?? false;

    if (this.sampleClock?.takeStartOver()) {
      this.session!.restartForLostAudio().forEach(message => {
        this.post(message);
      });
    }

    if (!currentChunk) {
      return;
    }

    // One quantum at most: at most one full buffer per call, which the guard in `analyze` would otherwise drop.
    if (owesSilence) {
      this.analyze(this.silentQuantum, true);
    }

    this.analyze(currentChunk);
  }

  /**
   * Aggregates a quantum, and analyzes the buffer when it is full
   * @param currentChunk The quantum
   * @param anotherFollows Whether another quantum is aggregated at once, over the buffer an analysis may still be reading
   */
  analyze(currentChunk: Float32Array, anotherFollows = false): void {
    const {isBufferFull, buffer, bufferSize} = this.aggregate(currentChunk);

    if (!isBufferFull || this.analysisInProgress || this.session === null) {
      return;
    }

    this.analysisInProgress = true;
    const session = this.session;
    // A failed step belongs to the epoch it was measured in: a reset() during it makes the fault stale, not current
    const measuredIn = session.epoch();
    // Read now, before the analysis awaits. currentTime is the start of this render quantum: a real chunk ends one
    // quantum later, while owed silence stands for input lost before this quantum, so it ends where the quantum begins
    const contextTime = currentTime + (anotherFollows ? 0 : renderQuantumFrames / sampleRate);
    // The variable sampleRate is global, given by the AudioWorkletGlobalScope
    session
      .analyze(anotherFollows ? buffer.slice() : buffer, bufferSize, sampleRate, contextTime)
      .then(messages => {
        if (!this.stopped) {
          messages.forEach(message => {
            this.post(message);
          });
        }
      }, (error: unknown) => {
        // One step failed: say so, and let the next one run
        this.post({type: 'fault', protocol: PROTOCOL, epoch: measuredIn, fatal: false, error: {name: 'AnalysisError', message: errorMessage(error)}});
      })
      .finally(() => {
        this.analysisInProgress = false;
      });
  }
}

/**
 * Mandatory Registration to use the processor
 */
registerProcessor(realtimeBpmProcessorName, RealTimeBpmProcessor);

export default {};
