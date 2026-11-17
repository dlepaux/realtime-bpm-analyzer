import {expect} from 'chai';
import {loadProcessorModule, processorOptions} from './worklet-stub';

/** process() runs every render quantum: a slow analysis must not have a second one start over its state */
describe('RealTimeBpmProcessor - analysis concurrency guard', () => {
  let RealTimeBpmProcessor: any;

  before(async () => {
    RealTimeBpmProcessor = (await loadProcessorModule(44_100)).RealTimeBpmProcessor;
  });

  it('starts no second analysis while the first is pending, and one once it settles', async () => {
    const processor = new RealTimeBpmProcessor({numberOfInputs: 1, numberOfOutputs: 1, processorOptions: processorOptions()});
    let analyzeCount = 0;
    let finish: () => void = () => undefined;
    const pending = new Promise<void>(resolve => {
      finish = resolve;
    });

    processor.session = {...processor.session, async analyze() {
      analyzeCount++;
      await pending;
      return [];
    }};
    processor.aggregate = (pcmData: Float32Array) => ({isBufferFull: true, buffer: pcmData, bufferSize: 4096});

    const chunk: Float32Array[][] = [[new Float32Array(128)]];
    processor.process(chunk, [], {});
    processor.process(chunk, [], {});
    await Promise.resolve();

    expect(analyzeCount, 'one analysis at a time').to.equal(1);

    finish();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }

    processor.process(chunk, [], {});

    expect(analyzeCount, 'a new analysis may start once the first settled').to.equal(2);
  });
});
