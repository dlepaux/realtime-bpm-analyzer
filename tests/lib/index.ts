import {expect} from 'chai';
import {createRealTimeBpmProcessor, analyzeFullBuffer, getBiquadFilter} from '../../src/index';

/**
 * Unit test for the RealTime BPM Analyzer
 */
describe('Index - Unit tests', () => {
  it('should confirm presence of analyzeFullBuffer method', () => {
    expect(typeof analyzeFullBuffer === 'function').to.be.equal(true);
  });
});

describe('Index - Intergration tests', () => {
  it('should create a valid AudioContext instance', async () => {
    const audioContext = new AudioContext();
    expect(audioContext).to.be.instanceOf(AudioContext);
    await audioContext.close();
  });

  it('should create a realTimeBpmProcessor (extending EventTarget class)', async () => {
    const audioContext = new AudioContext();
    const processor = await createRealTimeBpmProcessor(audioContext);
    expect(processor).to.be.instanceOf(EventTarget);
    await audioContext.close();
  });

  it('should create the biquad filters without options', async function () {
    this.timeout(5000);
    const audioContext = new AudioContext();
    const lowpass = getBiquadFilter(audioContext);
    expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    await audioContext.close();
  });

  it('should create the biquad filters without options', async function () {
    this.timeout(5000);
    const audioContext = new AudioContext();
    const lowpass = getBiquadFilter(audioContext, {
      frequencyValue: 200,
      qualityValue: 1,
    });
    expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    await audioContext.close();
  });
});
