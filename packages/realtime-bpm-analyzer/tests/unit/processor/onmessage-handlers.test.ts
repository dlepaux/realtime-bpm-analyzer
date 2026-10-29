 
import {expect} from 'chai';

/**
 * Stub the worklet runtime so RealTimeBpmProcessor can be instantiated on the
 * main thread. See concurrency-guard.test.ts for rationale.
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
 * OnMessage contract for RealTimeBpmProcessor.
 * See plan/backlog/lib-bug-processor-onmessage-stub.md
 */
describe('RealTimeBpmProcessor - onMessage handlers', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    const mod = await loadProcessorModule();
    RealTimeBpmProcessor = mod.RealTimeBpmProcessor;
  });

  function makeProcessor() {
    return new RealTimeBpmProcessor({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: {},
    });
  }

  it('should reset analyzer state on {type: "reset"} message', () => {
    const processor = makeProcessor();

    // Populate state so we can detect the reset
    processor.realTimeBpmAnalyzer.skipIndexes = 42;
    processor.realTimeBpmAnalyzer.effectiveBufferTime = 999_999;
    const anyKey = Object.keys(processor.realTimeBpmAnalyzer.validPeaks)[0];
    processor.realTimeBpmAnalyzer.validPeaks[anyKey].push(1234);

    processor.onMessage({data: {type: 'reset'}});

    expect(
      processor.realTimeBpmAnalyzer.skipIndexes,
      'skipIndexes should reset to 1',
    ).to.equal(1);
    expect(
      processor.realTimeBpmAnalyzer.effectiveBufferTime,
      'effectiveBufferTime should reset to 0',
    ).to.equal(0);
    expect(
      processor.realTimeBpmAnalyzer.validPeaks[anyKey],
      'validPeaks at the key should be empty after reset',
    ).to.have.lengthOf(0);
  });

  it('should set stopped flag on {type: "stop"} message and short-circuit process()', () => {
    const processor = makeProcessor();

    let analyzeCalled = false;
    processor.realTimeBpmAnalyzer.analyzeChunk = async () => {
      analyzeCalled = true;
    };

    processor.aggregate = (_pcmData: Float32Array) => ({
      isBufferFull: true,
      buffer: new Float32Array(4096),
      bufferSize: 4096,
    });

    processor.onMessage({data: {type: 'stop'}});

    expect(processor.stopped, 'stopped flag should be true after stop message')
      .to.be.true;

    const chunk: Float32Array[][] = [[new Float32Array(128)]];
    const result = processor.process(chunk, [], {});

    expect(
      result,
      'process() must still return true so the worklet keeps its slot',
    ).to.be.true;
    expect(analyzeCalled, 'analyzeChunk must not fire after stop').to.be.false;
  });

  it('should silently ignore unknown message types (forward compatibility)', () => {
    const processor = makeProcessor();

    expect(() => {
      processor.onMessage({data: {type: 'future-message-type'}});
    }, 'unknown message types must not throw').to.not.throw();

    expect(processor.stopped).to.be.false;
  });

  it('should tolerate a message with missing data', () => {
    const processor = makeProcessor();

    expect(() => {
      processor.onMessage({});
    }, 'malformed messages must not throw').to.not.throw();
  });
});
