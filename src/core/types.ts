/**
 * Event message types for the BPM analyzer
 * @group Events
 */
export type EventBuilder<S extends string, T = undefined> = T extends undefined
  ? {message: S}
  : {message: S; data: T};

/**
 * @group Events
 */
export type EventMessageBuilder<T> = {
  data: T;
};

/**
 * Event emitted when analyzing audio chunks in debug mode
 * @group Events
 */
export type AnalyzeChunkEvent = EventBuilder<'ANALYZE_CHUNK', Float32Array>;

/**
 * @group Events
 */
export type AnalyzeChunkEventMessage = EventMessageBuilder<AnalyzeChunkEvent>;

/**
 * Event emitted when a valid peak is detected
 * @group Events
 */
export type ValidPeakEvent = EventBuilder<'VALID_PEAK', {threshold: Threshold; index: number}>;

/**
 * @group Events
 */
export type ValidPeakEventMessage = EventMessageBuilder<ValidPeakEvent>;

/**
 * Debug event for internal diagnostics
 * @group Events
 */
export type DebugEvent = EventBuilder<'DEBUG', unknown>;

/**
 * @group Events
 */
export type DebugEventDataMessage = EventMessageBuilder<DebugEvent>;

/**
 * BPM event emitted during analysis.
 * - 'BPM': Emitted continuously during analysis
 * - 'BPM_STABLE': Emitted when BPM has stabilized
 * @group Events
 */
export type BpmEvent = EventBuilder<'BPM' | 'BPM_STABLE', BpmCandidates>;

/**
 * @group Events
 */
export type BpmEventMessage = EventMessageBuilder<BpmEvent>;

/**
 * Event emitted when the analyzer is reset
 * @group Events
 */
export type AnalyzerResetedEvent = EventBuilder<'ANALYZER_RESETED'>;

/**
 * @group Events
 */
export type AnalyzerResetedEventMessage = EventMessageBuilder<AnalyzerResetedEvent>;

/**
 * Event to reset the analyzer
 * @group Events
 */
export type ResetEvent = EventBuilder<'RESET'>;

/**
 * Event to stop the analyzer
 * @group Events
 */
export type StopEvent = EventBuilder<'STOP'>;

/**
 * Union of all analyzer control events
 * @group Events
 */
export type RealtimeBpmAnalyzerEvents = {
  data: ResetEvent | StopEvent;
};

/**
 * Union of all events that can be posted from the processor
 * @group Events
 */
export type PostMessageEvents = BpmEvent | AnalyzerResetedEvent | AnalyzeChunkEvent | ValidPeakEvent | DebugEvent;

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
  postMessage: (data: PostMessageEvents) => void;
};

export type RealtimeAnalyzeChunkOptions = {
  audioSampleRate: number;
  channelData: Float32Array;
  bufferSize: number;
  postMessage: (data: PostMessageEvents) => void;
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
