import type {Tempo, TempoRange} from './types';
import {findPeaks, findPeaksRelativeToLevel} from './peak-detection';
import {identifyIntervals, groupByTempo, getTopCandidates} from './tempo';

/**
 * Tempo candidates of one already-lowpassed channel. Shared by the Web Audio pipeline
 * (`analyzeFullBuffer`) and the Node entry, so the two can only differ by their filter.
 * @param channelData Lowpassed PCM samples of one channel
 * @param sampleRate Sample rate in Hz
 * @param tempoRange Validated range the tempos are folded into
 * @returns Up to 5 tempo candidates, sorted by `count`, or none for silence
 */
export async function detectTempo(
  channelData: Float32Array,
  sampleRate: number,
  tempoRange: TempoRange,
): Promise<Tempo[]> {
  const fixed = await findPeaks({
    audioSampleRate: sampleRate,
    channelData,
  });
  // Whatever the fixed ladder reads keeps exactly today's result. Only a channel it finds nothing in, as
  // when the bass after the lowpass peaks under about −14 dBFS (RBA-218), is searched relative to its level.
  const {peaks} = fixed.peaks.length > 0
    ? fixed
    : await findPeaksRelativeToLevel({audioSampleRate: sampleRate, channelData});
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo({
    audioSampleRate: sampleRate,
    intervalCounts: intervals,
    tempoRange,
  });

  return getTopCandidates(tempos);
}
