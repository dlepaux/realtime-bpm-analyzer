// Internal types of the engines. The public types are in ../contract/types.ts.
export type {TempoRange} from '../contract/types';
import type {TempoRange} from '../contract/types';

/**
 * Peaks with their associated threshold
 * @internal
 */
export type PeaksAndThreshold = {
  peaks: number[];
  threshold: number;
};

/**
 * The peaks engine's candidates on the rung it read them from
 * @internal
 */
export type RungTempos = {
  /** Up to 5 tempo candidates, sorted by `count` (highest first) */
  readonly bpm: Tempo[];
  readonly threshold: number;
};

/**
 * Interval between beats
 * @internal
 */
export type Interval = {
  /** Time interval in audio samples */
  readonly interval: number;
  /** Number of times this interval was detected */
  readonly count: number;
};

/**
 * Tempo group with occurrence count
 * @internal
 */
export type Group = {
  /** Tempo in BPM */
  readonly tempo: number;
  /** Number of intervals matching this tempo */
  readonly count: number;
};

/**
 * One engine candidate, before it becomes a public `Candidate`
 * @internal
 */
export type Tempo = {
  /** Detected tempo in beats per minute */
  readonly tempo: number;
  /** Number of peak intervals that voted for this tempo. Candidates are ranked by it. */
  readonly count: number;
  /**
   * Share of all interval votes that agree with this tempo, from 0 to 1.
   *
   * Computed as `(count(tempo − 1) + count(tempo) + count(tempo + 1)) / totalVotes`,
   * where `totalVotes` sums the counts of every tempo group, not only the returned
   * candidates. The ±1 BPM window absorbs rounding jitter.
   *
   * @remarks
   * A perfect click train scores about 0.46, not 1: each peak is paired with the next
   * 9 peaks, and only pairs 1, 2, 4 and 8 beats apart fold back onto the beat tempo. Compare values against each other; no absolute
   * cut-off has been calibrated on real music yet.
   */
  readonly confidence: number;
};

/**
 * Options for grouping intervals by tempo
 * @internal
 */
export type AnalyzerGroupByTempoOptions = {
  audioSampleRate: number;
  intervalCounts: Interval[];
  tempoRange?: TempoRange;
};

/**
 * Options for finding peaks in audio data
 * @internal
 */
export type AnalyzerFindPeaksOptions = {
  audioSampleRate: number;
  channelData: Float32Array;
};

/**
 * Options for computing BPM from detected peaks
 * @internal
 */
export type AnalyzerComputeBpmOptions = {
  audioSampleRate: number;
  data: ValidPeaks;
  tempoRange?: TempoRange;
};

/**
 * Options for finding peaks at a specific threshold level
 * @internal
 */
export type AnalyzerFindPeaksAtTheshold = {
  audioSampleRate: number;
  data: Float32Array;
  threshold: number;
  offset?: number;
};

/**
 * Map of threshold values to their corresponding detected peaks
 * @internal
 */
export type ValidPeaks = Record<string, number[]>;

/**
 * Map of threshold values to the next peak index to search from
 * @internal
 */
export type NextIndexPeaks = Record<string, number>;

/**
 * Callback function executed when processing each threshold level
 * @internal
 */
export type OnThresholdFunction = (threshold: number) => Promise<boolean>;

/**
 * Aggregated audio buffer data for real-time analysis
 * @internal
 */
export type AggregateData = {
  readonly isBufferFull: boolean;
  readonly buffer: Float32Array;
  readonly bufferSize: number;
};

/**
 * Configuration options for biquad filter creation
 */
export type BiquadFilterOptions = {
  frequencyValue?: number;
  qualityValue?: number;
};
