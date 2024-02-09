/**
 * Events
 */
export type EventBuilder<S extends string, T = undefined> = T extends undefined
  ? {message: S}
  : {message: S; data: T};
export type EventMessageBuilder<T> = {
  data: T;
};

export type AnalyzeChunkEvent = EventBuilder<'ANALYZE_CHUNK', Float32Array>;
export type AnalyzeChunkEventMessage = EventMessageBuilder<AnalyzeChunkEvent>;

export type ValidPeakEvent = EventBuilder<'VALID_PEAK', {threshold: Threshold; index: number}>;
export type ValidPeakEventMessage = EventMessageBuilder<ValidPeakEvent>;

export type DebugEvent = EventBuilder<'DEBUG', unknown>;
export type DebugEventDataMessage = EventMessageBuilder<DebugEvent>;

export type BpmEvent = EventBuilder<'BPM' | 'BPM_STABLE', BpmCandidates>;
export type BpmEventMessage = EventMessageBuilder<BpmEvent>;

export type AnalyzerResetedEvent = EventBuilder<'ANALYZER_RESETED'>;
export type AnalyzerResetedEventMessage = EventMessageBuilder<AnalyzerResetedEvent>;

export type ResetEvent = EventBuilder<'RESET'>;

export type StopEvent = EventBuilder<'STOP'>;

export type RealtimeBpmAnalyzerEvents = {
  data: ResetEvent | StopEvent;
};

export type PostMessageEvents = BpmEvent | AnalyzerResetedEvent | AnalyzeChunkEvent | ValidPeakEvent | DebugEvent;

/**
 * Analyzer Types
 */
export type Threshold = number;

export type Peaks = number[];

export type PeaksAndThreshold = {
  peaks: Peaks;
  threshold: Threshold;
};

export type BpmCandidates = {
  bpm: Tempo[];
  threshold: Threshold;
};

export type Interval = {
  interval: number;
  count: number;
};

export type Group = {
  tempo: number;
  count: number;
};

export type Tempo = {
  tempo: number;
  count: number;
  confidence: number;
};

export type RealTimeBpmAnalyzerParameters = {
  continuousAnalysis?: boolean;
  stabilizationTime?: number;
  muteTimeInIndexes?: number;
  debug?: boolean;
};

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
