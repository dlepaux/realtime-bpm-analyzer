import type {RealTimeBpmAnalyzerParameters} from '../../src/core/types';

export type DetectorConfig = {
  readonly options: RealTimeBpmAnalyzerParameters;
  /** Whether the audio goes through `getBiquadFilter` first, as the realtime guides wire the analyzer */
  readonly lowpass: boolean;
  /** Also run the offline path */
  readonly offline: boolean;
};

export const detectors: Record<string, DetectorConfig> = {
  peaks: {options: {}, lowpass: true, offline: true},
  tempogram: {options: {detector: 'tempogram'}, lowpass: false, offline: false},
};
