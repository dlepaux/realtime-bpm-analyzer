using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Xunit;

namespace RealtimeBpmAnalyzer.Tests;

/// <summary>The harness itself: it must fail every mismatch the readme names, and every key nobody mapped.</summary>
public sealed class HarnessTests
{
    private const double Tolerance = 1e-6;

    private const string Expected = "{\"bpm\":120,\"bpmExact\":120.25,\"confidence\":0.5,"
        + "\"candidates\":[{\"bpm\":120,\"relation\":\"top\"},{\"bpm\":60,\"relation\":\"half\"}],"
        + "\"audio\":{\"from\":0,\"to\":10,\"contextTime\":null},\"engine\":\"tempogram\"}";

    private static readonly Candidate Top = new(120, Relation.Top);
    private static readonly Candidate HalfOf = new(60, Relation.Half);

    private static Reading MakeReading(int bpm, double exact, double? confidence, double from, params Candidate[] candidates) =>
        new(bpm, exact, confidence, candidates, from, 10, EngineName.Tempogram);

    private static Reading Good() => MakeReading(120, 120.25, 0.5, 0, Top, HalfOf);

    private static List<string> Compare(string expected, Reading? actual) =>
        Vectors.Compare(Vectors.Parse(expected), actual, Tolerance, Tolerance);

    private static AnalysisOptions Options(string json) => Vectors.Options(Vectors.Parse(json));

    private static void AssertFails(List<string> failures, string field) =>
        Assert.True(failures.Any(failure => failure.Contains(field, StringComparison.Ordinal)), $"expected a failure on {field}, got [{string.Join("; ", failures)}]");

    [Fact]
    public void Passes_the_matching_reading()
    {
        Assert.Empty(Compare(Expected, Good()));
        Assert.Empty(Compare(Expected, MakeReading(120, 120.25 + 9e-7, 0.5 - 9e-7, 0, Top, HalfOf)));
        Assert.Empty(Compare("null", null));
    }

    [Fact]
    public void Fails_each_mismatch()
    {
        AssertFails(Compare(Expected, MakeReading(121, 120.25, 0.5, 0, Top, HalfOf)), "bpm");
        AssertFails(Compare(Expected, MakeReading(120, 120.25 + 2e-6, 0.5, 0, Top, HalfOf)), "bpmExact");
        AssertFails(Compare(Expected, MakeReading(120, double.NaN, 0.5, 0, Top, HalfOf)), "bpmExact");
        AssertFails(Compare(Expected, MakeReading(120, 120.25, 0.5 + 2e-6, 0, Top, HalfOf)), "confidence");
        AssertFails(Compare(Expected, MakeReading(120, 120.25, null, 0, Top, HalfOf)), "confidence");
        AssertFails(Compare(Expected.Replace("\"confidence\":0.5", "\"confidence\":null", StringComparison.Ordinal), Good()), "confidence");
        // Exact means Object.is: -0 is not 0
        AssertFails(Compare(Expected, MakeReading(120, 120.25, 0.5, -0.0, Top, HalfOf)), "audio.from");
        AssertFails(Compare(Expected, MakeReading(120, 120.25, 0.5, 0, Top)), "candidates");
        AssertFails(Compare(Expected, MakeReading(120, 120.25, 0.5, 0, Top, new Candidate(60, Relation.Other))), "candidates[1].relation");
        AssertFails(Compare(Expected, MakeReading(120, 120.25, 0.5, 0, Top, new Candidate(61, Relation.Half))), "candidates[1].bpm");
        AssertFails(Compare(Expected.Replace("tempogram", "peaks", StringComparison.Ordinal), Good()), "engine");
        AssertFails(Compare(Expected.Replace("\"contextTime\":null", "\"contextTime\":3", StringComparison.Ordinal), Good()), "audio.contextTime");
        AssertFails(Compare("null", Good()), "reading");
        AssertFails(Compare(Expected, null), "reading");
    }

