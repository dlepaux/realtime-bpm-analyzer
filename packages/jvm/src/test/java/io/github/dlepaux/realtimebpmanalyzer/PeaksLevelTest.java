package io.github.dlepaux.realtimebpmanalyzer;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * The peaks engine's level-relative search at its edges, which the conformance inputs reach only in the middle: the percentile's
 * index, the windows' bounds, and the floor and full-scale guards.
 */
class PeaksLevelTest {
    /** One window a sample long per value, at 4 Hz, where a 0.25 s window is one sample. */
    private static float level(float... maxima) {
        return PeaksEngine.levelReference(maxima, 4);
    }

    @Test
    void takesTheMaximumAtTheFlooredPercentileIndex() {
        // 100 windows of 0.001 to 0.100: floor(99 * 98 / 100) = 97, the 98th value
        float[] hundred = new float[100];
        for (int i = 0; i < hundred.length; i++) {
            hundred[i] = (hundred.length - i) / 1000f;
        }
        assertEquals(98 / 1000f, level(hundred));
        // Two windows: floor(1 * 98 / 100) = 0, so the louder one never sets the level
        assertEquals(0.1f, level(0.9f, 0.1f));
        assertEquals(0.5f, level(0.5f));
    }

    @Test
    void countsOnlyPositiveSamplesAndAShorterLastWindow() {
        // At 8 Hz a window is two samples: [-0.9, 0.2], [0.3, -0.5], [0.4]
        assertEquals(0.3f, PeaksEngine.levelReference(new float[] {-0.9f, 0.2f, 0.3f, -0.5f, 0.4f}, 8));
        assertEquals(0f, PeaksEngine.levelReference(new float[] {-0.9f, -0.2f}, 8));
        assertEquals(0f, PeaksEngine.levelReference(new float[0], 8));
        // A NaN sample never becomes a window's maximum
        assertEquals(0.2f, PeaksEngine.levelReference(new float[] {Float.NaN, 0.2f}, 8));
    }

    @Test
    void comparesEachSampleWithTheScaledRungInDouble() {
        // conformance/readme.md, "The peaks level": a 32-bit threshold passes every vector, so this pins it. At 4 Hz a
        // window is one sample. The level is L, the first 32-bit float above 0.01 whose 0.9 * L rounds up when stored;
        // twelve samples hold that stored 0.9 * L, so they clear the double threshold 0.9 * L and rung 0.9 finds 15
        // peaks. A 32-bit threshold equals them and finds 3, so the search would go on to 0.85 and take sample 50 too
        float[] data = new float[100];
        java.util.Arrays.fill(data, 0, 3, Float.intBitsToFloat(0x3C23D70D));
        java.util.Arrays.fill(data, 10, 22, Float.intBitsToFloat(0x3C1374BF));
        data[50] = Float.intBitsToFloat(0x3C0E8A74);
        assertEquals(Float.intBitsToFloat(0x3C23D70D), PeaksEngine.levelReference(data, 4));
        assertArrayEquals(new int[] {0, 1, 2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21},
            PeaksEngine.findPeaksRelativeToLevel(data, 4));
    }

    @Test
    void comparesTheLevelWithTheSilenceFloorInDouble() {
        // The 32-bit float nearest -70 dBFS is just under the double floor, so it searches nothing; the next one up does
        float under = Float.intBitsToFloat(0x39A5CB5F);
        float over = Float.intBitsToFloat(0x39A5CB60);
        assertTrue(under < PeaksEngine.SILENCE_FLOOR && over > PeaksEngine.SILENCE_FLOOR);
        float[] quiet = new float[64];
        java.util.Arrays.fill(quiet, under);
        assertEquals(0, PeaksEngine.findPeaksRelativeToLevel(quiet, 4).length);
        java.util.Arrays.fill(quiet, over);
        assertEquals(64, PeaksEngine.findPeaksRelativeToLevel(quiet, 4).length);
    }

    @Test
    void searchesNothingUnderTheFloorOrAtFullScale() {
        float[] loud = new float[64];
        float[] underFloor = new float[64];
        for (int i = 0; i < loud.length; i++) {
            loud[i] = 1f;
            underFloor[i] = (float) (PeaksEngine.SILENCE_FLOOR * 0.99);
        }
        assertEquals(0, PeaksEngine.findPeaksRelativeToLevel(loud, 4).length);
        assertEquals(0, PeaksEngine.findPeaksRelativeToLevel(underFloor, 4).length);
    }

    @Test
    void readsAQuietPulseWithItsConfidenceUnmeasured() {
        // A one-sample click every 0.5 s at 1 kHz, 20 s, at -40 dBFS: the fixed ladder finds nothing in it
        float[] samples = new float[20_000];
        for (int i = 0; i < samples.length; i += 500) {
            samples[i] = 0.01f;
        }
        Reading reading = BpmAnalyzer.analyzeChannelData(samples, 1_000,
            AnalysisOptions.DEFAULT.withEngine(Engine.peaks(Lowpass.of(400, 1))));
        assertTrue(reading != null, "a reading");
        assertEquals(120, reading.bpm());
        assertNull(reading.confidence());
    }
}
