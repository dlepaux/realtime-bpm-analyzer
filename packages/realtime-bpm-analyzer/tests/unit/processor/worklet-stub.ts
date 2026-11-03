import {resolveEngine} from '../../../src/core/engine';
import type {ProcessorOptions} from '../../../src/core/session';
import {PROTOCOL_VERSION} from '../../../src/contract/types';
import type {EngineOption, PostedWorkletMessage} from '../../../src/contract/types';

/**
 * The processor extends the worklet-only `AudioWorkletProcessor` and calls `registerProcessor` on load, neither of
 * which exists on the main thread. Stubbed before the module is imported, the class can be built and driven
 * directly. Each test file runs in its own page, so the stub and `sampleRate` are per file.
 * @param sampleRate The worklet's global sample rate
 * @returns The processor module
 */
export async function loadProcessorModule(sampleRate: number): Promise<any> {
  (globalThis as any).sampleRate = sampleRate;
  // The worklet's clock, which stamps every message: tests move it by hand
  (globalThis as any).currentTime = 0;
  (globalThis as any).AudioWorkletProcessor = class {
    posted: PostedWorkletMessage[] = [];
    port = {
      postMessage: (message: PostedWorkletMessage) => {
        this.posted.push(message);
      },
      addEventListener() {
        // The tests call onMessage themselves
      },
      start() {
        // Nothing to start
      },
    };
  };

  (globalThis as any).registerProcessor = () => {
    // Nothing to register with
  };

  return import('../../../src/processor/realtime-bpm-processor');
}

/** What the factory hands the processor for `engine`, as it would validate it; `liveInput` as for a track */
export function processorOptions(engine?: EngineOption, debug = false, liveInput = false): ProcessorOptions {
  const resolved = resolveEngine(engine, undefined);
  return {engine: resolved.engine, tempoRange: resolved.tempoRange, debug, liveInput, protocol: PROTOCOL_VERSION};
}

/** A host message as the main thread posts it */
export const host = (data: Record<string, unknown>) => ({data: {protocol: PROTOCOL_VERSION, ...data}});
