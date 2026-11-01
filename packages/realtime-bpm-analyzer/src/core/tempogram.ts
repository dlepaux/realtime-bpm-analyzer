import {resolveTempoRange} from './tempo';
import type {RealTimeBpmAnalyzerParameters, Tempo, TempoRange} from './types';

/**
 * Knobs of the tempogram detector. Values are tuned on the benchmark's dev split only, see
 * benchmark/readme.md. Sources, all read rather than recalled:
 * - Grosche & Müller 2009, "A mid-level representation for capturing dominant tempo and pulse
 *   information in music recordings": log(1 + C·|X|) with C = 1000, band-wise novelty on 5 bands,
 *   subtracting the local average and half-wave rectifying.
 * - Percival & Tzanetakis 2014, "Streamlined tempo estimation based on autocorrelation and
 *   cross-correlation with pulses": a window of about 6 s updated about every 0.37 s, summing an
 *   autocorrelation with its stretched copies to favour the fundamental, accumulating over time.
 * - Ellis 2007, "Beat tracking by dynamic programming": the log-Gaussian tempo prior,
 *   w(τ) = exp(-½(log2(τ/τ0)/σ)²), which replaces folding into a fixed octave.
 */
export type TempogramTuning = {
  /** Rate of the onset strength signal, in Hz */
  readonly frameRate: number;
  /** Band edges in Hz, one novelty curve per adjacent pair */
  readonly bands: readonly number[];
  /** C of the logarithmic compression */
  readonly compression: number;
  /** Time constant of the local average subtracted from the novelty, in seconds */
  readonly localMeanSeconds: number;
  /** Longest window of onset strength a tempogram frame sees, in seconds */
  readonly windowSeconds: number;
  /** First reading once this much audio was heard, in seconds */
  readonly warmupSeconds: number;
  /** Seconds between tempogram frames */
  readonly updateSeconds: number;
  /** Beat multiples the comb reads, weighted equally: decaying teeth lost half-time ties on dev */
  readonly combBeats: number;
  /** Half-life of the tempo accumulator, in seconds: lower follows a tempo change sooner */
  readonly halfLifeSeconds: number;
  /**
   * How much pulses halfway between a tempo's beats count against it: those beats are too slow.
   * Off: at 0.25 the best dev score fell from 81.0 to 72.8, and further from there.
   */
  readonly halfBeatPenalty: number;
  /** The same for pulses a third of the way through its beats */
  readonly thirdBeatPenalty: number;
  /**
   * Centre of the tempo prior, in BPM. A clean pulse T and its half T/2 tie at T/√2 = this, so on a
   * range that holds both, a pulse above that tie reads at half: why the range is part of the settings.
   */
  readonly priorBpm: number;
  /** Width of the tempo prior, in octaves */
  readonly priorOctaves: number;
  /** Agreement window of "stable", in seconds */
  readonly stableSeconds: number;
  /** Share of the frames in that window whose own best tempo must agree with the reading */
  readonly stableAgreement: number;
  /** Tempos closer than this ratio agree */
  readonly stableTolerance: number;
  /** Salience below which a reading is never called stable */
  readonly stableSalience: number;
  /** How far the top candidate must lead the next one to be called stable */
  readonly stableMargin: number;
  /** Salience below which there is no reading at all: silence, noise, no pulse */
  readonly readingSalience: number;
};

/**
 * The settings RBA-51 locked on 2026-10-31 and checked once on held-out data, the only ones a caller can
 * get: no public option sets a knob. The prior, its width and the third-beat penalty were fixed by that
 * DECISION, so changing them needs a new ruling, and a new measure on data that has not been seen.
 */
export const defaultTempogramTuning: TempogramTuning = {
  frameRate: 100,
  bands: [30, 200, 500, 1500, 4000, 10_000],
  compression: 1000,
  localMeanSeconds: 0.5,
  windowSeconds: 8,
  warmupSeconds: 4,
  updateSeconds: 0.5,
  combBeats: 4,
  halfLifeSeconds: 16,
  halfBeatPenalty: 0,
  thirdBeatPenalty: 0.3,
  priorBpm: 80,
  priorOctaves: 1.7,
  stableSeconds: 8,
  stableAgreement: 0.8,
  stableTolerance: 0.02,
  stableSalience: 0.15,
  stableMargin: 1.25,
  readingSalience: 0.02,
};

