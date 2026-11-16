package io.github.dlepaux.realtimebpmanalyzer;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

/**
 * The rules of ../../conformance/readme.md, for the JVM: how a case's options map to {@link AnalysisOptions}, how a
 * reading compares with the reference, and how an input decodes. Strict on both sides: a key the readme doesn't
 * define, in the vectors or in a reading, is a failure, never skipped.
 */
final class Vectors {
    static final Set<String> FILE_KEYS = keys("schemaVersion", "pcm", "tolerances", "inputs", "cases", "errorCases");
    static final Set<String> INPUT_KEYS = keys("id", "file", "sampleRate", "samples", "sha256", "description");
    static final Set<String> CASE_KEYS = keys("id", "input", "sampleRate", "options", "expected");
    static final Set<String> ERROR_CASE_KEYS = keys("id", "input", "sampleRate", "options", "expectedError", "why");
    static final Set<String> READING_KEYS = keys("audio", "bpm", "bpmExact", "candidates", "confidence", "engine");
    static final Set<String> AUDIO_KEYS = keys("contextTime", "from", "to");
    static final Set<String> CANDIDATE_KEYS = keys("bpm", "relation");
    static final Set<String> OPTION_KEYS = keys("engine", "tempoRange");
    static final Set<String> ENGINE_KEYS = keys("name", "lowpass");
    static final Set<String> LOWPASS_KEYS = keys("frequency", "q");
    static final Set<String> TEMPO_RANGE_KEYS = keys("min", "max");

    private Vectors() {
    }

    /** A case the harness can't run: an option it can't map. The readme makes that a failure. */
    static final class Unmappable extends RuntimeException {
        private static final long serialVersionUID = 1L;

        Unmappable(String message) {
            super(message);
        }
    }

    static Set<String> keys(String... names) {
        return new HashSet<String>(Arrays.asList(names));
    }

