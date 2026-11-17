// RBA-221's oracle: the peaks file path as it stood on main at 6624169, before the level-relative fallback, so the
// tests can prove that every reading that path returned is still returned whole. `oracleFindPeaks`,
// `oracleDetectTempo` and the peaks branch of `oracleAnalyzeSamples` are verbatim copies of `findPeaks`,
// `detectTempo` and `analyzeSamples`, renamed and with their comments cut. What they call (`findPeaksAtThreshold`,
// the tempo grouping, `toReading`, the option checks) is imported: RBA-221 leaves those untouched, and they also run
// the realtime engine, whose tests pin them. Never update this file to follow the library: it is the "before".
import type {LowpassOption, OfflineOptions, OfflineResult} from '../../src/contract/types';
import {assertOptions, resolveOfflineEngine, toReading} from '../../src/core/engine';
import {findPeaksAtThreshold} from '../../src/core/peak-detection';
import {identifyIntervals, groupByTempo, getTopCandidates, resolveTempoRange} from '../../src/core/tempo';
import type {PeaksAndThreshold, AnalyzerFindPeaksOptions, Tempo, TempoRange} from '../../src/core/types';
import {descendingOverThresholds} from '../../src/core/utils';
import * as consts from '../../src/core/consts';

async function oracleFindPeaks({
  audioSampleRate,
  channelData,
}: AnalyzerFindPeaksOptions): Promise<PeaksAndThreshold> {
  if (audioSampleRate <= 0) {
    throw new Error(
      `Invalid sample rate: ${audioSampleRate}. Sample rate must be positive.`,
    );
  }

  if (!channelData || channelData.length === 0) {
    throw new Error('Invalid channel data: buffer is empty or undefined.');
  }

  let validPeaks: number[] = [];
  let validThreshold = 0;

  await descendingOverThresholds(async threshold => {
    const {peaks} = findPeaksAtThreshold({
      audioSampleRate,
      data: channelData,
      threshold,
    });

    if (peaks.length < consts.minPeaks) {
      return false;
    }

    validPeaks = peaks;
    validThreshold = threshold;

    return true;
  });

  return {
    peaks: validPeaks,
    threshold: validThreshold,
  };
}

export async function oracleDetectTempo(
  channelData: Float32Array,
  sampleRate: number,
  tempoRange: TempoRange,
): Promise<Tempo[]> {
  const {peaks} = await oracleFindPeaks({
    audioSampleRate: sampleRate,
    channelData,
  });
  const intervals = identifyIntervals(peaks);
  const tempos = groupByTempo({
    audioSampleRate: sampleRate,
    intervalCounts: intervals,
    tempoRange,
  });

  return getTopCandidates(tempos);
}

/**
 * The peaks branch of `analyzeSamples`. Its NaN check is left out: a NaN sample throws before either path runs, so
 * no reading depends on it.
 * @param lowpass Filters the samples, as `analyzeFullBuffer` or `analyzeChannelData` does
 */
export async function oracleAnalyzeSamples(
  channelData: Float32Array,
  sampleRate: number,
  options: OfflineOptions | undefined,
  lowpass: (settings: LowpassOption) => Promise<Float32Array>,
): Promise<OfflineResult> {
  assertOptions(options, 'offline');
  const engine = resolveOfflineEngine(options?.engine, sampleRate);
  const tempoRange = resolveTempoRange(options?.tempoRange);
  const audio = {from: 0, to: channelData.length / sampleRate, contextTime: null};

  if (engine.name !== 'peaks') {
    throw new Error('The oracle covers the peaks engine only');
  }

  const filtered = await lowpass(engine.lowpass);
  return toReading(await oracleDetectTempo(filtered, sampleRate, tempoRange), audio, 'peaks', tempoRange);
}
