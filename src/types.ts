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

export type Tempo = {
  tempo: number;
  count: number;
};

export type RealTimeBpmAnalyzerParameters = {
  continuousAnalysis?: boolean;
  computeBpmDelay?: number;
  stabilizationTime?: number;
  muteTimeInIndexes?: number;
};

export type RealTimeBpmAnalyzerOptions = {
  continuousAnalysis: boolean;
  computeBpmDelay: number;
  stabilizationTime: number;
  muteTimeInIndexes: number;
};

export type StrobeAnalyzerParameters = {
  threshold?: number;
  minTimeBetweenBump?: number;
};

export type StrobeAnalyzerOptions = {
  threshold: number;
  minTimeBetweenBump: number;
};

export type ValidPeaks = Record<string, Peaks>;

export type NextIndexPeaks = Record<string, number>;

export type OnThresholdFunction = (threshold: Threshold) => Promise<boolean>;