/**
 * What the tuning above was measured on. The range is part of the settings: this prior is only a tilt once
 * the half of a fast tempo is out of reach, so a wider range is another detector, which nothing measured.
 * A tempo outside it reads at the octave inside: 200 BPM reads 100, 70 reads 140.
 */
export const defaultTempogramRange: TempoRange = {min: 90, max: 180};

/**
 * Refuses a named mode whose guarantee the other options would break. The mode changes no setting, it only
 * holds the caller to the settings that were measured, which include the range and the absence of a reset.
 * @param options The analyzer's options
 * @throws {RangeError} When the mode is unknown, or the options contradict it
 */
export function assertTempogramMode({tempogramMode, detector, tempoRange, continuousAnalysis}: RealTimeBpmAnalyzerParameters): void {
  if (tempogramMode === undefined) {
    return;
  }

  if (tempogramMode !== 'extension') {
    throw new RangeError(`Invalid tempogramMode: ${String(tempogramMode)}. Use 'extension'.`);
  }

  const {min, max} = defaultTempogramRange;

  if (detector !== 'tempogram') {
    throw new RangeError('tempogramMode needs detector: \'tempogram\'.');
  }

  if (tempoRange !== undefined && (tempoRange.min !== min || tempoRange.max !== max)) {
    throw new RangeError(`tempogramMode 'extension' searches ${min} to ${max} BPM, and tempoRange asks for another range.`);
  }

  if (continuousAnalysis) {
    throw new RangeError('tempogramMode \'extension\' was measured without continuousAnalysis, whose reset never lets the tempogram reach stable.');
  }
}

/** Tempo grid resolution: tempo ratio between neighbours, finer than the ±4% that counts as correct */
const gridRatio = 1.01;

/** Fastest the loudness reference falls, per frame: it follows a fade without chasing each transient */
const loudnessDecay = 0.9995;

/** Loudness reference floor, about -80 dBFS for a 1024-point Hann frame: silence stays silence */
const minimumLoudness = 0.05;

/**
 * Onset strength smoothing over 50 ms at 100 Hz, for Percival & Tzanetakis' 7 Hz lowpass: without
 * it, autocorrelation peaks are one lag wide and fall between the lags of the tempo grid.
 */
const smoothingWeights = [1 / 9, 2 / 9, 3 / 9, 2 / 9, 1 / 9];

/** Up to this many candidates per reading, as the peaks detector returns */
const maxCandidates = 5;

export type TempogramReading = {
  /** Candidates, best first. Empty when no pulse stands out. */
  readonly candidates: readonly Tempo[];
  /** The reading has just become stable, or the stable tempo has just changed */
  readonly isNewlyStable: boolean;
};

export type TempogramDetector = {
  /** Consumes samples, synchronously, returning a reading when a tempogram frame completes */
  process: (samples: Float32Array) => TempogramReading | null;
  /** Consumes one onset strength frame: `process` without the onset stage, for tuning replays */
  ingest: (onsetStrength: number) => TempogramReading | null;
  /** Onset strength of a whole recording, without touching the tempo state: tuning replays cache this */
  onsetCurve: (samples: Float32Array) => Float32Array;
  /** Share of the warm-up heard, from 0 to 1 */
  progress: () => number;
  reset: () => void;
};

type OnsetStage = {
  /** Feeds one frame of `fftSize` windowed samples held in `re`, returns its onset strength */
  frame: () => number;
  re: Float64Array;
  fftSize: number;
  reset: () => void;
};

