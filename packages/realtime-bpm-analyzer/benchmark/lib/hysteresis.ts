import {HYSTERESIS} from '../../src/contract/types';
import type {EngineName, Hysteresis} from '../../src/contract/types';
import {calibrate} from '../../src/core/calibration';
import {detectTempo} from '../../src/core/detect-tempo';
import {toReading} from '../../src/core/engine';
import {applyLowpass} from '../../src/core/lowpass';
import {resolveTempoRange} from '../../src/core/tempo';
import {detectTempogram} from '../../src/core/tempogram';
import {isCorrect} from './metrics';
import {debugCandidates, offersOf, rawScore, streamPcm, traceEngine, visitReplay} from './stream';
import type {EngineTraceStep, Observation} from './stream';
import type {Track, TrackResult} from './types';

/**
 * RBA-106's hysteresis sweep on dev. Each track runs once per grid row, and what a listener of the main thread
 * would have seen is scored: when the state first locked, how long it stayed locked on a wrong tempo, how often a
 * lock fell back to settling. The readings at fixed audio times are kept as well, for the calibration that follows.
 */

export type HysteresisField = keyof Hysteresis;

export const hysteresisFields: readonly HysteresisField[] = ['lockBand', 'lockAfterSeconds', 'unlockBand', 'unlockAfterSeconds', 'pulseLostAfterSeconds'];

/** The values swept for each field. The contract's value sits inside each axis, so a pick at an edge is visible */
export type Axes = Readonly<Record<HysteresisField, readonly number[]>>;

/**
 * Each axis has at least two values inside it, so that an interior pick is a choice and not the contract's value by
 * construction. The tempogram's rows are replays of one engine run per track (`offersOf`, `visitReplay`), so its
 * grid is the full product.
 */
export const tempogramAxes: Axes = {
  lockBand: [0.01, 0.015, 0.02, 0.03, 0.04],
  lockAfterSeconds: [4, 6, 8, 10, 12],
  unlockBand: [0.03, 0.04, 0.06, 0.08],
  unlockAfterSeconds: [1, 2, 3, 5],
  pulseLostAfterSeconds: [1, 2, 3, 5],
};

/**
 * Peaks keeps its own lock rule (RBA-107), so the lock fields do not reach it and stay at the contract's. Its rows
 * are run through the real session, one at a time, as its `onReadingLost` feeds the tracker back into the engine:
 * so the grid moves one field at a time around the contract's values, which keeps the job to hours.
 */
export const peaksAxes: Axes = {
  lockBand: [HYSTERESIS.lockBand],
  lockAfterSeconds: [HYSTERESIS.lockAfterSeconds],
  unlockBand: [0.03, 0.04, 0.06, 0.08],
  unlockAfterSeconds: [1, 2, 3, 5],
  pulseLostAfterSeconds: [1, 2, 3, 5],
};

/**
 * @param axes The values per field
 * @returns Every combination where unlocking needs more than locking (`unlockBand` above `lockBand`), lock fields
 * outermost so that rows sharing an engine run are neighbours
 */
export function factorialGrid(axes: Axes): Hysteresis[] {
  const rows: Hysteresis[] = [];

  for (const lockBand of axes.lockBand) {
    for (const lockAfterSeconds of axes.lockAfterSeconds) {
      for (const unlockBand of axes.unlockBand.filter(band => band > lockBand)) {
        for (const unlockAfterSeconds of axes.unlockAfterSeconds) {
          for (const pulseLostAfterSeconds of axes.pulseLostAfterSeconds) {
            rows.push({lockBand, lockAfterSeconds, unlockBand, unlockAfterSeconds, pulseLostAfterSeconds});
          }
        }
      }
    }
  }

  return rows;
}

/**
 * @param axes The values per field
 * @param base The row every other moves one field away from
 * @returns The base first, then each other value of each field, alone
 */
export function oneAtATimeGrid(axes: Axes, base: Hysteresis): Hysteresis[] {
  const rows: Hysteresis[] = [{...base}];

  for (const field of hysteresisFields) {
    for (const value of axes[field].filter(value => value !== base[field])) {
      rows.push({...base, [field]: value});
    }
  }

  return rows;
}

export const sweepGrids: Readonly<Record<EngineName, readonly Hysteresis[]>> = {
  tempogram: factorialGrid(tempogramAxes),
  peaks: oneAtATimeGrid(peaksAxes, HYSTERESIS),
};

export const sweepAxes: Readonly<Record<EngineName, Axes>> = {tempogram: tempogramAxes, peaks: peaksAxes};

/**
 * Audio times the readings are sampled at, plus the end of the track: the same few per track, so that long tracks
 * do not weigh more, and early readings, which a listener sees first, are represented
 */
