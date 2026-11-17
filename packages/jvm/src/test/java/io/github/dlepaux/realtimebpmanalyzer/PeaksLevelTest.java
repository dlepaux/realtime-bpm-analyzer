package io.github.dlepaux.realtimebpmanalyzer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * RBA-221's level-relative search at its edges, which the conformance inputs reach only in the middle: the percentile's
 * index, the windows' bounds, and the floor and full-scale guards.
 */
class PeaksLevelTest {
    /** One window a sample long per value, at 4 Hz, where a 0.25 s window is one sample. */
    private static float level(float... maxima) {
        return PeaksEngine.levelReference(maxima, 4);
    }

    @Test
    void takesTheMaximumAtTheFlooredPercentileIndex() {
        // 100 windows of 1..100: floor(99 * 98 / 100) = 97, the 98th value
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