    [Fact]
    public void Fails_on_a_key_nobody_mapped()
    {
        AssertFails(Compare(Expected.Replace("\"engine\":", "\"tag\":1,\"engine\":", StringComparison.Ordinal), Good()), "tag");
        AssertFails(Compare(Expected.Replace("\"from\":0,", "\"from\":0,\"until\":1,", StringComparison.Ordinal), Good()), "until");
        AssertFails(Compare(Expected.Replace("\"relation\":\"top\"", "\"relation\":\"top\",\"x\":1", StringComparison.Ordinal), Good()), "x");
        // A missing key throws, which the conformance test records as that case's failure
        Assert.Throws<Vectors.UnmappableException>(() => Compare(Expected.Replace("\"bpm\":120,\"bpmExact\"", "\"bpmExact\"", StringComparison.Ordinal), Good()));

        Assert.Throws<Vectors.UnmappableException>(() => Options("{\"engine\":\"tempogram\",\"debug\":true}"));
        Assert.Throws<Vectors.UnmappableException>(() => Options("{\"engine\":\"onsets\"}"));
        Assert.Throws<Vectors.UnmappableException>(() => Options("{\"engine\":{\"name\":\"peaks\",\"gain\":1}}"));
        Assert.Throws<Vectors.UnmappableException>(() => Options("{\"engine\":{\"name\":\"tempogram\"}}"));
        Assert.Throws<Vectors.UnmappableException>(() => Options("{\"engine\":{\"name\":\"peaks\",\"lowpass\":{\"type\":\"lowpass\"}}}"));
        Assert.Throws<Vectors.UnmappableException>(() => Options("{\"tempoRange\":{\"min\":90}}"));
        Assert.Throws<Vectors.UnmappableException>(() => Options("{\"tempoRange\":{\"min\":90,\"max\":\"180\"}}"));
        Assert.Throws<Vectors.UnmappableException>(() => Vectors.ExceptionFor("TypeError"));
        Assert.ThrowsAny<JsonException>(() => Vectors.Parse("{\"a\":1,\"a\":2}"));
    }

    [Fact]
    public void Maps_the_options_as_JS_reads_them()
    {
        Assert.Equal(AnalysisOptions.Default, Options("{}"));
        Assert.Equal(new AnalysisOptions(Engine.Peaks), Options("{\"engine\":\"peaks\"}"));
        Assert.Equal(new AnalysisOptions(Engine.Peaks), Options("{\"engine\":{\"name\":\"peaks\"}}"));
        Assert.Equal(new AnalysisOptions(Engine.PeaksWith(new Lowpass(150, 1))), Options("{\"engine\":{\"name\":\"peaks\",\"lowpass\":{\"frequency\":150}}}"));
        Assert.Equal(new AnalysisOptions(tempoRange: new TempoRange(60, 200)), Options("{\"tempoRange\":{\"min\":60,\"max\":200}}"));
    }

    [Fact]
    public void Maps_each_error_category_to_one_exception_type()
    {
        Assert.Equal(typeof(ArgumentException), Vectors.ExceptionFor("Error"));
        Assert.Equal(typeof(ArgumentOutOfRangeException), Vectors.ExceptionFor("RangeError"));
    }

    [Fact]
    public void Decodes_PCM_as_the_readme_says()
    {
        Assert.Equal(new[] { 0f, -1f, 32767 / 32768f, 1 / 32768f }, Vectors.DecodePcm16(new byte[] { 0, 0, 0, 0x80, 0xff, 0x7f, 1, 0 }));
        Assert.Throws<Vectors.UnmappableException>(() => Vectors.DecodePcm16(new byte[3]));

        var samples = new float[4];
        Vectors.ApplyNonFinite(samples, Vectors.Parse("[{\"index\":1,\"value\":\"NaN\"},{\"index\":3,\"value\":\"-Infinity\"}]"), "x");
        Assert.True(float.IsNaN(samples[1]) && float.IsNegativeInfinity(samples[3]) && samples[0] == 0);
        Assert.Throws<Vectors.UnmappableException>(() => Vectors.ApplyNonFinite(samples, Vectors.Parse("[{\"index\":4,\"value\":\"NaN\"}]"), "x"));
        Assert.Throws<Vectors.UnmappableException>(() => Vectors.ApplyNonFinite(samples, Vectors.Parse("[{\"index\":0,\"value\":\"nan\"}]"), "x"));
    }

    [Fact]
    public void Equal_readings_are_equal()
    {
        Assert.Equal(6, Vectors.Keys(Vectors.Parse(Expected)).Count);
        Assert.Equal(Good(), Good());
        Assert.Equal(Good().GetHashCode(), Good().GetHashCode());
        Assert.NotEqual(Good(), MakeReading(120, 120.25, null, 0, Top, HalfOf));
    }

    // CI's grep reads the verdict from this line, and its counts add up to the cases: a written input is its own count
    [Fact]
    public void The_summary_counts_cases_and_written_inputs_apart()
    {
        string pass = ConformanceTests.Summary(171, 0, 0, 0, 0);
        Assert.StartsWith("conformance: PASS on .NET ", pass, StringComparison.Ordinal);
        Assert.Contains(": 171 passed, 0 failed; ", pass, StringComparison.Ordinal);
        string written = ConformanceTests.Summary(171, 0, 1, 0, 0);
        Assert.StartsWith("conformance: FAIL on .NET ", written, StringComparison.Ordinal);
        Assert.Contains(": 171 passed, 0 failed, 1 input written to; ", written, StringComparison.Ordinal);
        Assert.Contains(": 140 passed, 8 failed, 2 inputs written to; ", ConformanceTests.Summary(140, 8, 2, 0, 0), StringComparison.Ordinal);
        Assert.StartsWith("conformance: FAIL", ConformanceTests.Summary(0, 0, 0, 0, 0), StringComparison.Ordinal);
    }
}