function createFft(size: number) {
  const cosines = new Float64Array(size / 2);
  const sines = new Float64Array(size / 2);
  const reversed = new Uint32Array(size);
  const bits = Math.log2(size);

  for (let i = 0; i < size / 2; i += 1) {
    cosines[i] = Math.cos((2 * Math.PI * i) / size);
    sines[i] = -Math.sin((2 * Math.PI * i) / size);
  }

  for (let i = 0; i < size; i += 1) {
    let value = 0;

    for (let bit = 0; bit < bits; bit += 1) {
      value = (value << 1) | ((i >> bit) & 1);
    }

    reversed[i] = value;
  }

  /** In-place radix-2 FFT, no allocation: this runs about 100 times a second in the worklet */
  return function fft(re: Float64Array, im: Float64Array): void {
    for (let i = 0; i < size; i += 1) {
      const j = reversed[i];

      if (j > i) {
        const swapped = re[i];
        re[i] = re[j];
        re[j] = swapped;
        const swappedIm = im[i];
        im[i] = im[j];
        im[j] = swappedIm;
      }
    }

    for (let half = 1; half < size; half *= 2) {
      const step = size / (2 * half);

      for (let start = 0; start < size; start += 2 * half) {
        for (let k = 0; k < half; k += 1) {
          const a = start + k;
          const b = a + half;
          const wr = cosines[k * step];
          const wi = sines[k * step];
          const tr = (re[b] * wr) - (im[b] * wi);
          const ti = (re[b] * wi) + (im[b] * wr);
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  };
}

function createOnsetStage(sampleRate: number, frameRate: number, tuning: TempogramTuning): OnsetStage {
  const fftSize = 2 ** Math.round(Math.log2(0.023 * sampleRate));
  const bins = fftSize / 2;
  const fft = createFft(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const previousLog = new Float64Array(bins);
  const nyquist = sampleRate / 2;
  const edges = tuning.bands.map(hz => Math.min(bins, Math.max(1, Math.round((hz / nyquist) * bins))));
  const bandCount = edges.length - 1;
  const localMeans = new Float64Array(bandCount);
  const meanStep = 1 / (tuning.localMeanSeconds * frameRate);
  let loudness = minimumLoudness;
  let hasPrevious = false;

  function frame(): number {
    im.fill(0);
    fft(re, im);

    let peak = 0;

    for (let bin = 1; bin < bins; bin += 1) {
      const power = (re[bin] * re[bin]) + (im[bin] * im[bin]);

      re[bin] = power;
      peak = power > peak ? power : peak;
    }

    // Relative to a slow loudness reference, so the reading does not depend on the volume
    loudness = Math.max(Math.sqrt(peak), loudness * loudnessDecay, minimumLoudness);

    const scale = tuning.compression / loudness;
    let strength = 0;

    for (let band = 0; band < bandCount; band += 1) {
      const first = edges[band];
      const end = edges[band + 1];
      let flux = 0;

      for (let bin = first; bin < end; bin += 1) {
        const logarithm = Math.log(1 + (scale * Math.sqrt(re[bin])));
        const rise = logarithm - previousLog[bin];

        previousLog[bin] = logarithm;
        flux += rise > 0 ? rise : 0;
      }

      flux /= Math.max(1, end - first);
      localMeans[band] += meanStep * (flux - localMeans[band]);

      const novelty = flux - localMeans[band];

      strength += novelty > 0 ? novelty : 0;
    }

    if (!hasPrevious) {
      // The first frame rises from nothing, which is no onset
      hasPrevious = true;

      return 0;
    }

    return strength;
  }

  function reset(): void {
    previousLog.fill(0);
    localMeans.fill(0);
    loudness = minimumLoudness;
    hasPrevious = false;
  }

  return {frame, re, fftSize, reset};
}

type TempoGrid = {
  readonly tempos: Float64Array;
  readonly prior: Float64Array;
  /** For each tempo, each beat multiple: the lag in frames */
  readonly lags: Float64Array;
  readonly harmonics: number;
  readonly maxLag: number;
};

function createTempoGrid(range: TempoRange, frameRate: number, tuning: TempogramTuning): TempoGrid {
  const size = Math.floor(Math.log(range.max / range.min) / Math.log(gridRatio)) + 1;
  const harmonics = tuning.combBeats;
  const tempos = new Float64Array(size);
  const prior = new Float64Array(size);
  const lags = new Float64Array(size * harmonics);
  const windowFrames = Math.round(tuning.windowSeconds * frameRate);
  let maxLag = 0;

  for (let i = 0; i < size; i += 1) {
    const tempo = range.min * (gridRatio ** i);

    tempos[i] = tempo;
    prior[i] = Math.exp(-0.5 * ((Math.log2(tempo / tuning.priorBpm) / tuning.priorOctaves) ** 2));

    for (let k = 0; k < harmonics; k += 1) {
      const lag = ((k + 1) * 60 * frameRate) / tempo;

      lags[(i * harmonics) + k] = lag;
      maxLag = lag < windowFrames - 1 && lag > maxLag ? lag : maxLag;
    }
  }

  return {tempos, prior, lags, harmonics, maxLag: Math.ceil(maxLag) + 1};
}

/** Whether a positive value is at least both of its neighbours */
function isLocalPeak(values: Float64Array, i: number): boolean {
  const left = i > 0 ? values[i - 1] : Number.NEGATIVE_INFINITY;
  const right = i < values.length - 1 ? values[i + 1] : Number.NEGATIVE_INFINITY;

  return values[i] > 0 && values[i] >= left && values[i] >= right;
}

/**
 * Creates the streaming tempo detector. Every buffer is allocated here, once: `process` runs on
 * the audio thread and allocates only when it returns a reading.
 * @param options - Options
 * @param options.sampleRate - Sample rate in Hz
 * @param options.tempoRange - Tempos searched, when the caller limits them
 * @param options.tuning - Overrides, for the benchmark's tuning runs
 * @returns The detector
 */
export function createTempogramDetector({
  sampleRate,
  tempoRange,
  tuning: overrides,
}: {
  sampleRate: number;
  tempoRange?: TempoRange;
  tuning?: Partial<TempogramTuning>;
}): TempogramDetector {
  const tuning = {...defaultTempogramTuning, ...overrides};
  const hop = Math.round(sampleRate / tuning.frameRate);
  const frameRate = sampleRate / hop;
  const onset = createOnsetStage(sampleRate, frameRate, tuning);
  const grid = createTempoGrid(tempoRange ?? defaultTempogramRange, frameRate, tuning);
  const {fftSize} = onset;
  const hann = Float64Array.from({length: fftSize}, (_, i) => 0.5 - (0.5 * Math.cos((2 * Math.PI * i) / fftSize)));
  const samplesRing = new Float32Array(fftSize);
  const windowFrames = Math.round(tuning.windowSeconds * frameRate);
  // Written twice, so the latest window is always a contiguous range
  const ossRing = new Float32Array(2 * windowFrames);
  const recent = new Float64Array(smoothingWeights.length);
  const centred = new Float64Array(windowFrames);
  const autocorrelation = new Float64Array(grid.maxLag + 1);
  const salience = new Float64Array(grid.tempos.length);
  const accumulated = new Float64Array(grid.tempos.length);
  const ranking = new Float64Array(grid.tempos.length);
  const updateFrames = Math.max(1, Math.round(tuning.updateSeconds * frameRate));
  const warmupFrames = Math.round(tuning.warmupSeconds * frameRate);
  const memory = 0.5 ** (tuning.updateSeconds / tuning.halfLifeSeconds);
  const agreementFrames = Math.max(1, Math.round(tuning.stableSeconds / tuning.updateSeconds));
  const frameTempos = new Float64Array(agreementFrames);

  let samplesWritten = 0;
  let sinceHop = 0;
  let frames = 0;
  let accumulatedWeight = 0;
  let tempogramFrames = 0;
  let stableTempo = 0;

  function computeOnsetStrength(): number {
    const {re} = onset;
    const position = samplesWritten % fftSize;

    for (let i = 0; i < fftSize; i += 1) {
      re[i] = samplesRing[(position + i) % fftSize] * hann[i];
    }

    return onset.frame();
  }

  function ingest(onsetStrength: number): TempogramReading | null {
    recent[frames % recent.length] = onsetStrength;

    let strength = 0;

    for (let i = 0; i < recent.length; i += 1) {
      strength += recent[(frames + recent.length - i) % recent.length] * smoothingWeights[i];
    }

    const slot = frames % windowFrames;

    ossRing[slot] = strength;
    ossRing[slot + windowFrames] = strength;
    frames += 1;

    return frames >= warmupFrames && (frames - warmupFrames) % updateFrames === 0 ? tempogramFrame() : null;
  }

  function correlationAt(lag: number): number {
    const low = Math.floor(lag);

    return autocorrelation[low] + ((lag - low) * (autocorrelation[low + 1] - autocorrelation[low]));
  }

  /** Fills `salience` from the latest window, returns false when nothing pulses in it */
  function computeSalience(): boolean {
    const length = Math.min(frames, windowFrames);
    const first = frames <= windowFrames ? 0 : frames % windowFrames;
    let mean = 0;

    for (let i = 0; i < length; i += 1) {
      mean += ossRing[first + i];
    }

    mean /= length;

    for (let i = 0; i < length; i += 1) {
      centred[i] = ossRing[first + i] - mean;
    }

    const lagEnd = Math.min(grid.maxLag, length - 1);

    for (let lag = 0; lag <= lagEnd; lag += 1) {
      let sum = 0;

      for (let i = lag; i < length; i += 1) {
        sum += centred[i] * centred[i - lag];
      }

      // Unbiased: a long lag overlaps less, which must not read as less periodic
      autocorrelation[lag] = (sum * length) / (length - lag);
    }

    const energy = autocorrelation[0];

    if (energy < 1e-12) {
      return false;
    }

    const {lags, harmonics} = grid;

    for (let i = 0; i < salience.length; i += 1) {
      let sum = 0;
      let weight = 0;

      for (let k = 0; k < harmonics; k += 1) {
        const lag = lags[(i * harmonics) + k];

        if (lag >= lagEnd) {
          break;
        }

        sum += correlationAt(lag);
        weight += 1;
      }

      const comb = weight > 0 ? sum / (weight * energy) : 0;
      const beat = lags[i * harmonics];
      const between = (tuning.halfBeatPenalty * correlationAt(beat / 2)) + (tuning.thirdBeatPenalty * correlationAt(beat / 3));

      salience[i] = comb - ((between > 0 ? between : 0) / energy);
    }

    return true;
  }

  function bestOf(values: Float64Array): number {
    let best = -1;
    let bestValue = 0;

    for (let i = 0; i < values.length; i += 1) {
      const value = values[i] * grid.prior[i];

      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }

    return best;
  }

  function accumulate(): void {
    accumulatedWeight = (accumulatedWeight * memory) + 1;

    for (let i = 0; i < accumulated.length; i += 1) {
      const positive = salience[i] > 0 ? salience[i] : 0;

      accumulated[i] = (accumulated[i] * memory) + positive;
      ranking[i] = (accumulated[i] / accumulatedWeight) * grid.prior[i];
    }
  }

  function refinedTempo(i: number): number {
    if (i === 0 || i === ranking.length - 1) {
      return grid.tempos[i];
    }

    const denominator = ranking[i - 1] - (2 * ranking[i]) + ranking[i + 1];
    const offset = denominator === 0 ? 0 : (0.5 * (ranking[i - 1] - ranking[i + 1])) / denominator;

    return grid.tempos[i] * (gridRatio ** offset);
  }

  function collectCandidates(): Tempo[] {
    const peaks: number[] = [];

    for (let i = 0; i < ranking.length; i += 1) {
      if (isLocalPeak(ranking, i)) {
        peaks.push(i);
      }
    }

    return peaks
      .sort((a, b) => ranking[b] - ranking[a])
      .slice(0, maxCandidates)
      .map(i => ({
        tempo: Math.round(refinedTempo(i)),
        count: Math.round(ranking[i] * 1000),
        confidence: Math.min(1, accumulated[i] / accumulatedWeight),
      }))
      .filter(candidate => candidate.confidence >= tuning.readingSalience);
  }

  /** "Stable" means the frames' own estimates, not just the slow accumulator, agree over time */
  function agreesOverTime(tempo: number): boolean {
    if (tempogramFrames < agreementFrames) {
      return false;
    }

    let agreeing = 0;

    for (let i = 0; i < agreementFrames; i += 1) {
      agreeing += Math.abs(frameTempos[i] - tempo) <= tuning.stableTolerance * tempo ? 1 : 0;
    }

    return agreeing >= tuning.stableAgreement * agreementFrames;
  }

  function tempogramFrame(): TempogramReading {
    if (!computeSalience()) {
      frameTempos[tempogramFrames % agreementFrames] = 0;
      tempogramFrames += 1;
      stableTempo = 0;

      return {candidates: [], isNewlyStable: false};
    }

    const frameBest = bestOf(salience);

    frameTempos[tempogramFrames % agreementFrames] = frameBest < 0 ? 0 : grid.tempos[frameBest];
    tempogramFrames += 1;
    accumulate();

    const candidates = collectCandidates();
    const top = candidates[0];
    const rival = candidates[1];
    const isStable = top !== undefined
      && top.confidence >= tuning.stableSalience
      && (rival === undefined || top.count >= tuning.stableMargin * rival.count)
      && agreesOverTime(top.tempo);
    const isSameTempo = isStable && Math.abs(top.tempo - stableTempo) <= tuning.stableTolerance * top.tempo;
    const isNewlyStable = isStable && !isSameTempo;

    if (isNewlyStable) {
      stableTempo = top.tempo;
    }

    return {candidates, isNewlyStable};
  }

  function process(samples: Float32Array): TempogramReading | null {
    let reading = null as TempogramReading | null;

    for (let i = 0; i < samples.length; i += 1) {
      samplesRing[samplesWritten % fftSize] = samples[i];
      samplesWritten += 1;
      sinceHop += 1;

      if (sinceHop === hop) {
        sinceHop = 0;

        const next = ingest(computeOnsetStrength());

        // Below 8 kHz a chunk can span two frames: the newer reading wins, a "stable" must not be lost
        if (next) {
          reading = reading?.isNewlyStable ? {...next, isNewlyStable: true} : next;
        }
      }
    }

    return reading;
  }

  function onsetCurve(samples: Float32Array): Float32Array {
    const curve = new Float32Array(Math.floor(samples.length / hop));

    for (let i = 0; i < samples.length; i += 1) {
      samplesRing[samplesWritten % fftSize] = samples[i];
      samplesWritten += 1;

      if (samplesWritten % hop === 0) {
        curve[(samplesWritten / hop) - 1] = computeOnsetStrength();
      }
    }

    return curve;
  }

  function reset(): void {
    onset.reset();
    samplesRing.fill(0);
    ossRing.fill(0);
    recent.fill(0);
    accumulated.fill(0);
    frameTempos.fill(0);
    samplesWritten = 0;
    sinceHop = 0;
    frames = 0;
    accumulatedWeight = 0;
    tempogramFrames = 0;
    stableTempo = 0;
  }

  return {
    process,
    ingest,
    onsetCurve,
    progress: () => Math.min(1, frames / warmupFrames),
    reset,
  };
}

/** Shorter audio has no two beats to compare at the slowest tempo searched */
const shortestRecordingSeconds = 1.5;

/**
 * Tempo candidates of a whole recording, by the tempogram: every frame counts the same, because a
 * file has no "now" to follow, and a short file reads as soon as it ends instead of never.
 * @param channelData PCM samples of one channel, not lowpassed
 * @param sampleRate Sample rate in Hz
 * @param tempoRange Tempos searched (default: 90 to 180 BPM)
 * @returns Up to 5 tempo candidates, best first, empty when no pulse stands out
 * @throws {RangeError} When `tempoRange` is invalid
 */
export function detectTempogram(channelData: Float32Array, sampleRate: number, tempoRange?: TempoRange): Tempo[] {
  const range = resolveTempoRange(tempoRange);
  const seconds = channelData.length / sampleRate;

  if (seconds < shortestRecordingSeconds) {
    return [];
  }

  const detector = createTempogramDetector({
    sampleRate,
    tempoRange: range,
    tuning: {
      halfLifeSeconds: Number.POSITIVE_INFINITY,
      warmupSeconds: Math.min(defaultTempogramTuning.warmupSeconds, seconds),
    },
  });
  const reading = detector.process(channelData);

  return reading === null ? [] : [...reading.candidates];
}
