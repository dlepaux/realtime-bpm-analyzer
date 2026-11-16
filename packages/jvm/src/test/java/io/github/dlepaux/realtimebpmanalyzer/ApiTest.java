package io.github.dlepaux.realtimebpmanalyzer;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

/** The Java API around the engines: what the conformance vectors don't reach. */
class ApiTest {
    private static final double RATE = 44_100;

    /** A decaying 60 Hz kick every beat, loud enough for both engines. */
    private static float[] kicks(double bpm, double seconds) {
        float[] samples = new float[(int) (seconds * RATE)];
        int beat = (int) Math.round(RATE * 60 / bpm);
        for (int start = 0; start < samples.length; start += beat) {
            for (int i = 0; i < RATE / 20 && start + i < samples.length; i++) {
                double t = i / RATE;
                samples[start + i] = (float) (0.99 * Math.exp(-t * 40) * Math.sin(2 * Math.PI * 60 * t));
            }
        }
        return samples;
    }

    private static <T extends Throwable> T assertThrowsExactly(Class<T> expected, Executable call) {
        T thrown = assertThrows(expected, call);
        assertSame(expected, thrown.getClass());
        return thrown;
    }

    @Test
    void readsATempoWithEitherEngine() {
        float[] samples = kicks(120, 10);
        Reading tempogram = BpmAnalyzer.analyzeChannelData(samples, RATE);
        assertNotNull(tempogram);
        assertEquals(EngineName.TEMPOGRAM, tempogram.engine());
        assertEquals(tempogram.bpm(), tempogram.candidates().get(0).bpm());
        assertEquals(Relation.TOP, tempogram.candidates().get(0).relation());
        assertEquals(0, tempogram.audioFrom());
        assertEquals(10.0, tempogram.audioTo());
        assertNotNull(tempogram.confidence());

        Reading peaks = BpmAnalyzer.analyzeChannelData(samples, RATE, AnalysisOptions.DEFAULT.withEngine(Engine.PEAKS));
        assertNotNull(peaks);
        assertEquals(EngineName.PEAKS, peaks.engine());
    }

    @Test
    void leavesTheInputUntouched() {
        float[] samples = kicks(120, 10);
        float[] copy = samples.clone();
        BpmAnalyzer.analyzeChannelData(samples, RATE);
        BpmAnalyzer.analyzeChannelData(samples, RATE, AnalysisOptions.DEFAULT.withEngine(Engine.PEAKS));
        assertArrayEquals(copy, samples);
    }

    @Test
    void readingIsImmutable() {
        Reading reading = BpmAnalyzer.analyzeChannelData(kicks(120, 10), RATE);
        assertNotNull(reading);
        assertThrows(UnsupportedOperationException.class, () -> reading.candidates().clear());
    }

    @Test
    void confidenceIsNullOffTheMeasuredRange() {
        AnalysisOptions wide = AnalysisOptions.DEFAULT.withTempoRange(TempoRange.of(80, 200));
        Reading reading = BpmAnalyzer.analyzeChannelData(kicks(120, 10), RATE, wide);
        assertNotNull(reading);
        assertNull(reading.confidence());

        assertNull(Calibration.calibrate(EngineName.PEAKS, 0.5, 89, TempoRange.DEFAULT));
        assertNull(Calibration.calibrate(EngineName.PEAKS, 0.5, 181, TempoRange.DEFAULT));
        assertNull(Calibration.calibrate(EngineName.PEAKS, 0.5, Double.NaN, TempoRange.DEFAULT));
        assertNotNull(Calibration.calibrate(EngineName.PEAKS, 0.5, 90, TempoRange.DEFAULT));
        assertNotNull(Calibration.calibrate(EngineName.PEAKS, 0.5, 180, TempoRange.DEFAULT));
        // A score that is not a number reads as the bottom of the table
        assertEquals(Calibration.calibrate(EngineName.TEMPOGRAM, 0, 120, TempoRange.DEFAULT),
            Calibration.calibrate(EngineName.TEMPOGRAM, Double.NaN, 120, TempoRange.DEFAULT));
        assertEquals(Calibration.calibrate(EngineName.TEMPOGRAM, 0, 120, TempoRange.DEFAULT),
            Calibration.calibrate(EngineName.TEMPOGRAM, Double.POSITIVE_INFINITY, 120, TempoRange.DEFAULT));
    }

    @Test
    void readsNothingInSilenceOrInShortAudio() {
        assertNull(BpmAnalyzer.analyzeChannelData(new float[(int) (10 * RATE)], RATE));
        assertNull(BpmAnalyzer.analyzeChannelData(new float[(int) (10 * RATE)], RATE,
            AnalysisOptions.DEFAULT.withEngine(Engine.PEAKS)));
        assertNull(BpmAnalyzer.analyzeChannelData(kicks(120, 1.4), RATE));
    }

    @Test
    void refusesUnusableInput() {
        assertThrowsExactly(IllegalArgumentException.class, () -> BpmAnalyzer.analyzeChannelData(new float[0], RATE));
        assertThrowsExactly(NullPointerException.class, () -> BpmAnalyzer.analyzeChannelData(null, RATE));
        assertThrowsExactly(NullPointerException.class,
            () -> BpmAnalyzer.analyzeChannelData(new float[1], RATE, null));
        assertThrowsExactly(NullPointerException.class, () -> AnalysisOptions.DEFAULT.withEngine(null));
        assertThrowsExactly(NullPointerException.class, () -> AnalysisOptions.DEFAULT.withTempoRange(null));
        assertThrowsExactly(NullPointerException.class, () -> Engine.peaks(null));
    }

