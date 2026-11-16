package io.github.dlepaux.realtimebpmanalyzer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * The tempogram engine on a whole buffer: the JS library's detectTempogram (core/tempogram.ts) with the settings it
 * ships, which no option changes. Band-wise spectral flux at about 100 frames a second, then, every 0.5 s, an
 * autocorrelation of the last 8 s read through a four-beat comb and a log-Gaussian tempo prior, accumulated over the
 * whole file with every frame weighted the same.
 *
 * <p>Only what decides the offline reading is ported: the realtime detector's "stable" rule and per-frame best tempo
 * feed its events, never {@code detector.candidates()}, which is all {@code detectTempogram} returns.
 *
 * <p>The transcendental functions are {@link StrictMath}'s, fdlibm's algorithms on every JVM, so the readings
 * don't depend on the JVM's intrinsics. The sums keep the JS order of operations. The input samples and the onset
 * strength ring are 32-bit floats, as in the JS library.
 */
final class TempogramEngine {
    private static final double FRAME_RATE = 100;
    private static final int[] BANDS = {30, 200, 500, 1500, 4000, 10_000};
    private static final double COMPRESSION = 1000;
    private static final double LOCAL_MEAN_SECONDS = 0.5;
    private static final double WINDOW_SECONDS = 8;
    private static final double WARMUP_SECONDS = 4;
    private static final double UPDATE_SECONDS = 0.5;
    private static final int COMB_BEATS = 4;
    private static final double HALF_BEAT_PENALTY = 0;
    private static final double THIRD_BEAT_PENALTY = 0.3;
    private static final double PRIOR_BPM = 80;
    private static final double PRIOR_OCTAVES = 1.7;
    private static final double READING_SALIENCE = 0.02;
    /** Tempo ratio between neighbours of the grid. */
    private static final double GRID_RATIO = 1.01;
    /** Fastest the loudness reference falls, per frame. */
    private static final double LOUDNESS_DECAY = 0.9995;
    /** Loudness reference floor: silence stays silence. */
    private static final double MINIMUM_LOUDNESS = 0.05;
    /** Onset strength smoothing over 50 ms, newest first. */
    private static final double[] SMOOTHING_WEIGHTS = {1.0 / 9, 2.0 / 9, 3.0 / 9, 2.0 / 9, 1.0 / 9};
    private static final int MAX_CANDIDATES = 5;
    /** Shorter audio has no two beats to compare at the slowest tempo searched. */
    private static final double SHORTEST_RECORDING_SECONDS = 1.5;
    /** The largest FFT a Java array holds; the JS library's typed array would refuse it first. */
    private static final int MAX_FFT_BITS = 30;

    private TempogramEngine() {
    }

    /**
     * @param samples The caller's samples, full band
     * @param sampleRate Their rate
     * @param range The tempos searched
     * @return Up to 5 candidates, best first, empty when no pulse stands out or the audio is under 1.5 s
     * @throws OutOfRangeException When the sample rate is not finite or under 100 Hz
     */
    static List<Tempo> detect(float[] samples, double sampleRate, TempoRange range) {
        if (Double.isNaN(sampleRate) || Double.isInfinite(sampleRate) || sampleRate < FRAME_RATE) {
            throw new OutOfRangeException("Invalid sample rate: " + sampleRate + ". The tempogram needs at least "
                + FRAME_RATE + " Hz.");
        }
        double seconds = samples.length / sampleRate;
        if (seconds < SHORTEST_RECORDING_SECONDS) {
            return new ArrayList<Tempo>();
        }
        // A frame short of the end: rounding must not ask for more frames than the file holds
        double warmupSeconds = Math.min(WARMUP_SECONDS, seconds - (1 / FRAME_RATE));
        Detector detector = new Detector(sampleRate, range, warmupSeconds);
        detector.process(samples);
        return detector.candidates();
    }

    /**
     * The FFT size: the power of two nearest 23 ms of samples, on a log scale.
     *
     * @throws OutOfRangeException When it would not fit in a Java array, from about 66 GHz. Defensive: a float[]
     *     can't hold the 1.5 s the analysis needs at that rate, so {@link #detect} returns no tempo first
     */
    static int fftSize(double sampleRate) {
        long bits = Math.round(log2(0.023 * sampleRate));
        if (bits > MAX_FFT_BITS) {
            throw new OutOfRangeException("Invalid sample rate: " + sampleRate
                + ". The tempogram's FFT would not fit in memory.");
        }
        return 1 << bits;
    }

    /** Lowest-to-highest bit reversal of each index, and the twiddle factors, of an in-place radix-2 FFT. */
    private static final class Fft {
        private final int size;
        private final double[] cosines;
        private final double[] sines;
        private final int[] reversed;

