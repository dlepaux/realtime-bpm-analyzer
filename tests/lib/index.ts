import {expect} from 'chai';
import {createRealTimeBpmProcessor, analyzeFullBuffer, getBiquadFilters} from '../../src/index';

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

  it('should create a realTimeBpmProcessor', async function () {
    this.timeout(5000);
    const audioContext = new AudioContext();
    const processor = await createRealTimeBpmProcessor(audioContext);
    expect(processor).to.be.instanceOf(AudioWorkletNode);
    await audioContext.close();
  });

  it('should create the biquad filters', async function () {
    this.timeout(5000);
    const audioContext = new AudioContext();
    const {lowpass, highpass} = getBiquadFilters(audioContext);
    expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    expect(highpass).to.be.instanceOf(BiquadFilterNode);
    await audioContext.close();
  });
});
