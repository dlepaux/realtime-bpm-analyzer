package io.github.dlepaux.realtimebpmanalyzer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The harness is the definition of done, so its own strictness is tested: each kind of mismatch must fail. */
class HarnessTest {
    private static final double TOLERANCE = 1e-6;
    private static final String EXPECTED = "{\"bpm\":120,\"bpmExact\":120.25,\"confidence\":0.5,"
        + "\"candidates\":[{\"bpm\":120,\"relation\":\"top\"},{\"bpm\":60,\"relation\":\"half\"}],"
        + "\"audio\":{\"from\":0,\"to\":10,\"contextTime\":null},\"engine\":\"tempogram\"}";

    private static Reading reading(int bpm, double exact, Double confidence, double from, Candidate... candidates) {
        return new Reading(bpm, exact, confidence, Arrays.asList(candidates), from, 10, EngineName.TEMPOGRAM);
    }

    private static Reading good() {
        return reading(120, 120.25, 0.5, 0, new Candidate(120, Relation.TOP), new Candidate(60, Relation.HALF));
    }

    private static List<String> compare(String expected, Reading actual) {
        return Vectors.compare(Json.parse(expected), actual, TOLERANCE, TOLERANCE);
    }

    @Test
    void passesTheMatchingReading() {
        assertEquals(Arrays.asList(), compare(EXPECTED, good()));
        assertEquals(Arrays.asList(), compare(EXPECTED, reading(120, 120.25 + 9e-7, 0.5 - 9e-7, 0,
            new Candidate(120, Relation.TOP), new Candidate(60, Relation.HALF))));
        assertEquals(Arrays.asList(), Vectors.compare(null, null, TOLERANCE, TOLERANCE));
    }

    @Test
    void failsEachMismatch() {
        Candidate top = new Candidate(120, Relation.TOP);
        Candidate half = new Candidate(60, Relation.HALF);
        assertFails(compare(EXPECTED, reading(121, 120.25, 0.5, 0, top, half)), "bpm");
        assertFails(compare(EXPECTED, reading(120, 120.25 + 2e-6, 0.5, 0, top, half)), "bpmExact");
        assertFails(compare(EXPECTED, reading(120, Double.NaN, 0.5, 0, top, half)), "bpmExact");
        assertFails(compare(EXPECTED, reading(120, 120.25, 0.5 + 2e-6, 0, top, half)), "confidence");
        assertFails(compare(EXPECTED, reading(120, 120.25, null, 0, top, half)), "confidence");
        assertFails(compare(EXPECTED.replace("\"confidence\":0.5", "\"confidence\":null"), good()), "confidence");
        // Exact means Object.is: -0 is not 0
        assertFails(compare(EXPECTED, reading(120, 120.25, 0.5, -0.0, top, half)), "audio.from");
        assertFails(compare(EXPECTED, reading(120, 120.25, 0.5, 0, top)), "candidates");
        assertFails(compare(EXPECTED, reading(120, 120.25, 0.5, 0, top, new Candidate(60, Relation.OTHER))),
            "candidates[1].relation");
        assertFails(compare(EXPECTED, reading(120, 120.25, 0.5, 0, top, new Candidate(61, Relation.HALF))),
            "candidates[1].bpm");
        assertFails(compare(EXPECTED.replace("tempogram", "peaks"), good()), "engine");
        assertFails(compare(EXPECTED.replace("\"contextTime\":null", "\"contextTime\":3"), good()),
            "audio.contextTime");
        assertFails(Vectors.compare(null, good(), TOLERANCE, TOLERANCE), "reading");
        assertFails(compare(EXPECTED, null), "reading");
    }

    @Test
    void failsOnAKeyNobodyMapped() {
        assertFails(compare(EXPECTED.replace("\"engine\":", "\"tag\":1,\"engine\":"), good()), "tag");
        assertFails(compare(EXPECTED.replace("\"from\":0,", "\"from\":0,\"until\":1,"), good()), "until");
        assertFails(compare(EXPECTED.replace("\"relation\":\"top\"", "\"relation\":\"top\",\"x\":1"), good()), "x");
        // A missing key throws, which the conformance test records as that case's failure
        assertThrows(Vectors.Unmappable.class,
            () -> compare(EXPECTED.replace("\"bpm\":120,\"bpmExact\"", "\"bpmExact\""), good()));

        assertThrows(Vectors.Unmappable.class, () -> options("{\"engine\":\"tempogram\",\"debug\":true}"));
        assertThrows(Vectors.Unmappable.class, () -> options("{\"engine\":\"onsets\"}"));
        assertThrows(Vectors.Unmappable.class, () -> options("{\"engine\":{\"name\":\"peaks\",\"gain\":1}}"));
        assertThrows(Vectors.Unmappable.class,
            () -> options("{\"engine\":{\"name\":\"peaks\",\"lowpass\":{\"type\":\"lowpass\"}}}"));
        assertThrows(Vectors.Unmappable.class, () -> options("{\"tempoRange\":{\"min\":90}}"));
        assertThrows(Vectors.Unmappable.class, () -> Vectors.exceptionFor("TypeError"));
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{\"a\":1,\"a\":2}"));
    }

    @Test
    void mapsTheOptionsAsJsReadsThem() {
        assertEquals(AnalysisOptions.DEFAULT, options("{}"));
        assertEquals(AnalysisOptions.DEFAULT.withEngine(Engine.PEAKS), options("{\"engine\":\"peaks\"}"));
        assertEquals(AnalysisOptions.DEFAULT.withEngine(Engine.peaks(Lowpass.of(150, 1))),
            options("{\"engine\":{\"name\":\"peaks\",\"lowpass\":{\"frequency\":150}}}"));
        assertEquals(AnalysisOptions.DEFAULT.withTempoRange(TempoRange.of(60, 200)),
            options("{\"tempoRange\":{\"min\":60,\"max\":200}}"));
    }

    private static AnalysisOptions options(String json) {
        return Vectors.options(Vectors.object(Json.parse(json), "options"));
    }

    private static void assertFails(List<String> failures, String field) {
        assertTrue(failures.stream().anyMatch(failure -> failure.contains(field)),
            "expected a failure on " + field + ", got " + failures);
    }

    @Test
    void equalReadingsAreEqual() {
        Map<String, Object> parsed = Vectors.object(Json.parse(EXPECTED), "expected");
        assertEquals(6, parsed.size());
        assertEquals(good(), good());
        assertEquals(good().hashCode(), good().hashCode());
    }
}
