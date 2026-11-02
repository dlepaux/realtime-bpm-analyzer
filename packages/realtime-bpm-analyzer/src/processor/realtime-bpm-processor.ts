import {realtimeBpmProcessorName} from '../core/consts';
import {chunkAggregator} from '../core/utils';
import {RealTimeBpmAnalyzer} from '../core/realtime-bpm-analyzer';
import {createSampleClock} from '../core/sample-clock';
import type {SampleClock} from '../core/sample-clock';
import type {
  ProcessorInputMessage,
  AggregateData,
  RealTimeBpmAnalyzerParameters,
  ProcessorOutputEvent,
} from '../core/types';

/**
 * Those declaration are from the package @types/audioworklet. But it is not compatible with the lib 'dom'.
 */
/* eslint-disable no-var */
declare var sampleRate: number;

interface AudioWorkletProcessor {
  readonly port: AuthorizedMessagePort;
}

// Define a type for a message port that only accepts specific message types
interface AuthorizedMessagePort extends MessagePort {
  postMessage(message: ProcessorOutputEvent): void;
}

type AudioWorkletProcessorParameters = {
  numberOfInputs: number;
  numberOfOutputs: number;
  processorOptions: RealTimeBpmAnalyzerParameters;
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

export class RealTimeBpmProcessor extends AudioWorkletProcessor {
  aggregate: (pcmData: Float32Array) => AggregateData;
  realTimeBpmAnalyzer: RealTimeBpmAnalyzer;
  stopped = false;
  // Guards against re-entrant analyzeChunk calls. process() is invoked every
  // render quantum; without this flag, a slow analysis could have multiple
  // concurrent invocations mutating the analyzer's shared state.
  analysisInProgress = false;
  // Only for a live input, which the options declare: a source the audio thread pulls waits for it and loses nothing.
  sampleClock: SampleClock | null;
  silentQuantum = new Float32Array(renderQuantumFrames);

  constructor(options: AudioWorkletProcessorParameters) {
    super(options);

    this.aggregate = chunkAggregator();
    this.realTimeBpmAnalyzer = new RealTimeBpmAnalyzer(
      options.processorOptions,
    );
    this.sampleClock = options.processorOptions?.liveInput ? createSampleClock(sampleRate) : null;

    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();
  }

  /**
   * Handle message event
   * @param event Contain event data from main process
   */
  onMessage(event: ProcessorInputMessage): void {
    if (!event?.data) {
      return;
    }

    switch (event.data.type) {
      case 'reset': {
        this.realTimeBpmAnalyzer.reset();
        break;
      }

      case 'stop': {
        this.stopped = true;
        break;
      }

      default:
      // Silently ignore unknown message types so newer main-thread code
      // sending future message shapes does not crash older workers.
    }
  }

  /**
   * Process function to handle chunks of data
   * @param inputs Inputs (the data we need to process)
   * @param _outputs Outputs (not useful for now)
   * @param _parameters Parameters
   * @returns Process ended successfully
   */
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const currentChunk = inputs[0][0];

    if (this.stopped) {
      return true;
    }

    // Ahead of the check below: time goes by for an input that is disconnected too, and nothing of it is lost.
    const owesSilence = this.sampleClock?.(Date.now(), renderQuantumFrames) ?? false;

    if (!currentChunk) {
      return true;
    }

    // One quantum at most: at most one full buffer per call, which the guard in `analyze` would otherwise drop.
    if (owesSilence) {
      this.analyze(this.silentQuantum);
    }

    this.analyze(currentChunk);

    return true;
  }

  /**
   * Aggregates a quantum, and analyzes the buffer when it is full
   * @param currentChunk The quantum
   */
  analyze(currentChunk: Float32Array): void {
    const {isBufferFull, buffer, bufferSize} = this.aggregate(currentChunk);

    if (isBufferFull && !this.analysisInProgress) {
      this.analysisInProgress = true;
      // The variable sampleRate is global ! thanks to the AudioWorkletProcessor
      this.realTimeBpmAnalyzer
        .analyzeChunk({
          audioSampleRate: sampleRate,
          channelData: buffer,
          bufferSize,
          postMessage: event => {
            this.port.postMessage(event);
          },
        })
        .catch((error: unknown) => {
          // Emit error event to allow user-level error handling
          this.port.postMessage({
            type: 'error',
            data: {
              message:
                error instanceof Error
                  ? error.message
                  : 'Unknown error during BPM analysis',
              error: error instanceof Error ? error : new Error(String(error)),
            },
          });
        })
        .finally(() => {
          this.analysisInProgress = false;
        });
    }
  }
}

/**
 * Mandatory Registration to use the processor
 */
registerProcessor(realtimeBpmProcessorName, RealTimeBpmProcessor);

export default {};
