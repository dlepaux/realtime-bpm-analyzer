 
import {expect} from 'chai';

/**
 * The RealTimeBpmProcessor class extends the AudioWorklet-only `AudioWorkletProcessor`
 * base class and calls the global `registerProcessor` on module load. Neither exists
 * on the main thread where tests run. Stub the worklet runtime BEFORE the processor
 * module is imported so the class can be instantiated and exercised directly.
 */
async function loadProcessorModule(): Promise<any> {
  (globalThis as any).sampleRate = 44_100;
  (globalThis as any).AudioWorkletProcessor = class {
    port = {
      postMessage() {
        // No-op stub
      },
      addEventListener() {
        // No-op stub
      },
      start() {
        // No-op stub
      },
    };
  };

  (globalThis as any).registerProcessor = () => {
    // No-op stub
  };

  return import('../../../src/processor/realtime-bpm-processor');
}

/**
 * Concurrency guard contract for RealTimeBpmProcessor.process().
 * See plan/backlog/lib-bug-analyze-chunk-concurrency.md
 */
describe('RealTimeBpmProcessor - analyzeChunk concurrency guard', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    const mod = await loadProcessorModule();
    RealTimeBpmProcessor = mod.RealTimeBpmProcessor;
  });

  it('should not start a second analyzeChunk while the first is still pending', async () => {
    const processor = new RealTimeBpmProcessor({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: {},
    });

    let analyzeCount = 0;
    let resolveAnalyze: () => void = () => {
      /* Set below */
    };

    const analyzePromise = new Promise<void>(resolve => {
      resolveAnalyze = resolve;
    });

    processor.realTimeBpmAnalyzer.analyzeChunk = async () => {
      analyzeCount++;
      await analyzePromise;
    };

    // Make the aggregator always report "buffer full" so process() always attempts analyzeChunk
    processor.aggregate = (pcmData: Float32Array) => ({
      isBufferFull: true,
      buffer: pcmData,
      bufferSize: 4096,
    });

    const chunk: Float32Array[][] = [[new Float32Array(128)]];

    processor.process(chunk, [], {});
    await Promise.resolve();
    await Promise.resolve();

    processor.process(chunk, [], {});
    await Promise.resolve();
    await Promise.resolve();

    // Guard must have blocked the second call
    expect(
      analyzeCount,
      'analyzeChunk must only run once while one is in flight',
    ).to.equal(1);

    // Allow the first to complete, then verify a subsequent process() CAN fire a new analysis
    resolveAnalyze();
    // Drain the .finally() handler (multiple microtask hops because of the chain)
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }

    processor.process(chunk, [], {});
    await Promise.resolve();

    expect(
      analyzeCount,
      'a new analyzeChunk must be able to start after the prior one settles',
    ).to.equal(2);
  });
});