export const sampleSeconds: readonly number[] = [10, 15, 20, 30, 45];

/**
 * One row's score on one track:
 * first lock at (seconds, -1 for none), whether that first lock was right (1 or 0), seconds locked, seconds locked on
 * a wrong tempo, moves from locked to settling, moves from locked to listening, and the status at each sample time
 * and at the end (0 listening, 1 settling, 2 locked), as digits
 */
export type SweepRow = readonly [number, number, number, number, number, number, string];

/**
 * A reading shown at a sample time, as [bpm, confidence, raw], or null when the state was listening there. The
 * confidence is the calibrated one the reading carried, null outside the measured tempo range (RBA-147); the raw
 * score is what the calibration maps (RBA-148), so a fit can read it there too
 */
export type Sample = readonly [number, number | null, number] | null;

/**
 * The tempogram's fresh steps, one array per field: seconds, top tempo (0 for none), emitted confidence (0 for
 * none, null when unmeasured), raw score (0 for none), the frame's own tempo, and flags (1 a pulse, 2 the frame leads, 4 the engine
 * offered a lock)
 */
export type CompactTrace = {
  readonly now: readonly number[];
  readonly bpm: readonly number[];
  readonly confidence: ReadonlyArray<number | null>;
  /** Missing in traces written before RBA-148, which `expandTrace` refuses */
  readonly raw: readonly number[];
  readonly frameTempo: readonly number[];
  readonly flags: readonly number[];
};

export type HysteresisRecord =
  /** The tempogram's trace: every row is replayed from it at the pick, so no row is stored */
  | {readonly engine: 'tempogram'; readonly trace: CompactTrace; readonly offline: Sample}
  | {
    readonly engine: 'peaks';
    /** In the order of `sweepGrids.peaks` */
    readonly rows: readonly SweepRow[];
    /** Per row, the reading last shown at each sample time and at the end, whatever the status: its digit says whether it was shown */
    readonly readings: ReadonlyArray<readonly Sample[]>;
    readonly offline: Sample;
  };

/** An observation with the confidence of the reading it showed, and the raw score that confidence maps */
type ScoredObservation = Observation & {readonly confidence: number | null; readonly raw: number | null};

const statusDigit = {listening: '0', settling: '1', locked: '2'} as const;

/**
 * Scores one row on one track as its observations arrive, so that a replay need not keep them
 * @param truth The label
 * @returns `add` for each observation in order, then `finish` with the seconds of audio
 */
export function rowScorer(truth: number): {add: (observation: Observation) => void; finish: (duration: number) => SweepRow} {
  let firstLockAt = -1;
  let firstLockRight = 0;
  let locked = 0;
  let lockedWrong = 0;
  let unlocks = 0;
  let losses = 0;
  let shown: number | null = null;
  let previous: {now: number; status: Observation['status']} = {now: 0, status: 'listening'};
  // The sample times this scorer has seen, as digits, and how far it got: the end is added by `finish`
  let statuses = '';

  const close = (until: number) => {
    if (previous.status === 'locked') {
      locked += until - previous.now;
      lockedWrong += shown === null || !isCorrect(shown, truth) ? until - previous.now : 0;
    }
  };

  const add = (observation: Observation) => {
    while (statuses.length < sampleSeconds.length && sampleSeconds[statuses.length] < observation.now) {
      statuses += statusDigit[previous.status];
    }

    close(observation.now);
    unlocks += previous.status === 'locked' && observation.status === 'settling' ? 1 : 0;
    losses += previous.status === 'locked' && observation.status === 'listening' ? 1 : 0;
    shown = observation.status === 'listening' ? null : observation.bpm ?? shown;
    if (observation.status === 'locked' && firstLockAt < 0) {
      firstLockAt = observation.now;
      firstLockRight = shown !== null && isCorrect(shown, truth) ? 1 : 0;
    }

    previous = observation;
  };

  const finish = (duration: number): SweepRow => {
    close(Math.max(duration, previous.now));
    const inside = sampleSeconds.filter(seconds => seconds < duration).length;
    const seen = statuses.slice(0, inside);
    const last = statusDigit[previous.status];
    return [firstLockAt, firstLockRight, locked, lockedWrong, unlocks, losses, `${seen}${last.repeat(inside - seen.length)}${last}`];
  };

  return {add, finish};
}

/**
 * @param observations One row's observations, in order
 * @param truth The label
 * @param duration Seconds of audio
 * @returns The row's score
 */
export function scoreRow(observations: readonly Observation[], truth: number, duration: number): SweepRow {
  const scorer = rowScorer(truth);
  for (const observation of observations) {
    scorer.add(observation);
  }

  return scorer.finish(duration);
}

