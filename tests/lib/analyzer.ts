import {expect} from 'chai';
import {analyzeFullBuffer} from '../../src/core/analyzer';
import {data as assertIntervals} from '../fixtures/bass-test-intervals';
import * as analyzer from '../../src/core/analyzer';
import * as utils from '../../src/core/utils';
import {createTestAudioContext, closeAudioContext, loadTestAudio} from '../setup';

const assertPeaksBassSample = [12962, 23459, 35776, 46244, 58593, 69041, 82686, 105130, 115632, 127947, 138418, 150759, 161199, 174832, 197297, 207805, 220128, 230605, 242947, 253382, 266950, 289455, 299456, 312334, 322814, 335783, 358605];

describe('Analyzer - Unit tests', () => {
  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  it('should not find peaks from empty channel data', async () => {
    const channelData = new Float32Array([0, 0, 0, 0]);
    const {peaks, threshold} = await analyzer.findPeaks({audioSampleRate: audioContext.sampleRate, channelData});
    expect(threshold).to.be.equal(0);
    expect(peaks.length).to.be.equal(0);
  });

  it('should identify intervals from given peaks', async () => {
    const intervals = analyzer.identifyIntervals(assertPeaksBassSample);
    expect(JSON.stringify(intervals)).to.be.equal(JSON.stringify(assertIntervals));
  });

  it('should trigger an error while getting candidate from empty array', async () => {
    expect(() => {
      analyzer.getTopCandidate([]);
    }).to.throw('Could not find enough samples for a reliable detection.');
  });

  it('should not compute BPM from empty array of peaks', async () => {
    const validPeaks = utils.generateValidPeaksModel();
    const {threshold, bpm} = await analyzer.computeBpm({audioSampleRate: audioContext.sampleRate, data: validPeaks});
    expect(threshold).to.be.equal(0.2);
    expect(bpm.length).to.be.equal(0);
  });
});

describe('Analyzer - Integration tests', () => {
  let audioContext: AudioContext;

  beforeEach(() => {
    audioContext = createTestAudioContext();
  });

  afterEach(async () => {
    await closeAudioContext(audioContext);
  });

  it('should be able to detect the BPM from an AudioBuffer', async function () {
    this.timeout(30 * 1000);
    const audioBuffer = await loadTestAudio(audioContext);
    const tempos = await analyzeFullBuffer(audioBuffer);
    const tempo = analyzer.getTopCandidate(tempos);
    expect(tempo).to.be.equal(125);
  });
});
