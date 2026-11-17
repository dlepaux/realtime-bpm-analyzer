import type {Tempo, TempoRange} from './types';
import {findPeaks, findPeaksRelativeToLevel} from './peak-detection';
import {identifyIntervals, groupByTempo, getTopCandidates} from './tempo';

/** The tempos of one channel, and whether the confidence calibration covers them */
export type PeaksTempos = {
  /** Up to 5 tempo candidates, sorted by `count` */
  readonly tempos: Tempo[];
  /**
   * False when the beats were found only relative to the channel's own level (RBA-221). The peaks calibration
   * (RBA-106) never saw such a reading, so its confidence is unmeasured.
   */
  readonly calibrated: boolean;
};

/**
 * Tempo candidates of one already-lowpassed channel. Shared by the Web Audio pipeline
 * (`analyzeFullBuffer`) and the Node entry, so the two can only differ by their filter.
 * @param channelData Lowpassed PCM samples of one channel
 * @param sampleRate Sample rate in Hz
 * @param tempoRange Validated range the tempos are folded into
 * @returns The candidates, none for silence or a channel with no beat, and whether they are calibrated
 */
export async function detectTempo(
  channelData: Float32Array,
  sampleRate: number,
  tempoRange: TempoRange,
): Promise<PeaksTempos> {
  const fixed = await findPeaks({
    audioSampleRate: sampleRate,
    channelData,
  });

  // RBA-221: whatever the fixed ladder finds keeps exactly the result it had before. Only a channel it finds no peaks
  // in, as when the bass after the lowpass peaks under about -14 dBFS (RBA-218), is searched relative to its level
  if (fixed.peaks.length > 0) {
    return {tempos: temposOf(fixed.peaks, sampleRate, tempoRange), calibrated: true};
  }

  const relative = await findPeaksRelativeToLevel({
    audioSampleRate: sampleRate,
    channelData,
  });

  return {tempos: temposOf(relative.peaks, sampleRate, tempoRange), calibrated: false};
}

function temposOf(peaks: number[], sampleRate: number, tempoRange: TempoRange): Tempo[] {
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo({
    audioSampleRate: sampleRate,
    intervalCounts: intervals,
    tempoRange,
  });

  return getTopCandidates(tempos);
}
