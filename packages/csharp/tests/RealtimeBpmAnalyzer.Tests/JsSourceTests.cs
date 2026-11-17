using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Xunit;

namespace RealtimeBpmAnalyzer.Tests;

/// <summary>
/// The constants the port copies from the JS sources, read back from those sources: a regenerated calibration table
/// or a new default fails here by name, not only through a conformance case that happens to reach it.
/// </summary>
public sealed class JsSourceTests
{
    private static string Source(string path) => File.ReadAllText(Path.Combine(Vectors.JsSourceDir(), path));

    private static double Constant(string source, string declaration)
    {
        Match match = Regex.Match(source, Regex.Escape(declaration) + @"\s*=\s*(-?[0-9.]+);");
        Assert.True(match.Success, $"no {declaration} in the JS source");
        return double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
    }

    [Fact]
    public void Defaults_are_the_JS_librarys()
    {
        string consts = Source("core/consts.ts");
        Assert.Equal(Constant(consts, "export const minBpmRange"), TempoRange.Default.Min);
        Assert.Equal(Constant(consts, "export const maxBpmRange"), TempoRange.Default.Max);
        Assert.Equal(Constant(consts, "export const lowpassFrequency"), Lowpass.Default.Frequency);
        Assert.Equal(Constant(consts, "export const lowpassQ"), Lowpass.Default.Q);

        string lowpass = Source("core/lowpass.ts");
        // Lowpass.MinQ and MaxQ are constants, which xUnit wants on the expected side
        Assert.Equal(Lowpass.MinQ, Constant(lowpass, "const qMin"));
        Assert.Equal(Lowpass.MaxQ, Constant(lowpass, "const qMax"));

        // The tempogram's sample rate floor (RBA-261)
        Assert.Equal(TempogramEngine.MinSampleRate, Constant(consts, "export const tempogramMinSampleRate"));

        // The level-relative peaks search (RBA-221): the percentile of the window maxima, and the floor under which it reads silence
        Assert.Equal(PeaksEngine.LevelPercentile, Constant(consts, "export const levelPercentile"));
        Assert.Equal(PeaksEngine.SilenceFloor, Constant(consts, "export const silenceFloor"));

        Assert.Contains("export const defaultEngine: EngineName = 'tempogram';", Source("core/engine.ts"), StringComparison.Ordinal);
        Assert.Equal(Engine.Tempogram, AnalysisOptions.Default.Engine);
    }

    /// <summary>Every table of calibration.ts, by engine then name, in file order.</summary>
    private static Dictionary<string, List<double[]>> JsTables()
    {
        string source = Source("core/calibration.ts");
        string body = source.Substring(source.IndexOf("export const CALIBRATION", StringComparison.Ordinal));
        int peaksAt = body.IndexOf("peaks: {", StringComparison.Ordinal);
        var tables = new Dictionary<string, List<double[]>>();
        foreach (Match table in Regex.Matches(body, @"(\w+): \[((?:\s*\[[^\]]*\],?)+)\s*\]"))
        {
            List<double[]> points = Regex.Matches(table.Groups[2].Value, @"\[([0-9.]+), ([0-9.]+)\]")
                .Select(pair => new[]
                {
                    double.Parse(pair.Groups[1].Value, CultureInfo.InvariantCulture),
                    double.Parse(pair.Groups[2].Value, CultureInfo.InvariantCulture),
                })
                .ToList();
            string engine = table.Index < peaksAt ? "tempogram" : "peaks";
            tables.Add($"{engine}.{table.Groups[1].Value}", points);
        }

        return tables;
    }

    [Fact]
    public void Calibration_reads_the_JS_tables()
    {
        Dictionary<string, List<double[]>> tables = JsTables();
        Assert.Equal(
            new[] { "peaks.all", "peaks.from140", "peaks.from165", "peaks.from90", "tempogram.all", "tempogram.from140", "tempogram.from165" },
            tables.Keys.OrderBy(key => key, StringComparer.Ordinal));

        // The bpm that picks each table: the tempogram has no band under 140, and peaks' shared table is never read
        AssertCalibrationReads(EngineName.Tempogram, 100, tables["tempogram.all"]);
        AssertCalibrationReads(EngineName.Tempogram, 150, tables["tempogram.from140"]);
        AssertCalibrationReads(EngineName.Tempogram, 170, tables["tempogram.from165"]);
        AssertCalibrationReads(EngineName.Peaks, 100, tables["peaks.from90"]);
        AssertCalibrationReads(EngineName.Peaks, 150, tables["peaks.from140"]);
        AssertCalibrationReads(EngineName.Peaks, 170, tables["peaks.from165"]);
    }

    /// <summary>At every point and between every two, the port reads what the JS table interpolates to.</summary>
    private static void AssertCalibrationReads(EngineName engine, double bpm, List<double[]> table)
    {
        Assert.Equal(20, table.Count);
        for (int i = 0; i < table.Count; i++)
        {
            double[] point = table[i];
            Assert.Equal(point[1], Calibration.Calibrate(engine, point[0], bpm, TempoRange.Default));
            if (i > 0)
            {
                double[] previous = table[i - 1];
                double raw = (previous[0] + point[0]) / 2;
                double expected = previous[1] + ((point[1] - previous[1]) * (raw - previous[0]) / (point[0] - previous[0]));
                Assert.Equal(expected, Calibration.Calibrate(engine, raw, bpm, TempoRange.Default));
            }
        }

        Assert.Equal(table[0][1], Calibration.Calibrate(engine, 0, bpm, TempoRange.Default));
        Assert.Equal(table[^1][1], Calibration.Calibrate(engine, 1, bpm, TempoRange.Default));
    }
}
