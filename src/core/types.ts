/**
 * Events emitted by the BPM analyzer processor (Processor → Main Thread)
 * @group Events
 */
export type ProcessorOutputEvent =
  | {type: 'bpm'; data: BpmCandidates}
  | {type: 'bpmStable'; data: BpmCandidates}
  | {type: 'analyzerReset'}
  | {type: 'analyzeChunk'; data: Float32Array}
  | {type: 'validPeak'; data: {threshold: Threshold; index: number}};

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
};

/**
 * Event listener callback type
 * @group Events
 */
export type EventListener<T> = (data: T) => void;

/**
 * Map of event names to their listener arrays
 * @group Events
 */
export type EventListenerMap = {
  [K in keyof BpmAnalyzerEventMap]?: Array<EventListener<BpmAnalyzerEventMap[K]>>;
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
  bpm: Tempo[];
  /** Threshold value used for peak detection */
  threshold: Threshold;
};

/**
 * Interval between beats
 * @group Type Aliases
 */
export type Interval = {
  /** Time interval in audio samples */
  interval: number;
  /** Number of times this interval was detected */
  count: number;
};

/**
 * Tempo group with occurrence count
 * @group Type Aliases
 */
export type Group = {
  /** Tempo in BPM */
  tempo: number;
  /** Number of intervals matching this tempo */
  count: number;
};

/**
 * Detected tempo with confidence metrics
 * @group Type Aliases
 */
export type Tempo = {
  /** Detected tempo in beats per minute */
  tempo: number;
  /** Number of matching intervals (higher = more confident) */
  count: number;
  /** Confidence score (0-1 scale) */
  confidence: number;
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

export type AnalyzerGroupByTempoOptions = {
  audioSampleRate: number;
  intervalCounts: Interval[];
};

export type AnalyzerFindPeaksOptions = {
  audioSampleRate: number;
  channelData: Float32Array;
};

export type AnalyzerComputeBpmOptions = {
  audioSampleRate: number;
  data: ValidPeaks;
};

export type AnalyzerFindPeaksAtTheshold = {
  audioSampleRate: number;
  data: Float32Array;
  threshold: Threshold;
  offset?: number;
};

export type RealtimeFindPeaksOptions = {
  audioSampleRate: number;
  channelData: Float32Array;
  bufferSize: number;
  currentMinIndex: number;
  currentMaxIndex: number;
  postMessage: (data: ProcessorOutputEvent) => void;
};

export type RealtimeAnalyzeChunkOptions = {
  audioSampleRate: number;
  channelData: Float32Array;
  bufferSize: number;
  postMessage: (data: ProcessorOutputEvent) => void;
};

export type ValidPeaks = Record<string, Peaks>;

export type NextIndexPeaks = Record<string, number>;

export type OnThresholdFunction = (threshold: Threshold) => Promise<boolean>;

export type AggregateData = {
  isBufferFull: boolean;
  buffer: Float32Array;
  bufferSize: number;
};

export type NormalizedFilters = {
  lowpass: BiquadFilterNode;
  highpass: BiquadFilterNode;
};

export type BiquadFilterOptions = {
  frequencyValue?: number;
  qualityValue?: number;
};
