import {realtimeBpmProcessorName} from './consts';
import {RealTimeBpmAnalyzer} from './realtime-bpm-analyzer';

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

    /**
     * Initializing
     */
    this.initBuffer();

    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();
  }

  /**
   * On 'message' event handler
   * @param {object} event Contain event data
   */
  onMessage(event) {
    if (event.data.message === 'ASYNC_CONFIGURATION') {
      for (const key of Object.keys(event.data.parameters)) {
        this.realTimeBpmAnalyzer.setAsyncConfiguration(key, event.data.parameters[key]);
      }
    }
  }

  /**
   * Set bytesWritten to 0
   */
  initBuffer() {
    this._bytesWritten = 0;
  }

  /**
   * Returns a boolean to know if the buffer if empty
   * @returns {boolean} true if bytesWritten is equal 0
   */
  isBufferEmpty() {
    return this._bytesWritten === 0;
  }

  /**
   * Returns a boolean to know if the buffer if full
   * @returns {boolean} true if the bytesWritten is equal bufferSize
   */
  isBufferFull() {
    return this._bytesWritten === this.bufferSize;
  }

  /**
   *
   * @param inputs
   * @param _outputs
   * @param _parameters
   * @returns
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
   * @param {Float32Array} channelData
   */
  append(channelData: Float32Array) {
    if (this.isBufferFull()) {
      this.flush();
    }

    if (!channelData) {
      return;
    }

    for (const data of channelData) {
      this._buffer[this._bytesWritten++] = data;
    }
  }

  /**
   * Flush memory buffer
   */
  flush() {
    this.initBuffer();
  }
}

/**
 * Mandatory Registration to use the processor
 */
registerProcessor(realtimeBpmProcessorName, RealTimeBpmProcessor);
