/**
 * Events emitted by the BPM analyzer processor (Processor → Main Thread)
 * @group Events
 */
export type ProcessorOutputEvent =
  | {type: 'bpm'; data: BpmCandidates}
  | {type: 'bpmStable'; data: BpmCandidates}
  | {type: 'analyzerReset'}
  | {type: 'analyzeChunk'; data: Float32Array}
  | {type: 'validPeak'; data: {threshold: Threshold; index: number}}
  | {type: 'error'; data: {message: string; error: Error}};

/**
 * Control events sent to the processor (Main Thread → Processor)
 * @group Events
 */
export type ProcessorInputEvent = {type: 'reset'} | {type: 'stop'};

/**
 * MessagePort message wrapper for processor input events
 * @internal
 */
export type ProcessorInputMessage = {
  data: ProcessorInputEvent;
};

/**
 * Type-safe event listener map for BPM analyzer events
 * @group Events
 */
export type BpmAnalyzerEventMap = {
  /** Emitted continuously during BPM analysis with current tempo candidates */
  bpm: BpmCandidates;
  /** Emitted when BPM detection has stabilized with high confidence */
  bpmStable: BpmCandidates;
  /** Emitted when the analyzer state has been reset */
  analyzerReset: void;
  /** Emitted in debug mode when analyzing audio chunks */
  analyzeChunk: Float32Array;
  /** Emitted in debug mode when a valid peak is detected */
  validPeak: {threshold: Threshold; index: number};
  /**
   * Emitted when an error occurs during processing.
   * @remarks
   * Worklet-load failures thrown by `createRealtimeBpmAnalyzer` wrap the
   * underlying cause via `Error.cause` (ES2022). Inspect `error.cause`
   * to read the originating DOMException.
   * @example
   * ```ts
   * analyzer.on('error', ({error}) => {
   *   console.log(error.message);
   *   console.log((error as Error).cause);
   * });
   * ```
   */
  error: {message: string; error: Error};
};

/**
 * Threshold value for peak detection (0.0 to 1.0)
 * @group Type Aliases
 */
export type Threshold = number;

/**
 * Array of peak positions in audio samples
 * @group Type Aliases
 */
export type Peaks = number[];

/**
 * Peaks with their associated threshold
 * @internal
 */
export type PeaksAndThreshold = {
  peaks: Peaks;
  threshold: Threshold;
};

/**
 * BPM analysis results with tempo candidates
 * @group Type Aliases
 */
export type BpmCandidates = {
  /** Up to 5 tempo candidates, sorted by `count` (highest first) */
  readonly bpm: readonly Tempo[];
  /** Threshold value used for peak detection */
  readonly threshold: Threshold;
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
 * Detected tempo with confidence metrics
 * @group Type Aliases
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
 * Tempo range, in BPM, that every detected tempo is folded into by doubling or halving.
 *
 * @remarks
 * The detector cannot tell a tempo from its double or half from peak intervals alone,
 * so it reports the octave that lands inside this range. The default, 90–180, reads an
 * 85 BPM hip-hop track as 170; a 70–140 range reads it as 85.
 * `max` must be at least twice `min`, so that every tempo has an octave inside the range.
 * Keep the expected tempo away from the bounds: folding happens before rounding, so a tempo
 * sitting on an edge splits its votes between the two octaves.
 *
 * @group Type Aliases
 */
export type TempoRange = {
  /** Lowest tempo reported, in BPM (default: 90) */
  readonly min: number;
  /** Highest tempo reported, in BPM (default: 180) */
  readonly max: number;
};

/**
 * Options for {@link analyzeFullBuffer}: lowpass filter settings plus the tempo range
 * @group Type Aliases
 */
export type AnalyzeFullBufferOptions = BiquadFilterOptions & {
  /** Range every tempo is folded into (default: 90–180 BPM) */
  tempoRange?: TempoRange;
};

/**
 * Configuration options for the real-time BPM analyzer
 * @group Type Aliases
 */
export type RealTimeBpmAnalyzerParameters = {
  /** Continue analyzing after stable BPM is found (default: false) */
  continuousAnalysis?: boolean;
  /** Time in milliseconds to consider BPM stable (default: `defaultStabilizationTime` — 20 000 ms) */
  stabilizationTime?: number;
  /** Audio samples to skip between peaks (default: `defaultMuteTimeInIndexes` — 10 000 sample indexes) */
  muteTimeInIndexes?: number;
  /** Enable debug event logging (default: false) */
  debug?: boolean;
  /** Range every tempo is folded into (default: 90–180 BPM) */
  tempoRange?: TempoRange;
};

/**
 * Internal analyzer options with required fields
 * @internal
 */
export type RealTimeBpmAnalyzerOptions = {
  continuousAnalysis: boolean;
  stabilizationTime: number;
  muteTimeInIndexes: number;
  debug: boolean;
  tempoRange: TempoRange;
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
  threshold: Threshold;
  offset?: number;
};

/**
 * Options for real-time peak detection in audio worklet
 * @internal
 */
export type RealtimeFindPeaksOptions = {
  audioSampleRate: number;
  channelData: Float32Array;
  bufferSize: number;
  currentMinIndex: number;
  currentMaxIndex: number;
  postMessage: (data: ProcessorOutputEvent) => void;
};

/**
 * Options for analyzing audio chunks in real-time
 * @internal
 */
export type RealtimeAnalyzeChunkOptions = {
  audioSampleRate: number;
  channelData: Float32Array;
  bufferSize: number;
  postMessage: (data: ProcessorOutputEvent) => void;
};

/**
 * Map of threshold values to their corresponding detected peaks
 * @internal
 */
export type ValidPeaks = Record<string, Peaks>;

/**
 * Map of threshold values to the next peak index to search from
 * @internal
 */
export type NextIndexPeaks = Record<string, number>;

/**
 * Callback function executed when processing each threshold level
 * @internal
 */
export type OnThresholdFunction = (threshold: Threshold) => Promise<boolean>;

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
