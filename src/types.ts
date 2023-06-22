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

/**
 * Events
 */
export type AnalyzeChunkEventData = {
  message: 'ANALYZE_CHUNK';
  data: Float32Array;
};

export type AnalyzeChunkEvent = {
  data: AnalyzeChunkEventData;
};

export type ValidPeakEventData = {
  message: 'VALID_PEAK';
  data: {
    threshold: number;
    index: number;
  };
};

export type ValidPeakEvent = {
  data: ValidPeakEventData;
};

export type BpmEventData = {
  message: 'BPM' | 'BPM_STABLE';
  result: BpmCandidates;
};

export type BpmEvent = {
  data: BpmEventData;
};

export type AsyncConfigurationEventData = {
  message: 'ASYNC_CONFIGURATION';
  parameters: RealTimeBpmAnalyzerParameters;
};

export type AnalyzerResetedEvent = {
  data: AnalyzerResetedEventData;
};

export type AnalyzerResetedEventData = {
  message: 'ANALYZER_RESETED';
};

export type ResetEventData = {
  message: 'RESET';
};

export type StopEventData = {
  message: 'STOP';
};

export type AsyncConfigurationEvent = {
  data: AsyncConfigurationEventData | ResetEventData | StopEventData;
};

export type PostMessageEventData = BpmEventData | AnalyzerResetedEventData | AnalyzeChunkEventData | ValidPeakEventData;

/**
 * Analyzer Types
 */
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
