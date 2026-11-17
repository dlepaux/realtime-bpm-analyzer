using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using Xunit;
using Xunit.Abstractions;

namespace RealtimeBpmAnalyzer.Tests;

/// <summary>
/// The definition of done: every case of conformance/vectors.json, the readings the JS library gives, read the same
/// here within the tolerances the file states. Skipping a case is a failure, and so is a key nobody mapped.
/// </summary>
public sealed class ConformanceTests
{
    private readonly ITestOutputHelper output;

    public ConformanceTests(ITestOutputHelper output)
    {
        this.output = output;
    }

    [Fact]
    public void Every_case_reads_as_the_JS_reference()
    {
        string dir = Vectors.ConformanceDir();
        JsonElement vectors = Vectors.Parse(File.ReadAllText(Path.Combine(dir, "vectors.json")));
        Assert.Empty(Vectors.CompareKeys(vectors, Vectors.FileKeys, "vectors.json"));
        Assert.Equal(2.0, Vectors.Number(vectors.GetProperty("schemaVersion"), "schemaVersion"));
        AssertPcmIsSixteenBitMono(vectors.GetProperty("pcm"));

        JsonElement tolerances = vectors.GetProperty("tolerances");
        Assert.Empty(Vectors.CompareKeys(tolerances, new[] { "bpmExact", "confidence" }, "tolerances"));
        double bpmExactTolerance = Tolerance(tolerances, "bpmExact");
        double confidenceTolerance = Tolerance(tolerances, "confidence");

        Dictionary<string, float[]> inputs = LoadInputs(dir, Vectors.Array(vectors.GetProperty("inputs"), "inputs"));
        Dictionary<string, float[]> pristine = inputs.ToDictionary(input => input.Key, input => (float[])input.Value.Clone());
        var failures = new List<string>();
        double bpmExactDeviation = 0;
        double confidenceDeviation = 0;
        int passed = 0;

        foreach (JsonElement testCase in Vectors.Array(vectors.GetProperty("cases"), "cases"))
        {
            string id = CaseId(testCase);
            var problems = new List<string>();
            try
            {
                problems.AddRange(Vectors.CompareKeys(testCase, Vectors.CaseKeys, "case"));
                Reading? actual = Analyze(inputs, testCase);
                JsonElement expected = Vectors.Get(testCase, "expected", "case");
                problems.AddRange(Vectors.Compare(expected, actual, bpmExactTolerance, confidenceTolerance));
                if (!Vectors.IsNull(expected) && actual is not null)
                {
                    bpmExactDeviation = Math.Max(
                        bpmExactDeviation,
                        Math.Abs(actual.BpmExact - Vectors.Number(expected.GetProperty("bpmExact"), "bpmExact")));
                    JsonElement confidence = expected.GetProperty("confidence");
                    if (!Vectors.IsNull(confidence) && actual.Confidence is double mine)
                    {
                        confidenceDeviation = Math.Max(
                            confidenceDeviation,
                            Math.Abs(mine - Vectors.Number(confidence, "confidence")));
                    }
                }
            }
            catch (Exception e)
            {
                // Any exception is that case's failure, reported by id, so one crash doesn't hide the other cases
                problems.Add($"threw {e.GetType().Name}: {e.Message}");
            }

            passed += Record(failures, id, problems);
        }

        foreach (JsonElement testCase in Vectors.Array(vectors.GetProperty("errorCases"), "errorCases"))
        {
            var problems = new List<string>();
            try
            {
                problems.AddRange(Vectors.CompareKeys(testCase, Vectors.ErrorCaseKeys, "error case"));
                Type expected = Vectors.ExceptionFor(Vectors.String(Vectors.Get(testCase, "expectedError", "error case"), "expectedError"));
                problems.AddRange(ErrorProblems(expected, inputs, testCase));
            }
            catch (Vectors.UnmappableException e)
            {
                problems.Add(e.Message);
            }

            passed += Record(failures, CaseId(testCase), problems);
        }

        // The cases share each input array, so a later case catches a write; this catches one in the last case too.
        // Counted apart from the cases, so "passed" and "failed" add up to the number of cases
        var inputFailures = inputs
            .Where(input => !pristine[input.Key].SequenceEqual(input.Value))
            .Select(input => $"FAIL input {input.Key}: an analysis wrote into its samples")
            .ToList();

        output.WriteLine(Summary(passed, failures.Count, inputFailures.Count, bpmExactDeviation, confidenceDeviation));
        var all = failures.Concat(inputFailures).ToList();
        Assert.True(all.Count == 0, $"{all.Count} conformance failures:\n{string.Join("\n", all)}");
        // Every case and error case of the file ran and passed: a loader that skipped some could not print PASS
        int total = vectors.GetProperty("cases").GetArrayLength() + vectors.GetProperty("errorCases").GetArrayLength();
        Assert.True(passed > 0 && passed == total, Vectors.Invariant($"{passed} of {total} cases passed"));
    }

