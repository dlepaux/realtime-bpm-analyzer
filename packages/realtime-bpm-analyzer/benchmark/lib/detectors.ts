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
  /** For dev only, unless it is the pick */
  readonly candidate?: true;
};

/** The extension's TEMPO_RANGE, rba-pro/extension/src/lib/reading.ts. Also what peaks folds into by default */
const extensionRange = {min: 90, max: 180};
const wideRange = {min: 50, max: 240};
// What #285 shipped, fitted on sets that are now evaluation-only: kept as the row to compare against
const tuning285 = {priorBpm: 136, priorOctaves: 0.8, halfBeatPenalty: 0, thirdBeatPenalty: 0};
// RBA-51's first pick (b1ab9d3): lost fast music on its look, kept as the row to compare against.
// Only here: since the second look the library holds the locked values and nothing else
const tuningFirst = {priorBpm: 110, priorOctaves: 0.7, halfBeatPenalty: 0, thirdBeatPenalty: 0.2};
// Three points of one ridge on the second sweep's dev surface, equal within its noise: on 90 to 180 the
// prior is only a tilt, so its two knobs trade off. Candidates for a ruling, not a pick
const ridge50 = {priorBpm: 50, priorOctaves: 2.4, halfBeatPenalty: 0, thirdBeatPenalty: 0.3};
const ridge80 = {priorBpm: 80, priorOctaves: 1.7, halfBeatPenalty: 0, thirdBeatPenalty: 0.3};
const ridge100 = {priorBpm: 100, priorOctaves: 1.3, halfBeatPenalty: 0, thirdBeatPenalty: 0.2};
const tempogram = {detector: 'tempogram'} as const;

// Rows with no `tuning` read what the library holds now. In result files from before 2026-11-01, `tempogram`,
// `tempogram-90-180` and `tempogram-90-180-resetting` are the first pick, `tempogram` on 50 to 240.
// Rows with a past tuning state the range they were measured on, as the library's default moved to 90 to 180.
export const detectors: Record<string, DetectorConfig> = {
  peaks: {options: {}, lowpass: true, offline: true},
  'peaks-50-240': {options: {tempoRange: wideRange}, lowpass: true, offline: false},
  tempogram: {options: tempogram, lowpass: false, offline: true},
  'tempogram-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false},
  'tempogram-285': {options: {...tempogram, tempoRange: wideRange}, lowpass: false, offline: false, tuning: tuning285},
  'tempogram-285-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false, tuning: tuning285},
  'tempogram-first': {options: {...tempogram, tempoRange: wideRange}, lowpass: false, offline: false, tuning: tuningFirst},
  'tempogram-first-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false, tuning: tuningFirst},
  'tempogram-ridge-50-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false, tuning: ridge50, candidate: true},
  'tempogram-ridge-80-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false, tuning: ridge80, candidate: true},
  'tempogram-ridge-100-90-180': {options: {...tempogram, tempoRange: extensionRange}, lowpass: false, offline: false, tuning: ridge100, candidate: true},
  'tempogram-ridge-80-90-180-resetting': {
    options: {...tempogram, tempoRange: extensionRange, continuousAnalysis: true, stabilizationTime: 10_000},
    lowpass: false,
    offline: false,
    tuning: ridge80,
    candidate: true,
  },
  // The candidate as a caller gets it: through the option, with no override, so a look scores the shipped path
  'tempogram-extension': {options: {...tempogram, tempogramMode: 'extension'}, lowpass: false, offline: false},
  // The extension's options as they are today, offscreen/main.ts: its timer resets the analyzer every 10 s
  'tempogram-90-180-resetting': {
    options: {...tempogram, tempoRange: extensionRange, continuousAnalysis: true, stabilizationTime: 10_000},
    lowpass: false,
    offline: false,
  },
};

/**
 * The configuration fixed for RBA-51's second and last look, by its DECISION of 2026-10-31, which must
 * hold the guard on the real path before the look: see the job's heldout mode. The amended rule in
 * lib/sweep.ts gives the same values, and a test holds the three together.
 */
export const pickedConfiguration = 'tempogram-extension';

/** What the look scores, and all it may: the pick, and the two references its DECISION names */
export const lookDetectors: readonly string[] = ['peaks', 'tempogram-285-90-180', pickedConfiguration];
