/**
 * One labelled recording of an evaluation set
 */
export type Track = {
  readonly set: string;
  readonly id: string;
  readonly genre: string;
  /** Published global tempo in BPM */
  readonly bpm: number;
  /** Recordings that must stay on the same side of the split: album, recording or progression */
  readonly group: string;
  readonly audioPath: string;
};

export type Split = 'dev' | 'heldout';

/**
 * What a listener got from one detector on one track
 */
export type TrackResult = {
  readonly set: string;
  readonly id: string;
  readonly genre: string;
  readonly truth: number;
  readonly duration: number;
  /** Top candidate of the last `bpm` event, null when the detector never gave a reading */
  readonly final: number | null;
  /** Seconds of audio heard before the first reading */
  readonly firstReadingAt: number | null;
  /** Seconds of audio heard before the first reading within ±4% */
  readonly firstCorrectAt: number | null;
  /** Each `bpmStable` reading as [seconds of audio, top candidate] */
  readonly stable: ReadonlyArray<readonly [number, number]>;
  /** Top candidate of the offline path, on detectors that have one */
  readonly offline?: number | null;
};

export type Summary = {
  readonly tracks: number;
  readonly acc1: number;
  readonly acc2: number;
  /** Over every track: a track never read correctly sorts last, so this reads null past 50% misses */
  readonly medianFirstCorrect: number | null;
  /** Share of tracks read correctly at some point */
  readonly everCorrect: number;
  /** Share of all `bpmStable` readings outside ±4% */
  readonly falseStable: number | null;
  /** Same, keeping only the first `bpmStable` of each track, so chatty tracks do not dominate */
  readonly falseFirstStable: number | null;
  /** Share of tracks with at least one `bpmStable`: a detector that never says stable has no false stables */
  readonly stableCoverage: number;
  readonly stableReadings: number;
  /** Offline path accuracy, when the detector has one */
  readonly offlineAcc1?: number;
  readonly offlineAcc2?: number;
};
