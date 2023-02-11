import {realtimeBpmProcessorName} from '../src/consts';
import {chunckAggregator} from '../src/utils';
import {RealTimeBpmAnalyzer} from '../src/realtime-bpm-analyzer';
import type {AsyncConfigurationEvent, AggregateData} from '../src/types';

/**
 * Those declaration are from the package @types/audioworklet. But it is not compatible with the lib 'dom'.
 */
/* eslint-disable no-var, @typescript-eslint/prefer-function-type, @typescript-eslint/no-empty-interface, @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-redeclare, @typescript-eslint/naming-convention */
declare var sampleRate: number;

interface AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare var AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new(): AudioWorkletProcessor;
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

/**
 * @class RealTimeBpmProcessor
 * @extends AudioWorkletProcessor
 **/
export class RealTimeBpmProcessor extends AudioWorkletProcessor {
  aggregate: (pcmData: Float32Array) => AggregateData;
  realTimeBpmAnalyzer: RealTimeBpmAnalyzer = new RealTimeBpmAnalyzer();

  constructor() {
    super();

    this.aggregate = chunckAggregator();

    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();
  }

  /**
   * Handle message event
   * @param {object} event Contain event data from main process
   * @returns {void}
   */
  onMessage(event: AsyncConfigurationEvent): void {
    // Handle custom event ASYNC_CONFIGURATION, to set configuration asynchronously
    if (event.data.message === 'ASYNC_CONFIGURATION') {
      this.realTimeBpmAnalyzer.setAsyncConfiguration(event.data.parameters);
    }
  }

  /**
   * Process function to handle chunks of data
   * @param {Float32Array[][]} inputs Inputs (the data we need to process)
   * @param {Float32Array[][]} _outputs Outputs (not useful for now)
   * @param {Record<string, Float32Array>} _parameters Parameters
   * @returns {boolean} Process ended successfully
   */
  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const currentChunk = inputs[0][0];

    if (!currentChunk) {
      return true;
    }

    const {isBufferFull, buffer, bufferSize} = this.aggregate(currentChunk);

    if (isBufferFull) {
      // The variable sampleRate is global ! thanks to the AudioWorkletProcessor
      this.realTimeBpmAnalyzer.analyzeChunck(buffer, sampleRate, bufferSize, event => {
        this.port.postMessage(event);
      }).catch((error: unknown) => {
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
