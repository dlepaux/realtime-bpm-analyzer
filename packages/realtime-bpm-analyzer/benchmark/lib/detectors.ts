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

/** The extension's TEMPO_RANGE, rba-pro/extension/src/lib/reading.ts. Also what peaks folds into by default */
const extensionRange = {min: 90, max: 180};
const wideRange = {min: 50, max: 240};
// What #285 shipped, fitted on sets that are now evaluation-only: kept as the row to compare against
const tuning285 = {priorBpm: 136, priorOctaves: 0.8, halfBeatPenalty: 0, thirdBeatPenalty: 0};
// RBA-51's first pick (b1ab9d3): lost fast music on its look, kept as the row to compare against
const tuningFirst = {priorBpm: 110, priorOctaves: 0.7, halfBeatPenalty: 0, thirdBeatPenalty: 0.2};
const tempogram = {detector: 'tempogram'} as const;

export const detectors: Record<string, DetectorConfig> = {
  peaks: {options: {}, lowpass: true, offline: true},
  'peaks-50-240': {options: {tempoRange: wideRange}, lowpass: true, offline: false},
  tempogram: {options: tempogram, lowpass: false, offline: true},
  'tempogram-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false},
  'tempogram-285': {options: tempogram, lowpass: false, offline: false, tuning: tuning285},
  'tempogram-285-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false, tuning: tuning285},
  'tempogram-first': {options: tempogram, lowpass: false, offline: false, tuning: tuningFirst},
  'tempogram-first-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false, tuning: tuningFirst},
  // The extension's options as they are today, offscreen/main.ts: its timer resets the analyzer every 10 s
  'tempogram-90-180-resetting': {
    options: {...tempogram, tempoRange: extensionRange, continuousAnalysis: true, stabilizationTime: 10_000},
    lowpass: false,
    offline: false,
  },
};

/**
 * The configuration the second sweep picked, which must hold the guard on the real path before any
 * look: see the job's heldout mode. Null until the pick is fixed, and null starts no look.
 */
export const pickedConfiguration: string | null = null;