/**
 * One tempogram row on one track, replayed and scored
 * @param steps The track's steps
 * @param row The row
 * @param offers The lock offers of the row's lock fields (`offersOf`)
 * @param truth The label
 * @param duration Seconds of audio
 * @returns The row's score
 */
export function scoreReplay(steps: readonly EngineTraceStep[], row: Hysteresis, offers: readonly boolean[], truth: number, duration: number): SweepRow {
  const scorer = rowScorer(truth);
  visitReplay(steps, row, offers, scorer.add);
  return scorer.finish(duration);
}

/** `findLast`, which the library's ES2022 target lacks */
function lastWhere<T>(items: readonly T[], test: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (test(items[i])) {
      return items[i];
    }
  }

  return undefined;
}

/** Sample times that fall inside the track, then its end */
function timesOf(duration: number): number[] {
  return [...sampleSeconds.filter(seconds => seconds < duration), duration];
}

/**
 * @param points Steps or observations, in order, with the reading each showed (null for none)
 * @param duration Seconds of audio
 * @returns The latest reading at or before each sample time and the end, null before the first
 */
export function readingsAt(
  points: ReadonlyArray<{readonly now: number; readonly bpm: number | null; readonly confidence: number | null; readonly raw: number | null}>,
  duration: number,
): Sample[] {
  return timesOf(duration).map(time => {
    const last = lastWhere(points, ({now, bpm}) => now <= time && bpm !== null);
    // A null confidence is a reading outside the measured range, not a missing one: it keeps its raw score
    return last === undefined || last.bpm === null || last.raw === null
      ? null
      : [last.bpm, last.confidence, last.raw] as const;
  });
}

/** Six decimals: the dev samples the committed tables were fitted on held the score rounded so */
const rounded = (value: number | null): number => (value === null ? 0 : Math.round(value * 1e6) / 1e6);

/**
 * @param steps The tempogram's steps
 * @returns The same, in the record's compact form
 */
export function compactTrace(steps: readonly EngineTraceStep[]): CompactTrace {
  return {
    now: steps.map(({now}) => now),
    bpm: steps.map(({bpm}) => bpm ?? 0),
    // Null stays null: a 0 would read as a calibrated confidence (RBA-147)
    confidence: steps.map(({bpm, confidence}) => (bpm !== null && confidence === null ? null : rounded(confidence))),
    raw: steps.map(({raw}) => rounded(raw)),
    frameTempo: steps.map(({frameTempo}) => frameTempo),
    flags: steps.map(({pulse, leads, lockOffered}) => (pulse ? 1 : 0) + (leads ? 2 : 0) + (lockOffered ? 4 : 0)),
  };
}

/**
 * @param trace A record's trace
 * @returns Its steps
 */
export function expandTrace(trace: CompactTrace): EngineTraceStep[] {
  // Its confidence was raw before e70a4f5 and calibrated after, and the file does not say which: run dev again
  if (!Array.isArray(trace.raw)) {
    throw new Error('This trace was written before RBA-148 and holds no raw score: score dev again with this harness');
  }

  return trace.now.map((now, i) => ({
    now,
    bpm: trace.bpm[i] === 0 ? null : trace.bpm[i],
    confidence: trace.bpm[i] === 0 ? null : trace.confidence[i],
    raw: trace.bpm[i] === 0 ? null : trace.raw[i],
    pulse: (trace.flags[i] & 1) !== 0,
    leads: (trace.flags[i] & 2) !== 0,
    lockOffered: (trace.flags[i] & 4) !== 0,
    frameTempo: trace.frameTempo[i],
  }));
}

/**
 * @param pcm The lowpassed samples peaks listens to
 * @param sampleRate Their rate
 * @param row The hysteresis to run with
 * @returns What the main thread saw on each step message, through the real session
 */
async function observePeaks(pcm: Float32Array, sampleRate: number, row: Hysteresis): Promise<ScoredObservation[]> {
  const observations: ScoredObservation[] = [];
  // The session sends a step's debug detail just before the step itself, so this is the score of the next reading
  let raw: number | null = null;

  await streamPcm(pcm, sampleRate, {engine: 'peaks'}, (message, heard) => {
    if (message.type === 'debug') {
      raw = rawScore(debugCandidates(message.data));
      return;
    }

    if (message.type !== 'step') {
      return;
    }

    const reading = message.status === 'listening' ? null : message.reading;
    observations.push({
      now: heard,
      status: message.status,
      bpm: reading?.bpm ?? null,
      confidence: reading?.confidence ?? null,
      raw: reading === null ? null : rawOf(reading.bpm, reading.confidence, raw),
      ...(message.reason === undefined ? {} : {reason: message.reason}),
    });
  }, undefined, row, true);

  return observations;
}

