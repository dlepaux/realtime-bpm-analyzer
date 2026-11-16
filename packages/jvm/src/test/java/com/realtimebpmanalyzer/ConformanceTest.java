package com.realtimebpmanalyzer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The definition of done: every case of ../../conformance/vectors.json, the readings the JS library gives, read the
 * same here within the tolerances the file states. Skipping a case is a failure, and so is a key nobody mapped.
 */
class ConformanceTest {
    private static File conformanceDir() {
        String configured = System.getProperty("conformance.dir");
        return new File(configured != null ? configured : "../../conformance");
    }

    @Test
    void everyCaseReadsAsTheJsReference() throws IOException {
        File dir = conformanceDir();
        Map<String, Object> vectors = Vectors.object(Json.parse(Vectors.read(new File(dir, "vectors.json"))), "root");
        assertEquals(Vectors.FILE_KEYS, vectors.keySet(), "vectors.json keys");
        assertEquals(1.0, vectors.get("schemaVersion"), "this harness reads schema version 1");
        assertPcmIsSixteenBitMono(Vectors.object(vectors.get("pcm"), "pcm"));

        Map<String, Object> tolerances = Vectors.object(vectors.get("tolerances"), "tolerances");
        assertEquals(Vectors.keys("bpmExact", "confidence"), tolerances.keySet(), "tolerances keys");
        double bpmExactTolerance = tolerance(tolerances, "bpmExact");
        double confidenceTolerance = tolerance(tolerances, "confidence");

        Map<String, float[]> inputs = loadInputs(dir, Vectors.array(vectors.get("inputs"), "inputs"));
        Map<String, float[]> pristine = new HashMap<String, float[]>();
        for (Map.Entry<String, float[]> input : inputs.entrySet()) {
            pristine.put(input.getKey(), input.getValue().clone());
        }
        List<String> failures = new ArrayList<String>();
        double bpmExactDeviation = 0;
        double confidenceDeviation = 0;
        int passed = 0;

        for (Object entry : Vectors.array(vectors.get("cases"), "cases")) {
            Map<String, Object> testCase = Vectors.object(entry, "case");
            String id = String.valueOf(testCase.get("id"));
            List<String> problems = new ArrayList<String>(Vectors.compareKeys(testCase, Vectors.CASE_KEYS, "case"));
            Reading actual = null;
            try {
                actual = BpmAnalyzer.analyzeChannelData(samplesOf(inputs, testCase),
                    Vectors.number(testCase.get("sampleRate"), "sampleRate"),
                    Vectors.options(Vectors.object(testCase.get("options"), "options")));
                problems.addAll(Vectors.compare(testCase.get("expected"), actual, bpmExactTolerance,
                    confidenceTolerance));
            } catch (RuntimeException e) {
                problems.add("threw " + e);
            }

            Object expected = testCase.get("expected");
            if (expected != null && actual != null) {
                Map<String, Object> reading = Vectors.object(expected, "expected");
                bpmExactDeviation = Math.max(bpmExactDeviation,
                    Math.abs(actual.bpmExact() - Vectors.number(reading.get("bpmExact"), "bpmExact")));
                if (reading.get("confidence") != null && actual.confidence() != null) {
                    confidenceDeviation = Math.max(confidenceDeviation,
                        Math.abs(actual.confidence() - Vectors.number(reading.get("confidence"), "confidence")));
                }
            }
            passed += record(failures, id, problems);
        }

        for (Object entry : Vectors.array(vectors.get("errorCases"), "errorCases")) {
            Map<String, Object> testCase = Vectors.object(entry, "error case");
            String id = String.valueOf(testCase.get("id"));
            List<String> problems = new ArrayList<String>(
                Vectors.compareKeys(testCase, Vectors.ERROR_CASE_KEYS, "error case"));
            try {
                Class<? extends Throwable> expected = Vectors.exceptionFor(
                    Vectors.string(testCase.get("expectedError"), "expectedError"));
                problems.addAll(errorProblems(expected, inputs, testCase));
            } catch (Vectors.Unmappable e) {
                problems.add(e.getMessage());
            }
            passed += record(failures, id, problems);
        }

        // The cases share each input array, so a later case catches a write; this catches one in the last case too
        for (Map.Entry<String, float[]> input : inputs.entrySet()) {
            if (!Arrays.equals(pristine.get(input.getKey()), input.getValue())) {
                failures.add("FAIL input " + input.getKey() + ": an analysis wrote into its samples");
            }
        }

        // The deviations come from the cases that passed and failed alike, as the JS runners report them
        String verdict = failures.isEmpty() && passed > 0 ? "PASS" : "FAIL";
        System.out.println("conformance: " + verdict + " on Java " + System.getProperty("java.version") + ": "
            + passed + " passed, " + failures.size() + " failed; largest difference from the reference: bpmExact "
            + bpmExactDeviation + ", confidence " + confidenceDeviation
            + "; bpm, candidates, confidence null-ness, audio and engine compared exactly");
        if (!failures.isEmpty()) {
            fail(failures.size() + " conformance failures:\n" + String.join("\n", failures));
        }
        assertTrue(passed > 0, "no case ran");
    }

