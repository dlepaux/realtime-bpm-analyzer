import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';
import {computeProgress} from '../../../src/core/tempo';
import {requiredPeaks} from '../../../src/core/consts';
import {createClickTrack} from '../../fixtures/click-track';
import {createEventCollector} from '../../setup';
import type {RealTimeBpmAnalyzerParameters} from '../../../src/core/types';

const bufferSize = 4096;
const audioSampleRate = 44_100;

/**
 * Feed samples to a fresh analyzer chunk by chunk and collect every posted event
 */
async function analyze(samples: Float32Array, options: RealTimeBpmAnalyzerParameters = {}) {
  const analyzer = new RealTimeBpmAnalyzer(options);
  const collector = createEventCollector();

  for (let start = 0; start + bufferSize <= samples.length; start += bufferSize) {
    await analyzer.analyzeChunk({
      audioSampleRate,
      channelData: samples.subarray(start, start + bufferSize),
      bufferSize,
      postMessage: collector.postMessage,
    });
  }

  return collector;
}

describe('RealTimeBpmAnalyzer - progress toward the first BPM', () => {
  it('requires one peak more than computeBpm\'s minimum', () => {
    expect(computeProgress({})).to.deep.equal({peaks: 0, requiredPeaks});
    expect(computeProgress({0.9: [1, 2], 0.5: [1, 2, 3]})).to.deep.equal({peaks: 3, requiredPeaks});
    expect(computeProgress({0.9: Array.from({length: 40}, (_, i) => i)}).peaks).to.equal(requiredPeaks);
  });

  it('rises on a click track and is full in the chunk that yields the first BPM', async () => {
    const collector = await analyze(createClickTrack(120, audioSampleRate, 15));
    const ordered = collector.events.filter(e => e.type === 'progress' || e.type === 'bpm');
    const progress = collector.getEventsByType('progress').map(e => e.data.peaks);

    // One progress per analysed chunk, not one per peak
    expect(progress).to.have.length(collector.getEventsByType('bpm').length);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).to.be.at.least(progress[i - 1]);
    }

    const firstBpmIndex = ordered.findIndex(e => e.type === 'bpm' && e.data.bpm.length > 0);
    expect(firstBpmIndex).to.be.greaterThan(0);
    const before = ordered[firstBpmIndex - 1];
    expect(before.type).to.equal('progress');
    expect(before.type === 'progress' && before.data).to.deep.equal({peaks: requiredPeaks, requiredPeaks});

    const earlier = ordered.slice(0, firstBpmIndex - 1).filter(e => e.type === 'progress');
    expect(earlier.length).to.be.greaterThan(0);
    for (const event of earlier) {
      expect(event.type === 'progress' && event.data.peaks).to.be.below(requiredPeaks);
    }
  });

  it('stays at 0 on silence', async () => {
    const collector = await analyze(new Float32Array(audioSampleRate * 5));
    const progress = collector.getEventsByType('progress');

    expect(progress.length).to.be.greaterThan(0);
    for (const event of progress) {
      expect(event.data).to.deep.equal({peaks: 0, requiredPeaks});
    }
  });

  it('drops to 0 right after analyzerReset', async () => {
    const collector = await analyze(createClickTrack(120, audioSampleRate, 15), {
      continuousAnalysis: true,
      stabilizationTime: 10_000,
    });
    const resetIndex = collector.events.findIndex(e => e.type === 'analyzerReset');

    expect(resetIndex).to.be.greaterThan(0);
    const next = collector.events[resetIndex + 1];
    expect(next.type === 'progress' && next.data).to.deep.equal({peaks: 0, requiredPeaks});
  });
});
