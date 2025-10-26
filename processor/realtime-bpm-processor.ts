import {realtimeBpmProcessorName} from '../src/core/consts';
import {chunckAggregator} from '../src/core/utils';
import {RealTimeBpmAnalyzer} from '../src/core/realtime-bpm-analyzer';
import type {ProcessorInputMessage, AggregateData, RealTimeBpmAnalyzerParameters, ProcessorOutputEvent} from '../src/core/types';

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

    this.aggregate = chunckAggregator();
    this.realTimeBpmAnalyzer = new RealTimeBpmAnalyzer(options.processorOptions);

    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();
  }

  /**
   * Handle message event
   * @param event Contain event data from main process
   */
  onMessage(event: ProcessorInputMessage): void {
    // Handle custom event RESET
    if (event.data.type === 'reset') {
      console.log('[processor.onMessage] RESET');
      this.aggregate = chunckAggregator();
      this.stopped = false;
      this.realTimeBpmAnalyzer.reset();
    }

    if (event.data.type === 'stop') {
      console.log('[processor.onMessage] STOP');
      this.aggregate = chunckAggregator();
      this.stopped = true;
      this.realTimeBpmAnalyzer.reset();
    }
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
      this.realTimeBpmAnalyzer.analyzeChunck({audioSampleRate: sampleRate, channelData: buffer, bufferSize, postMessage: event => {
        this.port.postMessage(event);
      }}).catch((error: unknown) => {
        console.error(error);
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
