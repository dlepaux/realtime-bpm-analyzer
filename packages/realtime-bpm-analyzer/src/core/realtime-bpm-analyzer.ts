import {findPeaksAtThreshold} from './peak-detection';
import {computeBpm, computeProgress, resolveDetector, resolveTempoRange} from './tempo';
import {assertTempogramMode, createTempogramDetector} from './tempogram';
import type {TempogramDetector} from './tempogram';
import type {
  BpmProgress,
  ProcessorOutputEvent,
  RealTimeBpmAnalyzerOptions,
  RealTimeBpmAnalyzerParameters,
  ValidPeaks,
  NextIndexPeaks,
  BpmCandidates,
  Threshold,
  RealtimeFindPeaksOptions,
  RealtimeAnalyzeChunkOptions,
} from './types';
import {
  generateValidPeaksModel,
  generateNextIndexPeaksModel,
  descendingOverThresholds,
} from './utils';
import * as consts from './consts';

/**
 * Initial value of key parameters of the analyzer
 */
const initialValue = {
  minValidThreshold: () => consts.minValidThreshold,
  validPeaks: () => generateValidPeaksModel(),
  nextIndexPeaks: () => generateNextIndexPeaksModel(),
  skipIndexes: () => 1,
  effectiveBufferTime: () => 0,
};

// Module functions and not private methods: a private member makes a class nominal, and 5.4.0's had none,
// so a typed stand-in for it would stop compiling. The published declarations stay as 5.4.0 shaped them.

/**
 * How close the analyzer is to its first reading. The tempogram waits for audio rather than for
 * peaks, so it reports its share of the warm-up on the same scale.
 * @param analyzer - The analyzer
 * @returns The progress event's data
 */
function currentProgress(analyzer: RealTimeBpmAnalyzer): BpmProgress {
  if (analyzer.options.detector === 'tempogram') {
    return {
      peaks: Math.floor((analyzer.tempogram?.progress() ?? 0) * consts.requiredPeaks),
      requiredPeaks: consts.requiredPeaks,
    };
  }

  return computeProgress(analyzer.validPeaks);
}

/**
 * Run the amplitude-peak detector on one chunk
 * @param analyzer - The analyzer
 * @param options - RealtimeAnalyzeChunkOptions
 * @param options.audioSampleRate - Audio sample rate
 * @param options.channelData - Channel data
 * @param options.bufferSize - Buffer size
 * @param options.postMessage - Function to post a message to the processor node
 */
async function readPeaks(analyzer: RealTimeBpmAnalyzer, {
  audioSampleRate,
  channelData,
  bufferSize,
  postMessage,
}: RealtimeAnalyzeChunkOptions): Promise<void> {
  /**
   * Compute the maximum index with all previous chunks
   */
  const currentMaxIndex = bufferSize * analyzer.skipIndexes;

  /**
   * Compute the minimum index with all previous chunks
   */
  const currentMinIndex = currentMaxIndex - bufferSize;

  /**
   * Mutate nextIndexPeaks and validPeaks if possible
   */
  await analyzer.findPeaks({
    audioSampleRate,
    channelData,
    bufferSize,
    currentMinIndex,
    currentMaxIndex,
    postMessage,
  });

  /**
   * Increment chunk
   */
  analyzer.skipIndexes++;

  // Before bpm, so the chunk that yields the first tempo also reports a full progress
  postMessage({type: 'progress', data: computeProgress(analyzer.validPeaks)});

  const data: BpmCandidates = await computeBpm({
    audioSampleRate,
    data: analyzer.validPeaks,
    tempoRange: analyzer.options.tempoRange,
  });
  const {threshold} = data;
  postMessage({type: 'bpm', data});

  /**
   * If the results found have a "high" threshold, the BPM is considered stable/strong
   */
  if (analyzer.minValidThreshold < threshold) {
    postMessage({type: 'bpmStable', data});
    await analyzer.clearValidPeaks(threshold);
  }
}

