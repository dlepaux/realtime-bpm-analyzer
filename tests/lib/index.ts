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
  it('should create a realTimeBpmProcessor', async function () {
    this.timeout(30 * 1000);
    const audioContext = new AudioContext();
    console.log('audioContext', audioContext);
    const processor = await createRealTimeBpmProcessor(audioContext);
    expect(processor).to.be.instanceOf(AudioWorkletNode);
    await audioContext.close();
  });

  it('should create the biquad filters', async function () {
    this.timeout(30 * 1000);
    const audioContext = new AudioContext();
    const {lowpass, highpass} = getBiquadFilters(audioContext);
    expect(lowpass).to.be.instanceOf(BiquadFilterNode);
    expect(highpass).to.be.instanceOf(BiquadFilterNode);
    await audioContext.close();
  });
});
