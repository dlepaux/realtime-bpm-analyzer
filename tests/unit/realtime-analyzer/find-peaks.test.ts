import {expect} from 'chai';
import {RealTimeBpmAnalyzer} from '../../../src/core/realtime-bpm-analyzer';

/**
 * Resolve the exact key string that represents a given threshold
 * (validPeaks/nextIndexPeaks keys are stringified floats with precision artefacts).
 */
function getThresholdKey(
  analyzer: RealTimeBpmAnalyzer,
  threshold: number,
): string {
  const target = threshold.toFixed(2);
  const key = Object.keys(analyzer.validPeaks).find(
    k => Number.parseFloat(k).toFixed(2) === target,
  );
  if (!key) {
    throw new Error(`No threshold key found for ${threshold}`);
  }

  return key;
}

/**
 * Unit tests codifying the resume-offset contract for RealTimeBpmAnalyzer.findPeaks.
 * See plan/backlog/lib-bug-next-index-peaks-modulo.md
 */
describe('RealTimeBpmAnalyzer - findPeaks resume offset', () => {
  const bufferSize = 4096;
  const audioSampleRate = 44_100;

  it('should scan from the start of the chunk when nextIndexPeaks lies before currentMinIndex', async () => {
    // Case C from the ticket: a high-threshold peak fired early, mute-zone ended,
    // then the signal dropped and several chunks passed. nextIndexPeaks[threshold]
    // is now an absolute index in the PAST relative to the current chunk window.
    const analyzer = new RealTimeBpmAnalyzer();
    const currentMinIndex = bufferSize * 4; // 16384
    const currentMaxIndex = currentMinIndex + bufferSize; // 20480

    const key090 = getThresholdKey(analyzer, 0.9);
    analyzer.nextIndexPeaks[key090] = 10_500; // Before currentMinIndex, mute zone long since ended

    const channelData = new Float32Array(bufferSize);
    const peakChunkOffset = 100;
    channelData[peakChunkOffset] = 0.95;

    await analyzer.findPeaks({
      audioSampleRate,
      channelData,
      bufferSize,
      currentMinIndex,
      currentMaxIndex,
      postMessage() {
        // No-op
      },
    });

    const expectedAbsoluteIndex = currentMinIndex + peakChunkOffset;
    expect(analyzer.validPeaks[key090]).to.include(expectedAbsoluteIndex);
  });

  it('should resume from the correct offset when nextIndexPeaks lies inside the chunk', async () => {
    // Case B from the ticket: mute-zone of a recent peak extends into the current chunk.
    // Scan must start at (nextIndex - currentMinIndex) to honour the mute zone.
    const analyzer = new RealTimeBpmAnalyzer();
    const currentMinIndex = bufferSize * 4;
    const currentMaxIndex = currentMinIndex + bufferSize;

    const key090 = getThresholdKey(analyzer, 0.9);
    // Mute zone ends 500 samples into the current chunk — peaks before 500 must be skipped
    analyzer.nextIndexPeaks[key090] = currentMinIndex + 500;

    const channelData = new Float32Array(bufferSize);
    channelData[100] = 0.95; // Inside mute zone — must NOT be detected
    channelData[1000] = 0.95; // After mute zone — must be detected

    await analyzer.findPeaks({
      audioSampleRate,
      channelData,
      bufferSize,
      currentMinIndex,
      currentMaxIndex,
      postMessage() {
        // No-op
      },
    });

    expect(analyzer.validPeaks[key090]).to.not.include(currentMinIndex + 100);
    expect(analyzer.validPeaks[key090]).to.include(currentMinIndex + 1000);
  });
});