    /** Fails unless the object's keys are exactly {@code expected}. */
    static List<String> compareKeys(Map<String, Object> object, Set<String> expected, String path) {
        List<String> failures = new ArrayList<String>();
        if (!object.keySet().equals(expected)) {
            failures.add(path + ": keys " + object.keySet() + ", expected " + expected);
        }
        return failures;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> object(Object value, String path) {
        if (!(value instanceof Map)) {
            throw new Unmappable(path + ": not an object");
        }
        return (Map<String, Object>) value;
    }

    @SuppressWarnings("unchecked")
    static List<Object> array(Object value, String path) {
        if (!(value instanceof List)) {
            throw new Unmappable(path + ": not an array");
        }
        return (List<Object>) value;
    }

    static double number(Object value, String path) {
        if (!(value instanceof Double)) {
            throw new Unmappable(path + ": not a number");
        }
        return (Double) value;
    }

    static String string(Object value, String path) {
        if (!(value instanceof String)) {
            throw new Unmappable(path + ": not a string");
        }
        return (String) value;
    }

    /**
     * Maps a case's {@code options} to the Java API. Building the options may itself throw
     * {@link OutOfRangeException}, as the JS call would throw a RangeError: an error case counts that as the call's
     * error.
     */
    static AnalysisOptions options(Map<String, Object> options) {
        if (!OPTION_KEYS.containsAll(options.keySet())) {
            throw new Unmappable("options: unknown key in " + options.keySet());
        }
        AnalysisOptions mapped = AnalysisOptions.DEFAULT;
        if (options.containsKey("engine")) {
            mapped = mapped.withEngine(engine(options.get("engine")));
        }
        if (options.containsKey("tempoRange")) {
            Map<String, Object> range = object(options.get("tempoRange"), "options.tempoRange");
            if (!range.keySet().equals(TEMPO_RANGE_KEYS)) {
                throw new Unmappable("options.tempoRange: keys " + range.keySet());
            }
            mapped = mapped.withTempoRange(TempoRange.of(number(range.get("min"), "tempoRange.min"),
                number(range.get("max"), "tempoRange.max")));
        }
        return mapped;
    }

    private static Engine engine(Object value) {
        if ("tempogram".equals(value)) {
            return Engine.TEMPOGRAM;
        }
        if ("peaks".equals(value)) {
            return Engine.PEAKS;
        }
        Map<String, Object> engine = object(value, "options.engine");
        if (!ENGINE_KEYS.containsAll(engine.keySet()) || !"peaks".equals(engine.get("name"))) {
            throw new Unmappable("options.engine: " + engine);
        }
        Object lowpassValue = engine.get("lowpass");
        if (lowpassValue == null) {
            return Engine.PEAKS;
        }
        Map<String, Object> lowpass = object(lowpassValue, "options.engine.lowpass");
        if (!LOWPASS_KEYS.containsAll(lowpass.keySet())) {
            throw new Unmappable("options.engine.lowpass: unknown key in " + lowpass.keySet());
        }
        double frequency = lowpass.containsKey("frequency")
            ? number(lowpass.get("frequency"), "lowpass.frequency") : Lowpass.DEFAULT_FREQUENCY;
        double q = lowpass.containsKey("q") ? number(lowpass.get("q"), "lowpass.q") : Lowpass.DEFAULT_Q;
        return Engine.peaks(Lowpass.of(frequency, q));
    }

    /** JS's Object.is on numbers: 0 and -0 differ, NaN equals NaN. */
    static boolean same(double expected, double actual) {
        return Double.doubleToLongBits(expected) == Double.doubleToLongBits(actual);
    }

    private static void exact(List<String> failures, String path, double expected, double actual) {
        if (!same(expected, actual)) {
            failures.add(path + ": " + actual + ", expected " + expected);
        }
    }

    private static void within(List<String> failures, String path, double expected, double actual, double tolerance) {
        // NaN fails, as the negated comparison makes it
        if (!(Math.abs(actual - expected) <= tolerance)) {
            failures.add(path + ": " + actual + ", expected " + expected + " within " + tolerance);
        }
    }

    /**
     * Compares a reading with the reference under the readme's rules.
     *
     * @param expected The reference, or null for no tempo
     * @param actual The port's reading, or null for no tempo
     * @return One message per mismatch, empty on a pass
     */
    static List<String> compare(Object expected, Reading actual, double bpmExactTolerance, double confidenceTolerance) {
        List<String> failures = new ArrayList<String>();
        if (expected == null || actual == null) {
            if (expected != null || actual != null) {
                failures.add("reading: " + (actual == null ? "null" : "a reading") + ", expected "
                    + (expected == null ? "null" : "a reading"));
            }
            return failures;
        }

        Map<String, Object> reading = object(expected, "expected");
        failures.addAll(compareKeys(reading, READING_KEYS, "expected"));
        exact(failures, "bpm", number(reading.get("bpm"), "expected.bpm"), actual.bpm());
        within(failures, "bpmExact", number(reading.get("bpmExact"), "expected.bpmExact"), actual.bpmExact(),
            bpmExactTolerance);
        if (!actual.engine().id().equals(string(reading.get("engine"), "expected.engine"))) {
            failures.add("engine: " + actual.engine().id() + ", expected " + reading.get("engine"));
        }

        // null means unmeasured, never a small number: both null, or both numbers within tolerance
        Object confidence = reading.get("confidence");
        if (confidence == null || actual.confidence() == null) {
            if (confidence != null || actual.confidence() != null) {
                failures.add("confidence: " + actual.confidence() + ", expected " + confidence);
            }
        } else {
            within(failures, "confidence", number(confidence, "expected.confidence"), actual.confidence(),
                confidenceTolerance);
        }

        Map<String, Object> audio = object(reading.get("audio"), "expected.audio");
        failures.addAll(compareKeys(audio, AUDIO_KEYS, "expected.audio"));
        exact(failures, "audio.from", number(audio.get("from"), "audio.from"), actual.audioFrom());
        exact(failures, "audio.to", number(audio.get("to"), "audio.to"), actual.audioTo());
        // A whole-buffer analysis has no audio context: the port has no such field, and the reference must agree
        if (audio.get("contextTime") != null) {
            failures.add("audio.contextTime: null, expected " + audio.get("contextTime"));
        }

        List<Object> candidates = array(reading.get("candidates"), "expected.candidates");
        if (candidates.size() != actual.candidates().size()) {
            failures.add("candidates: " + actual.candidates().size() + " of them, expected " + candidates.size());
            return failures;
        }
        for (int i = 0; i < candidates.size(); i++) {
            Map<String, Object> candidate = object(candidates.get(i), "expected.candidates[" + i + "]");
            Candidate mine = actual.candidates().get(i);
            failures.addAll(compareKeys(candidate, CANDIDATE_KEYS, "candidates[" + i + "]"));
            exact(failures, "candidates[" + i + "].bpm", number(candidate.get("bpm"), "candidate.bpm"), mine.bpm());
            if (!mine.relation().id().equals(candidate.get("relation"))) {
                failures.add("candidates[" + i + "].relation: " + mine.relation().id() + ", expected "
                    + candidate.get("relation"));
            }
        }
        return failures;
    }

    /**
     * The exception type the port throws for a JS error category, per the readme: {@code Error} for unusable samples,
     * {@code RangeError} for a value out of range. Any other category has no mapping, and fails.
     */
    static Class<? extends Throwable> exceptionFor(String category) {
        if ("Error".equals(category)) {
            return IllegalArgumentException.class;
        }
        if ("RangeError".equals(category)) {
            return OutOfRangeException.class;
        }
        throw new Unmappable("expectedError: no mapping for " + category);
    }

    /** The decompressed bytes of an input file. */
    static byte[] gunzip(File file) throws IOException {
        InputStream in = new GZIPInputStream(new FileInputStream(file));
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[1 << 16];
            for (int read = in.read(buffer); read >= 0; read = in.read(buffer)) {
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        } finally {
            in.close();
        }
    }

    /** Mono signed 16-bit little-endian PCM, each sample divided by 32768: exact in a 32-bit float. */
    static float[] decodePcm16(byte[] bytes) {
        if (bytes.length % 2 != 0) {
            throw new IllegalArgumentException("PCM has an odd byte count: " + bytes.length);
        }
        ByteBuffer pcm = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        float[] samples = new float[bytes.length / 2];
        for (int i = 0; i < samples.length; i++) {
            samples[i] = pcm.getShort(2 * i) / 32768f;
        }
        return samples;
    }

    static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) {
                hex.append(String.format("%02x", b & 0xff));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String read(File file) throws IOException {
        InputStream in = new FileInputStream(file);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[1 << 16];
            for (int read = in.read(buffer); read >= 0; read = in.read(buffer)) {
                out.write(buffer, 0, read);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            in.close();
        }
    }
}
