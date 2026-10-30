import type {TempogramTuning} from '../../src/core/tempogram';
import type {RealTimeBpmAnalyzerParameters} from '../../src/core/types';

export type DetectorConfig = {
  readonly options: RealTimeBpmAnalyzerParameters;
  /** Whether the audio goes through `getBiquadFilter` first, as the realtime guides wire the analyzer */
  readonly lowpass: boolean;
  /** Also run the offline path */
  readonly offline: boolean;
  /** Tempogram overrides, to keep a past tuning measurable */
  readonly tuning?: Partial<TempogramTuning>;
};

export const detectors: Record<string, DetectorConfig> = {
  peaks: {options: {}, lowpass: true, offline: true},
  tempogram: {options: {detector: 'tempogram'}, lowpass: false, offline: true},
  // What #285 shipped, fitted on sets that are now evaluation-only: kept as the row to compare against
  'tempogram-285': {
    options: {detector: 'tempogram'},
    lowpass: false,
    offline: false,
    tuning: {priorBpm: 136, priorOctaves: 0.8, halfBeatPenalty: 0, thirdBeatPenalty: 0},
  },
};
