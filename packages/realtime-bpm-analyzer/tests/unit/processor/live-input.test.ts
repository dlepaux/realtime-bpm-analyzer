import {expect} from 'chai';

async function loadProcessorModule(): Promise<any> {
  (globalThis as any).sampleRate = 48_000;
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

const quantum = 128;
const sampleRate = 48_000;

describe('RealTimeBpmProcessor - a live input\'s clock', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    const mod = await loadProcessorModule();
    RealTimeBpmProcessor = mod.RealTimeBpmProcessor;
  });

  /** Renders `seconds` at `threadShare` of the input's pace, reporting it or not, and tells what reached the analyzer */
  function render(threadShare: number, seconds: number, {reported = true, connected = true} = {}) {
    const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: {}});
    const heard = {input: 0, silence: 0};
    const input = new Float32Array(quantum).fill(0.5);
    processor.aggregate = (pcmData: Float32Array) => {
      heard[pcmData[0] === 0 ? 'silence' : 'input'] += pcmData.length;
      return {isBufferFull: false, buffer: pcmData, bufferSize: 4096};
    };

    const quanta = Math.round((seconds * threadShare * sampleRate) / quantum);
    const reportEvery = Math.round((0.25 * threadShare * sampleRate) / quantum);
    for (let i = 0; i < quanta; i++) {
      if (reported && i % reportEvery === 0) {
        processor.onMessage({data: {type: 'delivered', seconds: (i * quantum) / sampleRate / threadShare}});
      }

      expect(processor.process(connected ? [[input]] : [[]], [[]], {})).to.equal(true);
    }

    return heard;
  }

  it('should add no silence with no report, whatever the thread does', () => {
    expect(render(0.9, 10, {reported: false}).silence).to.equal(0);
  });

  it('should add no silence when the thread keeps up', () => {
    expect(render(1, 10).silence).to.equal(0);
  });

  it('should pay the audio the thread lost as silence, on top of all of the input', () => {
    const heard = render(0.9, 10);
    const lost = 10 * sampleRate * 0.1;
    expect(heard.input).to.be.closeTo(9 * sampleRate, quantum);
    // The last windows are still to be paid
    expect(heard.silence).to.be.within(lost * 0.65, lost);
  });

  it('should pay nothing while no input is connected, and not fail', () => {
    const heard = render(0.9, 10, {connected: false});
    expect(heard.input + heard.silence).to.equal(0);
  });
});
