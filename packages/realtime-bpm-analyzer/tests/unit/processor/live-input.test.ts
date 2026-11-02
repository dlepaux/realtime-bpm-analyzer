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

describe('RealTimeBpmProcessor - liveInput', () => {
  let RealTimeBpmProcessor: any;
  const realNow = Date.now;

  before(async () => {
    const mod = await loadProcessorModule();
    RealTimeBpmProcessor = mod.RealTimeBpmProcessor;
  });

  afterEach(() => {
    Date.now = realNow;
  });

  /** Renders `seconds` of audio at `share` of real time, with input or not, and tells what reached the analyzer */
  function render(processorOptions: Record<string, unknown>, share: number, seconds: number, connected = true) {
    const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions});
    const heard = {input: 0, silence: 0};
    const input = new Float32Array(quantum).fill(0.5);
    processor.aggregate = (pcmData: Float32Array) => {
      heard[pcmData[0] === 0 ? 'silence' : 'input'] += pcmData.length;
      return {isBufferFull: false, buffer: pcmData, bufferSize: 4096};
    };

    let now = 1_000_000;
    Date.now = () => now;
    const quanta = Math.round((seconds * sampleRate) / quantum);
    for (let i = 0; i < quanta; i++) {
      now += ((quantum / sampleRate) * 1000) / share;
      expect(processor.process(connected ? [[input]] : [[]], [[]], {})).to.equal(true);
    }

    return heard;
  }

  it('should add no silence by default, whatever the thread does', () => {
    const heard = render({}, 0.9, 10);
    expect(heard.silence).to.equal(0);
  });

  it('should add no silence when the thread keeps up', () => {
    const heard = render({liveInput: true}, 1, 10);
    expect(heard.silence).to.equal(0);
  });

  it('should pay the audio the thread lost as silence, on top of all of the input', () => {
    const heard = render({liveInput: true}, 0.9, 10);
    const lost = 10 * sampleRate * ((1 / 0.9) - 1);
    expect(heard.input).to.be.closeTo(10 * sampleRate, quantum);
    // The last window is still to be paid
    expect(heard.silence).to.be.within(lost * 0.75, lost);
  });

  it('should pay nothing while no input is connected, and not fail', () => {
    const heard = render({liveInput: true}, 0.9, 10, false);
    expect(heard.input + heard.silence).to.equal(0);
  });
});
