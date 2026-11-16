package com.realtimebpmanalyzer;

import java.util.ArrayList;
import java.util.List;

/**
 * Offline BPM analysis of mono PCM samples: the Java port of the JS library's {@code analyzeChannelData}
 * (realtime-bpm-analyzer/node). It gives the same readings as the JS library, which the shared conformance vectors
 * check on every build.
 *
 * <p>It decodes nothing: the caller supplies the samples as floats from -1 to 1, one channel, and their sample rate.
 * It holds no state and starts no thread, so it can run from any thread; a long file takes a while, so keep it off a
 * game's or an app's main thread.
 *
 * <pre>{@code
 * Reading reading = BpmAnalyzer.analyzeChannelData(samples, 44100);
 * if (reading != null) {
 *     System.out.println(reading.bpm());
 * }
 * }</pre>
 */
public final class BpmAnalyzer {
    private BpmAnalyzer() {
    }

    /**
     * Analyses the samples with the default options: the tempogram engine on 90 to 180 BPM.
     *
     * @see #analyzeChannelData(float[], double, AnalysisOptions)
     */
    public static Reading analyzeChannelData(float[] samples, double sampleRate) {
        return analyzeChannelData(samples, sampleRate, AnalysisOptions.DEFAULT);
    }

    /**
     * Analyses the samples.
     *
     * @param samples One channel, from -1 to 1. Left untouched
     * @param sampleRate Their rate in Hz
     * @param options The engine and the tempo range
     * @return The reading, or null when no tempo was found
     * @throws NullPointerException When an argument is null
     * @throws IllegalArgumentException When {@code samples} is empty, or holds a NaN or infinite sample
     * @throws OutOfRangeException When the sample rate is not finite, or is under 100 Hz for the tempogram, or under
     *     2 Hz or not above twice the lowpass cutoff for the peaks engine
     */
    public static Reading analyzeChannelData(float[] samples, double sampleRate, AnalysisOptions options) {
        if (samples == null || options == null) {
            throw new NullPointerException(samples == null ? "samples" : "options");
        }
        if (samples.length == 0) {
            throw new IllegalArgumentException("Invalid channel data: expected a non-empty float array.");
        }
        requireFiniteSamples(samples);

        Engine engine = options.engine();
        TempoRange range = options.tempoRange();
        double audioTo = samples.length / sampleRate;
        if (engine.name() == EngineName.TEMPOGRAM) {
            return toReading(TempogramEngine.detect(samples, sampleRate, range), audioTo, EngineName.TEMPOGRAM, range);
        }
        if (!(sampleRate >= PeaksEngine.MIN_SAMPLE_RATE)) {
            throw new OutOfRangeException("Invalid sample rate: " + sampleRate + ". The peaks engine needs at least "
                + PeaksEngine.MIN_SAMPLE_RATE + " Hz, where the skip after a peak is a whole sample.");
        }
        Lowpass lowpass = engine.lowpass();
        requireLowpassFits(lowpass, sampleRate);
        return toReading(PeaksEngine.detect(samples, sampleRate, lowpass, range), audioTo, EngineName.PEAKS, range);
    }

    /**
     * A NaN or infinite sample is no PCM, and through the peaks lowpass it would turn every later sample into NaN. The
     * caller can fix its decoding, so it is refused, as the JS library refuses it (RBA-260).
     */
    private static void requireFiniteSamples(float[] samples) {
        for (int i = 0; i < samples.length; i++) {
            if (!Float.isFinite(samples[i])) {
                throw new IllegalArgumentException("Invalid channel data: sample " + i + " is " + samples[i]
                    + ", and every sample must be a finite number.");
            }
        }
    }

    /** The cutoff is stored as a 32-bit float, as Web Audio stores it, and must sit strictly under Nyquist. */
    private static void requireLowpassFits(Lowpass lowpass, double sampleRate) {
        if (Double.isNaN(sampleRate) || Double.isInfinite(sampleRate) || sampleRate <= 0) {
            throw new OutOfRangeException("Invalid sample rate: " + sampleRate + ". Sample rate must be positive.");
        }
        double nyquist = sampleRate / 2;
        float stored = (float) lowpass.frequency();
        if (!(stored > 0 && stored < nyquist)) {
            throw new OutOfRangeException("The lowpass setting frequency " + lowpass.frequency()
                + " is out of range: at a sample rate of " + sampleRate + " Hz, it must be above 0 and below "
                + nyquist + " Hz.");
        }
    }

    private static Reading toReading(List<Tempo> tempos, double audioTo, EngineName engine, TempoRange range) {
        if (tempos.isEmpty()) {
            return null;
        }
        Tempo top = tempos.get(0);
        List<Candidate> candidates = new ArrayList<Candidate>();
        for (int i = 0; i < Math.min(5, tempos.size()); i++) {
            long bpm = tempos.get(i).tempo;
            Relation relation = i == 0 ? Relation.TOP : relationTo(top.tempo, bpm);
            candidates.add(new Candidate(toInt(bpm), relation));
        }
        return new Reading(toInt(top.tempo), top.exact,
            Calibration.calibrate(engine, top.confidence, top.tempo, range), candidates, 0, audioTo, engine);
    }

    /** TempoRange caps max at Integer.MAX_VALUE and no engine reads past its range, so this never throws. */
    private static int toInt(long bpm) {
        if (bpm < Integer.MIN_VALUE || bpm > Integer.MAX_VALUE) {
            throw new IllegalStateException("A tempo past the range: " + bpm);
        }
        return (int) bpm;
    }

    /** A candidate's relation to the top tempo, within 2% of half or double it: contract/transitions.ts. */
    static Relation relationTo(long top, long bpm) {
        if (near(bpm, top / 2.0)) {
            return Relation.HALF;
        }
        return near(bpm, top * 2.0) ? Relation.DOUBLE : Relation.OTHER;
    }

    private static boolean near(long bpm, double target) {
        return Math.abs(bpm - target) <= target * Reading.RELATION_TOLERANCE;
    }
}
