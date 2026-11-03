import {findPeaksAtThreshold} from './peak-detection';
import {computeBpm, computeProgress} from './tempo';
import type {NextIndexPeaks, TempoRange, ValidPeaks} from './types';
import type {EngineStep} from './engine';
import {
  generateValidPeaksModel,
  generateNextIndexPeaksModel,
  descendingOverThresholds,
} from './utils';
import * as consts from './consts';

export type PeaksEngineOptions = {
  readonly tempoRange: TempoRange;
  /** Seconds after which the session restarts the engine, which cuts the lock warm-up to fit before it */
  readonly restartAfterSeconds?: number;
  readonly debug?: boolean;
};

/**
 * The amplitude-peaks engine of the realtime analyzer: peaks above a ladder of thresholds on the lowpassed
 * signal, and the intervals between them. Internal, and a class because its peak lists are one mutable state
 * that every chunk extends.
 *
 * Its lock rule is its own (RBA-107): 10 s of audio heard, then a threshold rung fuller than the one it last
 * locked on. After a lost pulse the rung it locked on may offer again, or a breakdown would end its locks.
 */
export class PeaksEngine {
  readonly options: PeaksEngineOptions;
  /** Rungs under this are dropped: raised to each rung a lock is offered on */
  minValidThreshold = consts.minValidThreshold;
  validPeaks: ValidPeaks = generateValidPeaksModel();
  nextIndexPeaks: NextIndexPeaks = generateNextIndexPeaksModel();
  /** Number of the next chunk, from 1 */
  skipIndexes = 1;
  /** Samples analysed since the engine started */
  effectiveBufferTime = 0;
  /** Set by a lost pulse: the next lock may come from the rung of the last one */
  mayRelockAtFloor = false;

  constructor(options: PeaksEngineOptions) {
    this.options = options;
  }

  reset(): void {
    this.minValidThreshold = consts.minValidThreshold;
    this.validPeaks = generateValidPeaksModel();
    this.nextIndexPeaks = generateNextIndexPeaksModel();
    this.skipIndexes = 1;
    this.effectiveBufferTime = 0;
    this.mayRelockAtFloor = false;
  }

  onReadingLost(): void {
    this.mayRelockAtFloor = true;
  }

  /** Seconds of audio heard before a lock is offered: cut to the restart period, or the restart would come first */
  stableWarmUpSeconds(): number {
    const {restartAfterSeconds} = this.options;
    return restartAfterSeconds === undefined
      ? consts.stableWarmUpSeconds
      : Math.min(consts.stableWarmUpSeconds, restartAfterSeconds);
  }

  /**
   * Drops the rungs under `minThreshold`, to bound the work, and makes it the floor
   * @param minThreshold A rung of the ladder
   */
  async clearValidPeaks(minThreshold: number): Promise<void> {
    this.minValidThreshold = minThreshold;

    await descendingOverThresholds(async threshold => {
      if (threshold < minThreshold && this.validPeaks[threshold] !== undefined) {
        delete this.validPeaks[threshold];
        delete this.nextIndexPeaks[threshold];
      }

      return false;
    });
  }

  /**
   * Analyses one buffer of lowpassed samples
   * @param channelData The buffer
   * @param bufferSize Samples in it
   * @param sampleRate Sample rate in Hz
   * @returns What this step measured
   */
  async analyze(channelData: Float32Array, bufferSize: number, sampleRate: number): Promise<EngineStep> {
    this.effectiveBufferTime += bufferSize;
    const currentMaxIndex = bufferSize * this.skipIndexes;
    const debugPeaks = await this.findPeaks({sampleRate, channelData, currentMinIndex: currentMaxIndex - bufferSize, currentMaxIndex});
    this.skipIndexes++;

    const fraction = computeProgress(this.validPeaks);
    const {bpm: candidates, threshold} = await computeBpm({audioSampleRate: sampleRate, data: this.validPeaks, tempoRange: this.options.tempoRange});
    const heard = this.effectiveBufferTime / sampleRate >= this.stableWarmUpSeconds();
    const fuller = threshold > this.minValidThreshold || (this.mayRelockAtFloor && threshold === this.minValidThreshold);
    const lockOffered = candidates.length > 0 && heard && fuller;

    if (lockOffered) {
      this.mayRelockAtFloor = false;
      await this.clearValidPeaks(threshold);
    }

    const firstPeak = candidates.length > 0 ? this.validPeaks[threshold]?.[0] ?? 0 : 0;

    return {
      fresh: true,
      candidates,
      from: firstPeak / sampleRate,
      pulse: hasPulse(channelData, bufferSize),
      lockOffered,
      progress: fraction,
      debug: this.options.debug ? {threshold, floor: this.minValidThreshold, newPeaks: debugPeaks} : undefined,
    };
  }

  /**
   * Finds this chunk's peaks on every rung from the top down to the floor, after each rung's mute window
   * @returns The peaks found, as sample indexes since the engine started, when debug is on
   */
  async findPeaks({sampleRate, channelData, currentMinIndex, currentMaxIndex}: {
    sampleRate: number;
    channelData: Float32Array;
    currentMinIndex: number;
    currentMaxIndex: number;
  }): Promise<Array<{threshold: number; index: number}>> {
    const found: Array<{threshold: number; index: number}> = [];

    await descendingOverThresholds(async threshold => {
      if (this.nextIndexPeaks[threshold] >= currentMaxIndex) {
        return false;
      }

      // Resume at nextIndexPeaks within this chunk, or at its start when the mute window ended before it
      const offset = Math.max(0, this.nextIndexPeaks[threshold] - currentMinIndex);
      const {peaks, threshold: atThreshold} = findPeaksAtThreshold({audioSampleRate: sampleRate, data: channelData, threshold, offset});

      for (const relativeChunkPeak of peaks) {
        const index = currentMinIndex + relativeChunkPeak;
        this.nextIndexPeaks[atThreshold] = index + consts.defaultMuteTimeInIndexes;
        this.validPeaks[atThreshold].push(index);
        if (this.options.debug) {
          found.push({threshold: atThreshold, index});
        }
      }

      // Bounds memory and the per-chunk work, which re-reads every kept peak: the oldest go first (RBA-107)
      const kept = this.validPeaks[atThreshold];
      if (kept.length > consts.maxKeptPeaks) {
        kept.splice(0, kept.length - consts.maxKeptPeaks);
      }

      return false;
    }, this.minValidThreshold);

    return found;
  }
}

/**
 * Whether the buffer holds anything the lowest rung could count as a peak. Engine-neutral in meaning: no beat
 * can be heard in it, as for the tempogram's frame without salience.
 * @param channelData The lowpassed buffer
 * @param bufferSize Samples to read
 * @returns True when a sample rises over the lowest threshold
 */
function hasPulse(channelData: Float32Array, bufferSize: number): boolean {
  const end = Math.min(bufferSize, channelData.length);
  for (let i = 0; i < end; i++) {
    if (channelData[i] > consts.minValidThreshold) {
      return true;
    }
  }

  return false;
}