        Fft(int size) {
            this.size = size;
            cosines = new double[size / 2];
            sines = new double[size / 2];
            reversed = new int[size];
            int bits = Integer.numberOfTrailingZeros(size);
            for (int i = 0; i < size / 2; i++) {
                cosines[i] = StrictMath.cos((2 * Math.PI * i) / size);
                sines[i] = -StrictMath.sin((2 * Math.PI * i) / size);
            }
            for (int i = 0; i < size; i++) {
                int value = 0;
                for (int bit = 0; bit < bits; bit++) {
                    value = (value << 1) | ((i >> bit) & 1);
                }
                reversed[i] = value;
            }
        }

        void transform(double[] re, double[] im) {
            for (int i = 0; i < size; i++) {
                int j = reversed[i];
                if (j > i) {
                    double swapped = re[i];
                    re[i] = re[j];
                    re[j] = swapped;
                    double swappedIm = im[i];
                    im[i] = im[j];
                    im[j] = swappedIm;
                }
            }
            for (int half = 1; half < size; half *= 2) {
                int step = size / (2 * half);
                for (int start = 0; start < size; start += 2 * half) {
                    for (int k = 0; k < half; k++) {
                        int a = start + k;
                        int b = a + half;
                        double wr = cosines[k * step];
                        double wi = sines[k * step];
                        double tr = (re[b] * wr) - (im[b] * wi);
                        double ti = (re[b] * wi) + (im[b] * wr);
                        re[b] = re[a] - tr;
                        im[b] = im[a] - ti;
                        re[a] += tr;
                        im[a] += ti;
                    }
                }
            }
        }
    }

    /** Band-wise log-compressed spectral flux of one windowed frame, relative to a slow loudness reference. */
    private static final class OnsetStage {
        final int fftSize;
        final double[] re;
        private final int bins;
        private final Fft fft;
        private final double[] im;
        private final double[] previousLog;
        private final int[] edges;
        private final double[] localMeans;
        private final double meanStep;
        private double loudness = MINIMUM_LOUDNESS;
        private boolean hasPrevious;

        OnsetStage(double sampleRate, double frameRate) {
            fftSize = fftSize(sampleRate);
            bins = fftSize / 2;
            fft = new Fft(fftSize);
            re = new double[fftSize];
            im = new double[fftSize];
            previousLog = new double[bins];
            double nyquist = sampleRate / 2;
            edges = new int[BANDS.length];
            for (int i = 0; i < BANDS.length; i++) {
                edges[i] = (int) Math.min(bins, Math.max(1, Math.round((BANDS[i] / nyquist) * bins)));
            }
            localMeans = new double[BANDS.length - 1];
            meanStep = 1 / (LOCAL_MEAN_SECONDS * frameRate);
        }

        /** Consumes the windowed samples in {@link #re}, returns their onset strength. */
        double frame() {
            java.util.Arrays.fill(im, 0);
            fft.transform(re, im);

            double peak = 0;
            double total = 0;
            for (int bin = 1; bin < bins; bin++) {
                double power = (re[bin] * re[bin]) + (im[bin] * im[bin]);
                re[bin] = power;
                peak = power > peak ? power : peak;
                total += power;
            }
            if (Double.isNaN(total) || Double.isInfinite(total)) {
                // A NaN or infinite sample is no audio: no onset, and the state is kept. BpmAnalyzer refuses such
                // samples first (RBA-260); this mirrors the reference's realtime rule (RBA-246)
                return 0;
            }

            loudness = Math.max(Math.sqrt(peak), Math.max(loudness * LOUDNESS_DECAY, MINIMUM_LOUDNESS));
            double scale = COMPRESSION / loudness;
            double strength = 0;
            for (int band = 0; band < localMeans.length; band++) {
                int first = edges[band];
                int end = edges[band + 1];
                double flux = 0;
                for (int bin = first; bin < end; bin++) {
                    double logarithm = StrictMath.log(1 + (scale * Math.sqrt(re[bin])));
                    double rise = logarithm - previousLog[bin];
                    previousLog[bin] = logarithm;
                    flux += rise > 0 ? rise : 0;
                }
                flux /= Math.max(1, end - first);
                localMeans[band] += meanStep * (flux - localMeans[band]);
                double novelty = flux - localMeans[band];
                strength += novelty > 0 ? novelty : 0;
            }

            if (!hasPrevious) {
                // The first frame rises from nothing, which is no onset
                hasPrevious = true;
                return 0;
            }
            return strength;
        }
    }