    @Test
    void refusesANanOrInfiniteSample() {
        for (float value : new float[] {Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY}) {
            float[] samples = new float[1000];
            samples[999] = value;
            for (AnalysisOptions options : new AnalysisOptions[] {
                AnalysisOptions.DEFAULT, AnalysisOptions.DEFAULT.withEngine(Engine.PEAKS)}) {
                IllegalArgumentException thrown = assertThrowsExactly(IllegalArgumentException.class,
                    () -> BpmAnalyzer.analyzeChannelData(samples, RATE, options));
                assertTrue(thrown.getMessage().contains("sample 999"), thrown.getMessage());
            }
        }
    }

    @Test
    void refusesSampleRatesTheEnginesCannotRun() {
        float[] samples = new float[1000];
        AnalysisOptions peaks = AnalysisOptions.DEFAULT.withEngine(Engine.PEAKS);
        for (double rate : new double[] {Double.NaN, Double.POSITIVE_INFINITY, 0, -44_100, 99.9}) {
            assertThrowsExactly(OutOfRangeException.class, () -> BpmAnalyzer.analyzeChannelData(samples, rate));
        }
        // The cutoff must sit under Nyquist: 400 Hz has none above 200
        for (double rate : new double[] {Double.NaN, Double.NEGATIVE_INFINITY, 0, -1, 400}) {
            assertThrowsExactly(OutOfRangeException.class,
                () -> BpmAnalyzer.analyzeChannelData(samples, rate, peaks));
        }
        assertThrowsExactly(OutOfRangeException.class, () -> TempogramEngine.fftSize(7e10));
        assertEquals(1 << 30, TempogramEngine.fftSize(4e10));
        assertEquals(1024, TempogramEngine.fftSize(RATE));
    }

    @Test
    void refusesInvalidOptionsWhenTheyAreMade() {
        double[][] ranges = {
            {0, 180}, {-90, 180}, {Double.NaN, 180}, {90, Double.POSITIVE_INFINITY}, {90, 179.9},
            {1, (double) Integer.MAX_VALUE + 1}, {1e-306, 1000},
        };
        for (double[] range : ranges) {
            assertThrowsExactly(OutOfRangeException.class, () -> TempoRange.of(range[0], range[1]));
        }
        assertEquals(TempoRange.of(1, Integer.MAX_VALUE).max(), Integer.MAX_VALUE);
        assertEquals(TempoRange.of(1e-305, 1000).min(), 1e-305);

        double[][] lowpasses = {
            {0, 1}, {-1, 1}, {1e-46, 1}, {Double.NaN, 1}, {Double.POSITIVE_INFINITY, 1},
            {200, Lowpass.MIN_Q - 1}, {200, Lowpass.MAX_Q + 1}, {200, Double.NaN},
        };
        for (double[] lowpass : lowpasses) {
            assertThrowsExactly(OutOfRangeException.class, () -> Lowpass.of(lowpass[0], lowpass[1]));
        }
        assertEquals(Lowpass.of(150, 1), Lowpass.DEFAULT.withFrequency(150));
        assertEquals(Lowpass.of(200, 3), Lowpass.DEFAULT.withQ(3));
    }

    /** Under 2 Hz the skip after a peak rounds to no sample, so the peaks engine refuses the rate, as JS does. */
    @Test
    void peaksEngineRefusesARateUnderTwoHertz() {
        float[] samples = new float[200];
        for (int i = 0; i < samples.length; i += 2) {
            samples[i] = 0.99f;
        }
        AnalysisOptions options = AnalysisOptions.DEFAULT.withEngine(Engine.peaks(Lowpass.of(0.2, 1)));
        for (double rate : new double[] {1.99, 1, 0.5}) {
            OutOfRangeException thrown = assertThrowsExactly(OutOfRangeException.class,
                () -> BpmAnalyzer.analyzeChannelData(samples, rate, options));
            assertTrue(thrown.getMessage().contains("at least 2.0 Hz"), thrown.getMessage());
        }
        assertTimeoutPreemptively(Duration.ofSeconds(10), () -> BpmAnalyzer.analyzeChannelData(samples, 2, options));
    }

    @Test
    void relationsFollowTheJsTolerance() {
        assertEquals(Relation.HALF, BpmAnalyzer.relationTo(120, 60));
        assertEquals(Relation.HALF, BpmAnalyzer.relationTo(120, 61));
        assertEquals(Relation.OTHER, BpmAnalyzer.relationTo(120, 62));
        assertEquals(Relation.DOUBLE, BpmAnalyzer.relationTo(90, 180));
        assertEquals(Relation.DOUBLE, BpmAnalyzer.relationTo(90, 177));
        assertEquals(Relation.OTHER, BpmAnalyzer.relationTo(90, 176));
        assertEquals(Relation.OTHER, BpmAnalyzer.relationTo(120, 130));
    }
}
