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
export type ProcessorInputEvent =
  | {type: 'reset'}
  | {type: 'stop'};

/**
 * MessagePort message wrapper for processor input events
 * @group Events
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
  /** Emitted when an error occurs during processing */
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
 * @group Type Aliases
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
  /** Array of tempo candidates sorted by confidence */
  readonly bpm: readonly Tempo[];
  /** Threshold value used for peak detection */
  readonly threshold: Threshold;
};

/**
 * Interval between beats
 * @group Type Aliases
 */
export type Interval = {
  /** Time interval in audio samples */
  readonly interval: number;
  /** Number of times this interval was detected */
  readonly count: number;
};

/**
 * Tempo group with occurrence count
 * @group Type Aliases
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
  /** Number of matching intervals (higher = more confident) */
  readonly count: number;
  /** Confidence score (0-1 scale) */
  readonly confidence: number;
};

/**
 * Configuration options for the real-time BPM analyzer
 * @group Type Aliases
 */
export type RealTimeBpmAnalyzerParameters = {
  /** Continue analyzing after stable BPM is found (default: false) */
  continuousAnalysis?: boolean;
  /** Time in milliseconds to consider BPM stable (default: 20000) */
  stabilizationTime?: number;
  /** Audio samples to skip between peaks (default: 10000) */
  muteTimeInIndexes?: number;
  /** Enable debug event logging (default: false) */
  debug?: boolean;
};

/**
 * Internal analyzer options with required fields
 * @group Type Aliases
 */
export type RealTimeBpmAnalyzerOptions = {
  continuousAnalysis: boolean;
  stabilizationTime: number;
  muteTimeInIndexes: number;
  debug: boolean;
};

/**
 * Options for grouping intervals by tempo
 * @internal
 */
export type AnalyzerGroupByTempoOptions = {
  audioSampleRate: number;
  intervalCounts: Interval[];
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
 * Normalized biquad filter nodes for audio processing
 * @internal
 */
export type NormalizedFilters = {
  lowpass: BiquadFilterNode;
  highpass: BiquadFilterNode;
};

/**
 * Configuration options for biquad filter creation
 */
export type BiquadFilterOptions = {
  frequencyValue?: number;
  qualityValue?: number;
};