    private static List<String> errorProblems(Class<? extends Throwable> expected, Map<String, float[]> inputs,
                                              Map<String, Object> testCase) {
        List<String> problems = new ArrayList<String>();
        Throwable thrown = null;
        try {
            // Building the options is part of the call: a Java value type refuses a bad value when it is made
            BpmAnalyzer.analyzeChannelData(samplesOf(inputs, testCase),
                Vectors.number(testCase.get("sampleRate"), "sampleRate"),
                Vectors.options(Vectors.object(testCase.get("options"), "options")));
        } catch (Vectors.Unmappable e) {
            problems.add(e.getMessage());
            return problems;
        } catch (RuntimeException e) {
            thrown = e;
        }
        if (thrown == null) {
            problems.add("no exception, expected " + expected.getSimpleName());
        } else if (thrown.getClass() != expected) {
            problems.add("threw " + thrown + ", expected exactly " + expected.getSimpleName());
        }
        return problems;
    }

    private static int record(List<String> failures, String id, List<String> problems) {
        if (problems.isEmpty()) {
            return 1;
        }
        failures.add("FAIL " + id + ": " + String.join("; ", problems));
        return 0;
    }

    private static float[] samplesOf(Map<String, float[]> inputs, Map<String, Object> testCase) {
        String input = Vectors.string(testCase.get("input"), "input");
        float[] samples = inputs.get(input);
        if (samples == null) {
            throw new Vectors.Unmappable("no input " + input);
        }
        // The shared array, not a copy: an analysis that wrote into its input would fail the cases after it
        return samples;
    }

    private static double tolerance(Map<String, Object> tolerances, String field) {
        Map<String, Object> tolerance = Vectors.object(tolerances.get(field), "tolerances." + field);
        assertEquals(Vectors.keys("absolute", "referenceSpread"), tolerance.keySet(), "tolerances." + field);
        return Vectors.number(tolerance.get("absolute"), "tolerances." + field + ".absolute");
    }

    private static void assertPcmIsSixteenBitMono(Map<String, Object> pcm) {
        Map<String, Object> expected = new LinkedHashMap<String, Object>();
        expected.put("encoding", "signed 16-bit little-endian");
        expected.put("channels", 1.0);
        expected.put("compression", "gzip");
        expected.put("divisor", 32768.0);
        assertEquals(expected, pcm, "the pcm encoding this harness decodes");
    }

    private static Map<String, float[]> loadInputs(File dir, List<Object> entries) throws IOException {
        Map<String, float[]> inputs = new HashMap<String, float[]>();
        for (Object entry : entries) {
            Map<String, Object> input = Vectors.object(entry, "input");
            assertEquals(Vectors.INPUT_KEYS, input.keySet(), "input keys");
            String id = Vectors.string(input.get("id"), "input.id");
            byte[] bytes = Vectors.gunzip(new File(dir, Vectors.string(input.get("file"), "input.file")));
            assertEquals(input.get("sha256"), Vectors.sha256(bytes), id + ": decompressed bytes");
            float[] samples = Vectors.decodePcm16(bytes);
            assertEquals(Vectors.number(input.get("samples"), "input.samples"), (double) samples.length,
                id + ": sample count");
            inputs.put(id, samples);
        }
        return inputs;
    }
}