    /// <summary>
    /// The line CI greps for its verdict. Cases and inputs are counted apart: an input written to fails the run
    /// without counting as a failed case. The deviations come from the cases that passed and failed alike, as the JS
    /// runners report them.
    /// </summary>
    internal static string Summary(int passed, int failed, int inputsWritten, double bpmExactDeviation, double confidenceDeviation)
    {
        string verdict = failed == 0 && inputsWritten == 0 && passed > 0 ? "PASS" : "FAIL";
        string written = inputsWritten == 0 ? string.Empty : $", {inputsWritten} input{(inputsWritten == 1 ? string.Empty : "s")} written to";
        return Vectors.Invariant(
            $"conformance: {verdict} on {RuntimeInformation.FrameworkDescription}: {passed} passed, {failed} failed{written}; largest difference from the reference: bpmExact {bpmExactDeviation:R}, confidence {confidenceDeviation:R}; bpm, candidates, confidence null-ness, audio and engine compared exactly");
    }

    private static string CaseId(JsonElement testCase) =>
        testCase.ValueKind == JsonValueKind.Object && testCase.TryGetProperty("id", out JsonElement id)
            ? id.ToString()
            : testCase.GetRawText();

    private static Reading? Analyze(Dictionary<string, float[]> inputs, JsonElement testCase) =>
        // Building the options is part of the call: a C# value type refuses a bad value when it is made
        BpmAnalyzer.AnalyzeChannelData(
            SamplesOf(inputs, testCase),
            Vectors.Number(Vectors.Get(testCase, "sampleRate", "case"), "sampleRate"),
            Vectors.Options(Vectors.Get(testCase, "options", "case")));

    private static List<string> ErrorProblems(Type expected, Dictionary<string, float[]> inputs, JsonElement testCase)
    {
        var problems = new List<string>();
        try
        {
            Analyze(inputs, testCase);
            problems.Add($"no exception, expected {expected.Name}");
        }
        catch (Vectors.UnmappableException)
        {
            throw;
        }
        catch (Exception e) when (e.GetType() != expected)
        {
            // Exactly the category's type: a subtype, or a crash such as a division error, has not validated the value
            problems.Add($"threw {e.GetType().Name}: {e.Message}, expected exactly {expected.Name}");
        }
        catch (Exception)
        {
            // The expected type
        }

        return problems;
    }

    private static int Record(List<string> failures, string id, List<string> problems)
    {
        if (problems.Count == 0)
        {
            return 1;
        }

        failures.Add($"FAIL {id}: {string.Join("; ", problems)}");
        return 0;
    }

    private static float[] SamplesOf(Dictionary<string, float[]> inputs, JsonElement testCase)
    {
        string input = Vectors.String(Vectors.Get(testCase, "input", "case"), "input");
        // The shared array, not a copy: an analysis that wrote into its input would fail the cases after it
        return inputs.TryGetValue(input, out float[]? samples) ? samples : throw new Vectors.UnmappableException($"no input {input}");
    }

    private static double Tolerance(JsonElement tolerances, string field)
    {
        JsonElement tolerance = tolerances.GetProperty(field);
        Assert.Empty(Vectors.CompareKeys(tolerance, new[] { "absolute", "referenceSpread" }, $"tolerances.{field}"));
        return Vectors.Number(tolerance.GetProperty("absolute"), $"tolerances.{field}.absolute");
    }

    private static void AssertPcmIsSixteenBitMono(JsonElement pcm)
    {
        Assert.Empty(Vectors.CompareKeys(pcm, new[] { "encoding", "channels", "compression", "divisor" }, "pcm"));
        Assert.Equal("signed 16-bit little-endian", pcm.GetProperty("encoding").GetString());
        Assert.Equal(1.0, pcm.GetProperty("channels").GetDouble());
        Assert.Equal("gzip", pcm.GetProperty("compression").GetString());
        Assert.Equal(32768.0, pcm.GetProperty("divisor").GetDouble());
    }

    private static Dictionary<string, float[]> LoadInputs(string dir, List<JsonElement> entries)
    {
        var inputs = new Dictionary<string, float[]>();
        foreach (JsonElement input in entries)
        {
            bool hasNonFinite = input.TryGetProperty("nonFinite", out JsonElement nonFinite);
            var keys = Vectors.Keys(input).Where(key => key != "nonFinite").OrderBy(key => key, StringComparer.Ordinal);
            Assert.Equal(Vectors.InputKeys.OrderBy(key => key, StringComparer.Ordinal), keys);
            string id = Vectors.String(input.GetProperty("id"), "input.id");
            byte[] bytes = Vectors.Gunzip(Path.Combine(dir, Vectors.String(input.GetProperty("file"), "input.file")));
            Assert.True(Vectors.String(input.GetProperty("sha256"), "input.sha256") == Vectors.Sha256(bytes), $"{id}: decompressed bytes");
            float[] samples = Vectors.DecodePcm16(bytes);
            Assert.True(Vectors.Number(input.GetProperty("samples"), "input.samples") == samples.Length, $"{id}: sample count");
            if (hasNonFinite)
            {
                Vectors.ApplyNonFinite(samples, nonFinite, id);
            }

            inputs.Add(id, samples);
        }

        return inputs;
    }
}