/**
 * Run the tempogram detector on one chunk. It reads every `updateSeconds`, not on every chunk,
 * and has no peak threshold: `threshold` stays 0.
 * @param analyzer - The analyzer
 * @param audioSampleRate - Audio sample rate
 * @param channelData - Channel data
 * @param postMessage - Function to post a message to the processor node
 */
function readTempogram(
  analyzer: RealTimeBpmAnalyzer,
  audioSampleRate: number,
  channelData: Float32Array,
  postMessage: (data: ProcessorOutputEvent) => void,
): void {
  analyzer.tempogram ??= createTempogramDetector({sampleRate: audioSampleRate, tempoRange: analyzer.options.tempoRange});

  const reading = analyzer.tempogram.process(channelData);

  postMessage({type: 'progress', data: currentProgress(analyzer)});

  if (reading === null) {
    return;
  }

  const data: BpmCandidates = {bpm: reading.candidates, threshold: 0};

  postMessage({type: 'bpm', data});

  if (reading.isNewlyStable) {
    postMessage({type: 'bpmStable', data});
  }
}

/**
 * Core analyzer class for real-time BPM detection.
 *
 * This class manages the state and logic for analyzing audio chunks in real-time
 * to detect beats per minute. It's used internally by the AudioWorklet processor.
 *
 * @remarks
 * Most users should use {@link createRealtimeBpmAnalyzer} instead of instantiating
 * this class directly. This class is primarily for internal use or advanced scenarios.
 *
 * @deprecated This class is an internal implementation detail and will be removed
 * in a future major release. Use {@link createRealtimeBpmAnalyzer} instead.
 *
 * @group Classes
 */
export class RealTimeBpmAnalyzer {
  /**
   * Default configuration
   */
  options: RealTimeBpmAnalyzerOptions = {
    continuousAnalysis: false,
    stabilizationTime: consts.defaultStabilizationTime,
    muteTimeInIndexes: consts.defaultMuteTimeInIndexes,
    debug: false,
    tempoRange: resolveTempoRange(),
    detector: 'peaks',
  };

  /**
   * Minimum valid threshold, below this level result would be irrelevant.
   */
  minValidThreshold: Threshold = initialValue.minValidThreshold();
  /**
   * Contain all valid peaks
   */
  validPeaks: ValidPeaks = initialValue.validPeaks();
  /**
   * Next index (+muteTimeInIndexes samples, see consts.defaultMuteTimeInIndexes) to take care about peaks
   */
  nextIndexPeaks: NextIndexPeaks = initialValue.nextIndexPeaks();
  /**
   * Number / Position of chunks
   */
  skipIndexes: number = initialValue.skipIndexes();
  effectiveBufferTime: number = initialValue.effectiveBufferTime();
  /**
   * Computed values
   */
  computedStabilizationTimeInSeconds = 0;
  /**
   * Created on the first chunk, the first time the sample rate is known
   */
  tempogram?: TempogramDetector;
  constructor(options: RealTimeBpmAnalyzerParameters = {}) {
    Object.assign(this.options, options);
    this.options.tempoRange = resolveTempoRange(options.tempoRange);
    this.options.detector = resolveDetector(options.detector);
    assertTempogramMode(options);
    this.updateComputedValues();
  }

  /**
   * Update the computed values
   */
  updateComputedValues() {
    this.computedStabilizationTimeInSeconds
      = this.options.stabilizationTime / 1000;
  }

  /**
   * Reset BPM computation properties to get a fresh start
   */
  reset(): void {
    this.minValidThreshold = initialValue.minValidThreshold();
    this.validPeaks = initialValue.validPeaks();
    this.nextIndexPeaks = initialValue.nextIndexPeaks();
    this.skipIndexes = initialValue.skipIndexes();
    this.effectiveBufferTime = initialValue.effectiveBufferTime();
    this.tempogram?.reset();
  }

