import {realtimeBpmProcessorName} from '../src/consts';
import {RealTimeBpmAnalyzer} from '../src/realtime-bpm-analyzer';
import type {AsyncConfigurationEvent} from '../src/types';

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
  /**
   * Determine the buffer size (this is the same as the 1st argument of ScriptProcessor)
   */
  bufferSize = 4096;

  /**
   * Track the current buffer fill level
   */
  _bytesWritten = 0;

  /**
   * Create a buffer of fixed size
   */
  _buffer: Float32Array = new Float32Array(this.bufferSize);

  /**
   * RealTimeBpmAnalzer
   */
  realTimeBpmAnalyzer: RealTimeBpmAnalyzer = new RealTimeBpmAnalyzer();

  constructor() {
    super();

    this.initBuffer();

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
   * Set bytesWritten to 0
   * @returns {void}
   */
  initBuffer(): void {
    this._bytesWritten = 0;
  }

  /**
   * Returns a boolean to know if the buffer if empty
   * @returns {boolean} True if bytesWritten is equal 0
   */
  isBufferEmpty(): boolean {
    return this._bytesWritten === 0;
  }

  /**
   * Returns a boolean to know if the buffer if full
   * @returns {boolean} True if the bytesWritten is equal bufferSize
   */
  isBufferFull(): boolean {
    return this._bytesWritten === this.bufferSize;
  }

  /**
   * Process function to handle chunks of data
   * @param {Float32Array[][]} inputs Inputs (the data we need to process)
   * @param {Float32Array[][]} _outputs Outputs (not useful for now)
   * @param {Record<string, Float32Array>} _parameters Parameters
   * @returns {boolean} Process ended successfully
   */
  process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    this.append(inputs[0][0]);

    if (this.isBufferFull()) {
      // The variable sampleRate is global ! thanks to the AudioWorkletProcessor
      this.realTimeBpmAnalyzer.analyzeChunck(this._buffer, sampleRate, this.bufferSize, event => {
        this.port.postMessage(event);
      }).catch((error: unknown) => {
        console.error(error);
      });
    }

    return true;
  }

  /**
   * Append the new chunk to the buffer (with a bufferSize of 4096)
   * @param {Float32Array} channelData ChannelData
   * @returns {void}
   */
  append(channelData: Float32Array): void {
    if (this.isBufferFull()) {
      this.flush();
    }

    if (!channelData) {
      return;
    }

    const mergedArray = new Float32Array(this._buffer.length + channelData.length);
    mergedArray.set(this._buffer, 0);
    mergedArray.set(channelData, this._buffer.length);
    this._bytesWritten += channelData.length;
  }

  /**
   * Flush memory buffer
   * @returns {void}
   */
  flush(): void {
    this.initBuffer();
  }
}

/**
 * Mandatory Registration to use the processor
 */
registerProcessor(realtimeBpmProcessorName, RealTimeBpmProcessor);

export default {};