/**
 * @param bpm A reading's tempo
 * @param confidence Its calibrated confidence, null when unmeasured
 * @param raw The raw score recorded for it
 * @returns The raw score, once it is the one that confidence maps: a recorded score that is not would make a re-fit wrong
 */
function rawOf(bpm: number, confidence: number | null, raw: number | null): number {
  if (raw === null || calibrate('peaks', raw, bpm) !== confidence) {
    throw new Error(`peaks: the raw score ${raw} does not map to the reading's confidence ${confidence} at ${bpm} BPM`);
  }

  return raw;
}

/**
 * The offline reading, with its raw score: the same detection and the same `toReading` as `analyzeSamples` with
 * only the engine named, which a test holds, so the score is the one the reading's confidence maps
 * @param raw Mono samples, not lowpassed
 * @param sampleRate Their rate
 * @param engine The engine
 * @returns The reading, or null when there is none
 */
export async function offlineSample(raw: Float32Array, sampleRate: number, engine: EngineName): Promise<Sample> {
  const tempoRange = resolveTempoRange(undefined);
  const tempos = engine === 'tempogram'
    ? detectTempogram(raw, sampleRate, tempoRange)
    : await detectTempo(applyLowpass(raw, sampleRate, {}), sampleRate, tempoRange);
  const reading = toReading(tempos, {from: 0, to: raw.length / sampleRate, contextTime: null}, engine);
  const score = rawScore(tempos);
  return reading === null || score === null ? null : [reading.bpm, reading.confidence, score];
}

async function sweepPeaks(raw: Float32Array, sampleRate: number, truth: number, duration: number): Promise<{rows: SweepRow[]; readings: Sample[][]}> {
  const pcm = applyLowpass(raw, sampleRate);
  const rows: SweepRow[] = [];
  const readings: Sample[][] = [];

  for (const row of sweepGrids.peaks) {
    const observations = await observePeaks(pcm, sampleRate, row);
    rows.push(scoreRow(observations, truth, duration));
    readings.push(readingsAt(observations, duration));
  }

  return {rows, readings};
}

/**
 * Sweeps one track through every row of an engine's grid, then its offline path
 * @param track The track and its label
 * @param raw Mono samples, not lowpassed: peaks filters them as the realtime guides wire it
 * @param sampleRate Sample rate in Hz
 * @param engine The engine swept
 * @returns The track's result, its 5.x-style fields from the contract's row, and the sweep's record
 */
export async function sweepTrack(track: Track, raw: Float32Array, sampleRate: number, engine: EngineName): Promise<TrackResult> {
  const duration = raw.length / sampleRate;
  const offline = await offlineSample(raw, sampleRate, engine);
  let record: HysteresisRecord;
  let final: number | null;

  if (engine === 'tempogram') {
    const steps = await traceEngine(raw, sampleRate, {engine: 'tempogram'});
    // The replayed stable rule must be the engine's own on every track, or no other lock row can be trusted
    const replayed = offersOf(steps, HYSTERESIS.lockBand, HYSTERESIS.lockAfterSeconds);
    const differs = steps.findIndex((step, i) => step.lockOffered !== replayed[i]);
    if (differs >= 0) {
      throw new Error(`${track.set}/${track.id}: the replayed stable rule differs from the engine's at ${steps[differs].now} s`);
    }

    record = {engine, trace: compactTrace(steps), offline};
    final = readingsAt(steps, duration).at(-1)?.[0] ?? null;
  } else {
    const {rows, readings} = await sweepPeaks(raw, sampleRate, track.bpm, duration);
    record = {engine, rows, readings, offline};
    final = readings[baseRowIndex('peaks')].at(-1)?.[0] ?? null;
  }

  return {
    set: track.set,
    id: track.id,
    genre: track.genre,
    group: track.group,
    ...(track.label === undefined ? {} : {label: track.label}),
    truth: track.bpm,
    duration,
    final,
    // The sweep's record holds the locks: these 5.x-style fields are left empty
    firstReadingAt: null,
    firstCorrectAt: null,
    stable: [],
    offline: offline?.[0] ?? null,
    hysteresis: record,
  };
}

/**
 * @param engine An engine
 * @returns Where the contract's values sit in its grid
 */
export function baseRowIndex(engine: EngineName): number {
  const index = sweepGrids[engine].findIndex(row => hysteresisFields.every(field => row[field] === HYSTERESIS[field]));
  if (index < 0) {
    throw new Error(`The ${engine} grid does not hold the contract's hysteresis`);
  }

  return index;
}
