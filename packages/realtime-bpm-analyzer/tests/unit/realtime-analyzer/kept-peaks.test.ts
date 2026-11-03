import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';
import {maxKeptPeaks} from '../../../src/core/consts';
import {createClickTrack} from '../../fixtures/click-track';

const bufferSize = 4096;
const audioSampleRate = 44_100;

describe('RealTimeBpmAnalyzer - kept peaks are bounded (RBA-107)', () => {
  it('keeps at most maxKeptPeaks per threshold over a long listen, the newest ones, and still reads the tempo', async function () {
    this.timeout(30_000);
    // 240 BPM clicks give about 4 peaks a second: 2 minutes is near twice the cap
    const samples = createClickTrack(240, audioSampleRate, 120);
    const analyzer = new RealTimeBpmAnalyzer();
    let lastPeak = -1;
    let most = 0;
    let tempo: number | undefined;

    for (let start = 0; start + bufferSize <= samples.length; start += bufferSize) {
      await analyzer.analyzeChunk({
        audioSampleRate,
        channelData: samples.subarray(start, start + bufferSize),
        bufferSize,
        postMessage(event) {
          if (event.type === 'bpm') {
            tempo = event.data.bpm[0]?.tempo;
          }
        },
      });

      for (const peaks of Object.values(analyzer.validPeaks)) {
        most = Math.max(most, peaks.length);
        lastPeak = Math.max(lastPeak, peaks.at(-1) ?? -1);
      }
    }

    const fullest = Object.values(analyzer.validPeaks).reduce((a, b) => (b.length > a.length ? b : a));

    expect(most).to.equal(maxKeptPeaks);
    // The newest peak is still there: the cap drops from the front
    expect(fullest.at(-1)).to.equal(lastPeak);
    expect(lastPeak).to.be.greaterThan(samples.length - (audioSampleRate / 2));
    expect(tempo).to.equal(120);
  });
});