    /** The streaming detector, with the state the offline reading depends on. */
    private static final class Detector {
        private final int hop;
        private final OnsetStage onset;
        private final int fftSize;
        private final double[] hann;
        private final float[] samplesRing;
        private final int windowFrames;
        /** Written twice, so the latest window is always a contiguous range. 32-bit, as in JS. */
        private final float[] ossRing;
        private final double[] recent = new double[SMOOTHING_WEIGHTS.length];
        private final double[] centred;
        private final double[] autocorrelation;
        private final double[] tempos;
        private final double[] prior;
        /** For each tempo, each beat multiple: the lag in frames. */
        private final double[] lags;
        private final int maxLag;
        private final double[] salience;
        private final double[] accumulated;
        private final double[] ranking;
        private final int updateFrames;
        private final int warmupFrames;
        private int samplesWritten;
        private int sinceHop;
        private int frames;
        private double accumulatedWeight;

        Detector(double sampleRate, TempoRange range, double warmupSeconds) {
            hop = (int) Math.round(sampleRate / FRAME_RATE);
            double frameRate = sampleRate / hop;
            onset = new OnsetStage(sampleRate, frameRate);
            fftSize = onset.fftSize;
            hann = new double[fftSize];
            for (int i = 0; i < fftSize; i++) {
                hann[i] = 0.5 - (0.5 * StrictMath.cos((2 * Math.PI * i) / fftSize));
            }
            samplesRing = new float[fftSize];
            windowFrames = (int) Math.round(WINDOW_SECONDS * frameRate);
            ossRing = new float[2 * windowFrames];
            centred = new double[windowFrames];

            int size = (int) Math.floor(StrictMath.log(range.max() / range.min()) / StrictMath.log(GRID_RATIO)) + 1;
            tempos = new double[size];
            prior = new double[size];
            lags = new double[size * COMB_BEATS];
            double longestLag = 0;
            for (int i = 0; i < size; i++) {
                double tempo = range.min() * StrictMath.pow(GRID_RATIO, i);
                tempos[i] = tempo;
                double octaves = log2(tempo / PRIOR_BPM) / PRIOR_OCTAVES;
                prior[i] = StrictMath.exp(-0.5 * (octaves * octaves));
                for (int k = 0; k < COMB_BEATS; k++) {
                    double lag = ((k + 1) * 60 * frameRate) / tempo;
                    lags[(i * COMB_BEATS) + k] = lag;
                    longestLag = lag < windowFrames - 1 && lag > longestLag ? lag : longestLag;
                }
            }
            maxLag = (int) Math.ceil(longestLag) + 1;
            autocorrelation = new double[maxLag + 1];
            salience = new double[size];
            accumulated = new double[size];
            ranking = new double[size];
            updateFrames = (int) Math.max(1, Math.round(UPDATE_SECONDS * frameRate));
            warmupFrames = (int) Math.round(warmupSeconds * frameRate);
        }

        void process(float[] samples) {
            for (float sample : samples) {
                samplesRing[samplesWritten % fftSize] = sample;
                samplesWritten++;
                sinceHop++;
                if (sinceHop == hop) {
                    sinceHop = 0;
                    ingest(onsetStrength());
                }
            }
        }

        private double onsetStrength() {
            double[] re = onset.re;
            int position = samplesWritten % fftSize;
            for (int i = 0; i < fftSize; i++) {
                re[i] = samplesRing[(position + i) % fftSize] * hann[i];
            }
            return onset.frame();
        }

        private void ingest(double onsetStrength) {
            int length = recent.length;
            recent[frames % length] = onsetStrength;
            double strength = 0;
            for (int i = 0; i < length; i++) {
                strength += recent[(frames + length - i) % length] * SMOOTHING_WEIGHTS[i];
            }
            int slot = frames % windowFrames;
            ossRing[slot] = (float) strength;
            ossRing[slot + windowFrames] = (float) strength;
            frames++;
            if (frames >= warmupFrames && (frames - warmupFrames) % updateFrames == 0) {
                // The realtime detector's frame also keeps its stable rule's history, which the offline reading
                // never reads: only the accumulation decides detector.candidates()
                if (computeSalience()) {
                    accumulate();
                }
            }
        }

        /**
         * The autocorrelation at a fractional lag. A lag past the array reads as NaN, as JS reads an undefined
         * element: the salience's penalty then drops out, exactly as in the JS library.
         */
        private double correlationAt(double lag) {
            int low = (int) Math.floor(lag);
            return at(low) + ((lag - low) * (at(low + 1) - at(low)));
        }

        private double at(int index) {
            return index >= 0 && index < autocorrelation.length ? autocorrelation[index] : Double.NaN;
        }