  /**
   * Remve all validPeaks between the minThreshold pass in param to optimize the weight of datas
   * @param minThreshold - Value between 0.9 and 0.2
   */
  async clearValidPeaks(minThreshold: Threshold): Promise<void> {
    this.minValidThreshold = minThreshold;

    await descendingOverThresholds(async threshold => {
      if (
        threshold < minThreshold
        && this.validPeaks[threshold] !== undefined
      ) {
        delete this.validPeaks[threshold];  
        delete this.nextIndexPeaks[threshold];  
      }

      return false;
    });
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @param options - RealtimeAnalyzeChunkOptions
   * @param options.audioSampleRate - Audio sample rate (44100)
   * @param options.channelData - Channel data
   * @param options.bufferSize - Buffer size (4096)
   * @param options.postMessage - Function to post a message to the processor node
   */
  async analyzeChunk({
    audioSampleRate,
    channelData,
    bufferSize,
    postMessage,
  }: RealtimeAnalyzeChunkOptions): Promise<void> {
    if (this.options.debug) {
      postMessage({type: 'analyzeChunk', data: channelData});
    }

    /**
     * We are summing up the size of each analyzed chunks in order to compute later if we reached the stabilizationTime
     * Ex: effectiveBufferTime / audioSampleRate = timeInSeconds (1000000/44100=22s)
     */
    this.effectiveBufferTime += bufferSize;

    if (this.options.detector === 'tempogram') {
      readTempogram(this, audioSampleRate, channelData, postMessage);
    } else {
      await readPeaks(this, {audioSampleRate, channelData, bufferSize, postMessage});
    }

    /**
     * After x time, we reinit the analyzer
     */
    if (
      this.options.continuousAnalysis
      && this.effectiveBufferTime / audioSampleRate
        > this.computedStabilizationTimeInSeconds
    ) {
      this.reset();
      postMessage({type: 'analyzerReset'});
      postMessage({type: 'progress', data: currentProgress(this)});
    }
  }

  /**
   * Find the best threshold with enought peaks
   * @param options - Options for finding peaks
   * @param options.audioSampleRate - Sample rate
   * @param options.channelData - Channel data
   * @param options.bufferSize - Buffer size
   * @param options.currentMinIndex - Current minimum index
   * @param options.currentMaxIndex - Current maximum index
   * @param options.postMessage - Function to post a message to the processor node
   */
  async findPeaks({
    audioSampleRate,
    channelData,
    bufferSize,
    currentMinIndex,
    currentMaxIndex,
    postMessage,
  }: RealtimeFindPeaksOptions): Promise<void> {
    await descendingOverThresholds(async threshold => {
      if (this.nextIndexPeaks[threshold] >= currentMaxIndex) {
        return false;
      }

      // Resume scanning at the offset that corresponds to nextIndexPeaks within
      // the current chunk. When nextIndexPeaks lies before the chunk (the mute
      // zone of a prior peak ended in a previous chunk), start from offset 0.
      // `currentMinIndex` is always a multiple of bufferSize, so for positions
      // inside the chunk this is equivalent to `nextIndexPeaks % bufferSize`.
      const offsetForNextPeak = Math.max(
        0,
        this.nextIndexPeaks[threshold] - currentMinIndex,
      );

      const {peaks, threshold: atThreshold} = findPeaksAtThreshold({
        audioSampleRate,
        data: channelData,
        threshold,
        offset: offsetForNextPeak,
      });

      /**
       * Loop over peaks
       */
      if (peaks.length === 0) {
        return false;
      }

      for (const relativeChunkPeak of peaks) {
        const index = currentMinIndex + relativeChunkPeak;

        /**
         * Add current Index + muteTimeInIndexes (default 10_000 / 44_100 Hz ≈ 0.22s)
         */
        this.nextIndexPeaks[atThreshold]
          = index + this.options.muteTimeInIndexes;

        /**
         * Store valid relativeChunkPeak Indexes
         */
        this.validPeaks[atThreshold].push(index);

        if (this.options.debug) {
          postMessage({
            type: 'validPeak',
            data: {
              threshold: atThreshold,
              index,
            },
          });
        }
      }

      return false;
    }, this.minValidThreshold);
  }
}
