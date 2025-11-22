import {realtimeBpmProcessorName} from '../core/consts';
import {chunkAggregator} from '../core/utils';
import {RealTimeBpmAnalyzer} from '../core/realtime-bpm-analyzer';
import type {ProcessorInputMessage, AggregateData, RealTimeBpmAnalyzerParameters, ProcessorOutputEvent} from '../core/types';

/**
 * Those declaration are from the package @types/audioworklet. But it is not compatible with the lib 'dom'.
 */
/* eslint-disable no-var, @typescript-eslint/prefer-function-type, @typescript-eslint/no-empty-interface, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-redeclare, @typescript-eslint/naming-convention */
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
  new(options?: AudioWorkletProcessorParameters): AudioWorkletProcessor;
};

interface AudioWorkletProcessorImpl extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

interface WorkletGlobalScope {}

declare var WorkletGlobalScope: {
  prototype: WorkletGlobalScope;
  new(): WorkletGlobalScope;
};

interface AudioWorkletGlobalScope extends WorkletGlobalScope {
  readonly currentFrame: number;
  readonly currentTime: number;
  readonly sampleRate: number;
  registerProcessor(name: string, processorCtor: AudioWorkletProcessorConstructor): void;
}

declare var AudioWorkletGlobalScope: {
  prototype: AudioWorkletGlobalScope;
  new(): AudioWorkletGlobalScope;
};

interface AudioWorkletProcessorConstructor {
  new (options: any): AudioWorkletProcessorImpl;
}

declare function registerProcessor(name: string, processorCtor: AudioWorkletProcessorConstructor): void;
/* eslint-enable no-var, @typescript-eslint/prefer-function-type, @typescript-eslint/no-empty-interface, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-redeclare, @typescript-eslint/naming-convention */

export class RealTimeBpmProcessor extends AudioWorkletProcessor {
  aggregate: (pcmData: Float32Array) => AggregateData;
  realTimeBpmAnalyzer: RealTimeBpmAnalyzer;
  stopped = false;

  constructor(options: AudioWorkletProcessorParameters) {
    super(options);

    this.aggregate = chunkAggregator();
    this.realTimeBpmAnalyzer = new RealTimeBpmAnalyzer(options.processorOptions);

    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();
  }

  /**
   * Handle message event
   * @param _event Contain event data from main process
   */
  onMessage(_event: ProcessorInputMessage): void {
    // Handle custom message client
  }

  /**
   * Process function to handle chunks of data
   * @param inputs Inputs (the data we need to process)
   * @param _outputs Outputs (not useful for now)
   * @param _parameters Parameters
   * @returns Process ended successfully
   */
  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const currentChunk = inputs[0][0];

    if (this.stopped) {
      return true;
    }

    if (!currentChunk) {
      return true;
    }

    const {isBufferFull, buffer, bufferSize} = this.aggregate(currentChunk);

    if (isBufferFull) {
      // The variable sampleRate is global ! thanks to the AudioWorkletProcessor
      this.realTimeBpmAnalyzer.analyzeChunk({audioSampleRate: sampleRate, channelData: buffer, bufferSize, postMessage: event => {
        this.port.postMessage(event);
      }}).catch((error: unknown) => {
        // Emit error event to allow user-level error handling
        this.port.postMessage({
          type: 'error',
          data: {
            message: error instanceof Error ? error.message : 'Unknown error during BPM analysis',
            error: error instanceof Error ? error : new Error(String(error)),
          },
        });
      });
    }

    return true;
  }
}

/**
 * Mandatory Registration to use the processor
 */
registerProcessor(realtimeBpmProcessorName, RealTimeBpmProcessor);

export default {};
