import {HYSTERESIS} from '../../src/contract/types';
import type {EngineName, Hysteresis} from '../../src/contract/types';
import {hysteresisFields, sweepGrids} from './hysteresis';
import {pickedSamples} from './hysteresis-pick';
import type {Sample} from './hysteresis';
import type {Split, TrackResult} from './types';

/**
 * The calibration samples benchmark/calibration.py reads: per track, the reading shown at each sample time and the
 * offline reading. Each reading is [bpm, confidence, raw] since the harness records the raw score: the calibrated confidence it carried, and
 * the raw score that confidence maps, which is the one a re-fit reads. Files without `format` are older and hold
 * [bpm, confidence] only, which was the raw score before e70a4f5 and the calibrated one after it.
 */
export const samplesFormat = 2;

/**
 * The row the committed tempogram table was fitted at (results/rba-106-calibration-dev.json): the sweep's pick,
 * the contract's values with `pulseLostAfterSeconds` 3. A row changes which readings were shown, not the readings,
 * and the held-out check must judge the table on the same rule it was fitted on. A test holds it to the results file.
 */
export const calibrationRow: Hysteresis = Object.freeze({...HYSTERESIS, pulseLostAfterSeconds: 3});

/**
 * The row the held-out check judges at: the shipped `HYSTERESIS`, as the check DECISION 2026-11-05 approved says
 * (results/rba-106-calibration-dev.md, "Proposed held-out check"). calibration.py's `HELDOUT_HYSTERESIS` holds the
 * same, which a test pins.
 */
export const heldoutRow: Hysteresis = HYSTERESIS;

/**
 * @param split The split sampled
 * @returns The row its samples are taken at: on dev the fitted row, which the re-fit must reproduce; held-out, the shipped one
 */
export function sampleRow(split: 'dev' | 'heldout'): Hysteresis {
  return split === 'dev' ? calibrationRow : heldoutRow;
}

/** The detector whose results the samples are built from: the tempogram's sweep record, one trace per track */
export const calibrationDetector = 'tempogram-hysteresis';

/**
 * @param engine An engine
 * @param row A row of its grid
 * @returns The row's index in the engine's sweep grid
 */
export function rowIndex(engine: EngineName, row: Hysteresis): number {
  const index = sweepGrids[engine].findIndex(candidate => hysteresisFields.every(field => candidate[field] === row[field]));
  if (index < 0) {
    throw new Error(`The ${engine} grid has no row ${JSON.stringify(row)}`);
  }

  return index;
}

export type TrackSamples = {
  readonly set: string;
  readonly id: string;
  readonly group: TrackResult['group'];
  readonly label: TrackResult['label'];
  readonly truth: number;
  readonly duration: number;
  readonly statuses: string;
  readonly readings: readonly Sample[];
  readonly offline: Sample;
};

/**
 * @param engine The engine
 * @param results Its sweep results
 * @param row The index of the row in its grid
 * @returns Per track, what a listener was shown at each sample time under that row, and the offline reading
 */
export function samplesOf(engine: EngineName, results: readonly TrackResult[], row: number): TrackSamples[] {
  const shown = pickedSamples(engine, results, row);
  return results.map((result, track) => ({
    set: result.set,
    id: result.id,
    group: result.group,
    label: result.label,
    truth: result.truth,
    duration: result.duration,
    ...shown[track],
    offline: result.hysteresis?.offline ?? null,
  }));
}

/**
 * @param split The split the results come from: calibration.py reads held-out samples only in its held-out mode
 * @param rows Per engine, the row the samples were taken at
 * @param samples Per engine, the samples
 * @param extra Counts that travel with the file, such as the tracks per set and how many were skipped
 * @returns The file, as calibration.py reads it
 */
export function samplesFile(
  split: Split,
  rows: Readonly<Partial<Record<EngineName, Hysteresis>>>,
  samples: Readonly<Partial<Record<EngineName, readonly TrackSamples[]>>>,
  extra: Readonly<Record<string, unknown>> = {},
): string {
  return `${JSON.stringify({format: samplesFormat, split, hysteresis: rows, samples, ...extra})}\n`;
}

/**
 * The calibration study's one held-out calibration check, approved by its decision of 2026-11-05: the tempogram's realtime
 * readings on the held-out halves of the five sets the table was fitted on, no more and no less
 */
export const calibrationLookScope = {
  detectors: [calibrationDetector],
  sets: ['fsld', 'groove', 'guitarset', 'free-mixes', 'free-mixes-contested'],
} as const;

/** Its own log on the data volume, so it spends nothing of the engine study's looks and they spend nothing of it */
export const calibrationLogName = 'calibration-heldout-log.md';

/**
 * @param log The calibration check's log
 * @param isResuming Whether its own progress file says this run is the logged check continuing
 * @param reason Why it runs
 * @param names The detectors asked for
 * @param sets The sets asked for
 * @returns Why the check must not start, or null
 */
export function calibrationLookRefusal(log: string, isResuming: boolean, reason: string, names: readonly string[], sets: readonly string[]): string | null {
  const isSame = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
  if (!isSame(names, calibrationLookScope.detectors) || !isSame(sets, calibrationLookScope.sets)) {
    return `The held-out calibration check is ${calibrationLookScope.detectors.join(', ')} on ${calibrationLookScope.sets.join(', ')}, no more and no less`;
  }

  if (isResuming) {
    return null;
  }

  if (log.split('\n').some(line => line.startsWith('| '))) {
    return 'The held-out calibration check is logged on this volume already: it runs once';
  }

  return reason.trim() === '' ? 'The held-out calibration check needs a reason' : null;
}
