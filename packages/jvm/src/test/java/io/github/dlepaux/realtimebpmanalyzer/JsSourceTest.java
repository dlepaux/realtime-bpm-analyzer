package io.github.dlepaux.realtimebpmanalyzer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The constants the port copies from the JS sources, read back from those sources: a regenerated calibration table
 * or a new default fails here by name, not only through a conformance case that happens to reach it.
 */
class JsSourceTest {
    private static String source(String path) throws IOException {
        String configured = System.getProperty("js.source.dir");
        return Vectors.read(new File(configured != null ? configured : "../realtime-bpm-analyzer/src", path));
    }

    private static double constant(String source, String declaration) {
        Matcher matcher = Pattern.compile(Pattern.quote(declaration) + "\\s*=\\s*(-?[0-9.]+);").matcher(source);
        assertTrue(matcher.find(), "no " + declaration + " in the JS source");
        return Double.parseDouble(matcher.group(1));
    }

    @Test
    void defaultsAreTheJsLibrarys() throws IOException {
        String consts = source("core/consts.ts");
        assertEquals(constant(consts, "export const minBpmRange"), TempoRange.DEFAULT.min());
        assertEquals(constant(consts, "export const maxBpmRange"), TempoRange.DEFAULT.max());
        assertEquals(constant(consts, "export const lowpassFrequency"), Lowpass.DEFAULT.frequency());
        assertEquals(constant(consts, "export const lowpassQ"), Lowpass.DEFAULT.q());
        // RBA-221's level-relative search, which only the vectors' quiet inputs reach
        assertEquals(constant(consts, "export const levelPercentile"), PeaksEngine.LEVEL_PERCENTILE);
        assertEquals(constant(consts, "export const silenceFloor"), PeaksEngine.SILENCE_FLOOR);
        assertEquals(constant(consts, "export const tempogramMinSampleRate"), TempogramEngine.MIN_SAMPLE_RATE);

        String lowpass = source("core/lowpass.ts");
        assertEquals(constant(lowpass, "const qMin"), Lowpass.MIN_Q);
        assertEquals(constant(lowpass, "const qMax"), Lowpass.MAX_Q);

        assertTrue(source("core/engine.ts").contains("export const defaultEngine: EngineName = 'tempogram';"));
        assertEquals(Engine.TEMPOGRAM, AnalysisOptions.DEFAULT.engine());
        assertEquals(Engine.PEAKS, Engine.peaks(Lowpass.DEFAULT));
    }

    /** Every table of calibration.ts, by engine then name, in file order. */
    private static Map<String, List<double[]>> jsTables() throws IOException {
        String source = source("core/calibration.ts");
        String body = source.substring(source.indexOf("export const CALIBRATION"));
        Matcher table = Pattern.compile("(\\w+): \\[((?:\\s*\\[[^\\]]*\\],?)+)\\s*\\]").matcher(body);
        Pattern point = Pattern.compile("\\[([0-9.]+), ([0-9.]+)\\]");
        Map<String, List<double[]>> tables = new LinkedHashMap<String, List<double[]>>();
        int peaksAt = body.indexOf("peaks: {");
        while (table.find()) {
            List<double[]> points = new ArrayList<double[]>();
            Matcher pair = point.matcher(table.group(2));
            while (pair.find()) {
                points.add(new double[] {Double.parseDouble(pair.group(1)), Double.parseDouble(pair.group(2))});
            }
            String engine = table.start() < peaksAt ? "tempogram" : "peaks";
            tables.put(engine + "." + table.group(1), points);
        }
        return tables;
    }

    @Test
    void calibrationReadsTheJsTables() throws IOException {
        Map<String, List<double[]>> tables = jsTables();
        assertEquals(Vectors.keys("tempogram.all", "tempogram.from140", "tempogram.from165", "peaks.all",
            "peaks.from90", "peaks.from140", "peaks.from165"), tables.keySet(), "the tables of calibration.ts");

        // The bpm that picks each table: the tempogram has no band under 140, and peaks' shared table is never read
        assertCalibrationReads(EngineName.TEMPOGRAM, 100, tables.get("tempogram.all"));
        assertCalibrationReads(EngineName.TEMPOGRAM, 150, tables.get("tempogram.from140"));
        assertCalibrationReads(EngineName.TEMPOGRAM, 170, tables.get("tempogram.from165"));
        assertCalibrationReads(EngineName.PEAKS, 100, tables.get("peaks.from90"));
        assertCalibrationReads(EngineName.PEAKS, 150, tables.get("peaks.from140"));
        assertCalibrationReads(EngineName.PEAKS, 170, tables.get("peaks.from165"));
    }

    /** At every point and between every two, the port reads what the JS table interpolates to. */
    private static void assertCalibrationReads(EngineName engine, double bpm, List<double[]> table) {
        assertEquals(20, table.size(), engine + " at " + bpm);
        for (int i = 0; i < table.size(); i++) {
            double[] point = table.get(i);
            assertEquals(point[1], Calibration.calibrate(engine, point[0], bpm, TempoRange.DEFAULT),
                engine + " at " + bpm + ", point " + i);
            if (i > 0) {
                double[] previous = table.get(i - 1);
                double raw = (previous[0] + point[0]) / 2;
                double expected = previous[1] + ((point[1] - previous[1]) * (raw - previous[0]) / (point[0] - previous[0]));
                assertEquals(expected, Calibration.calibrate(engine, raw, bpm, TempoRange.DEFAULT),
                    engine + " at " + bpm + ", between points " + (i - 1) + " and " + i);
            }
        }
        double[] first = table.get(0);
        double[] last = table.get(table.size() - 1);
        assertEquals(first[1], Calibration.calibrate(engine, 0, bpm, TempoRange.DEFAULT), "flat under the table");
        assertEquals(last[1], Calibration.calibrate(engine, 1, bpm, TempoRange.DEFAULT), "flat over the table");
    }
}