        /** Fills {@link #salience} from the latest window, returns false when nothing pulses in it. */
        private boolean computeSalience() {
            int length = Math.min(frames, windowFrames);
            int first = frames <= windowFrames ? 0 : frames % windowFrames;
            double mean = 0;
            for (int i = 0; i < length; i++) {
                mean += ossRing[first + i];
            }
            mean /= length;
            for (int i = 0; i < length; i++) {
                centred[i] = ossRing[first + i] - mean;
            }

            int lagEnd = Math.min(maxLag, length - 1);
            for (int lag = 0; lag <= lagEnd; lag++) {
                double sum = 0;
                for (int i = lag; i < length; i++) {
                    sum += centred[i] * centred[i - lag];
                }
                // Unbiased: a long lag overlaps less, which must not read as less periodic
                autocorrelation[lag] = (sum * length) / (length - lag);
            }

            double energy = autocorrelation[0];
            if (energy < 1e-12) {
                return false;
            }

            for (int i = 0; i < salience.length; i++) {
                double sum = 0;
                double weight = 0;
                for (int k = 0; k < COMB_BEATS; k++) {
                    double lag = lags[(i * COMB_BEATS) + k];
                    if (lag >= lagEnd) {
                        break;
                    }
                    sum += correlationAt(lag);
                    weight += 1;
                }
                double comb = weight > 0 ? sum / (weight * energy) : 0;
                double beat = lags[i * COMB_BEATS];
                double between = (HALF_BEAT_PENALTY * correlationAt(beat / 2))
                    + (THIRD_BEAT_PENALTY * correlationAt(beat / 3));
                salience[i] = comb - ((between > 0 ? between : 0) / energy);
            }
            return true;
        }

        /** Every frame weighs the same over a whole file: the JS half-life is infinite, so its memory is 1. */
        private void accumulate() {
            accumulatedWeight = accumulatedWeight + 1;
            for (int i = 0; i < accumulated.length; i++) {
                double positive = salience[i] > 0 ? salience[i] : 0;
                accumulated[i] = accumulated[i] + positive;
                ranking[i] = (accumulated[i] / accumulatedWeight) * prior[i];
            }
        }

        private boolean isLocalPeak(int i) {
            double left = i > 0 ? ranking[i - 1] : Double.NEGATIVE_INFINITY;
            double right = i < ranking.length - 1 ? ranking[i + 1] : Double.NEGATIVE_INFINITY;
            return ranking[i] > 0 && ranking[i] >= left && ranking[i] >= right;
        }

        /** A peak's tempo, refined by a parabola through it and its neighbours on the log-tempo grid. */
        private double refinedTempo(int i) {
            if (i == 0 || i == ranking.length - 1) {
                return tempos[i];
            }
            double denominator = ranking[i - 1] - (2 * ranking[i]) + ranking[i + 1];
            double offset = denominator == 0 ? 0 : (0.5 * (ranking[i - 1] - ranking[i + 1])) / denominator;
            return tempos[i] * StrictMath.pow(GRID_RATIO, offset);
        }

        List<Tempo> candidates() {
            List<Integer> peaks = new ArrayList<Integer>();
            for (int i = 0; i < ranking.length; i++) {
                if (isLocalPeak(i)) {
                    peaks.add(i);
                }
            }
            // Stable, as Array.prototype.sort: equal rankings keep the grid's order
            Collections.sort(peaks, new Comparator<Integer>() {
                @Override
                public int compare(Integer a, Integer b) {
                    return Double.compare(ranking[b], ranking[a]);
                }
            });

            List<Tempo> candidates = new ArrayList<Tempo>();
            for (int i : peaks.subList(0, Math.min(MAX_CANDIDATES, peaks.size()))) {
                double exact = refinedTempo(i);
                double confidence = Math.min(1, accumulated[i] / accumulatedWeight);
                if (confidence >= READING_SALIENCE) {
                    candidates.add(new Tempo(Math.round(exact), exact, Math.round(ranking[i] * 1000), confidence));
                }
            }
            return candidates;
        }
    }

    /**
     * The base-2 logarithm. Java has none: this is the natural logarithm's quotient, which can differ from JS's
     * Math.log2 in the last bit. That moves a tempo prior by about 1e-16, far under the tolerances. It can also round
     * the FFT size the other way when 0.023 times the sample rate sits within a bit of 2^(n + 0.5): no whole rate
     * from 100 Hz to 2 MHz does, but a contrived one such as 122.97509238026912 Hz does (readme, "Differences").
     */
    private static double log2(double value) {
        return StrictMath.log(value) / StrictMath.log(2);
    }
}
