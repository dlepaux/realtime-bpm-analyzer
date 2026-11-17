using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

namespace RealtimeBpmAnalyzer.Tests;

/// <summary>
/// The rules of conformance/readme.md, for .NET: how a case's options map to <see cref="AnalysisOptions"/>, how a
/// reading compares with the reference, and how an input decodes. Strict on both sides: a key the readme doesn't
/// define, in the vectors or in a reading, is a failure, never skipped.
/// </summary>
internal static class Vectors
{
    internal static readonly string[] FileKeys = { "schemaVersion", "pcm", "tolerances", "inputs", "cases", "errorCases" };
    internal static readonly string[] InputKeys = { "id", "file", "sampleRate", "samples", "sha256", "description" };
    internal static readonly string[] CaseKeys = { "id", "input", "sampleRate", "options", "expected" };
    internal static readonly string[] ErrorCaseKeys = { "id", "input", "sampleRate", "options", "expectedError", "why" };
    internal static readonly string[] ReadingKeys = { "audio", "bpm", "bpmExact", "candidates", "confidence", "engine" };
    internal static readonly string[] AudioKeys = { "contextTime", "from", "to" };
    internal static readonly string[] CandidateKeys = { "bpm", "relation" };
    internal static readonly string[] OptionKeys = { "engine", "tempoRange" };
    internal static readonly string[] EngineKeys = { "name", "lowpass" };
    internal static readonly string[] LowpassKeys = { "frequency", "q" };
    internal static readonly string[] TempoRangeKeys = { "min", "max" };

    /// <summary>A duplicate key is refused, as the JVM harness's parser refuses it: the second would hide the first.</summary>
    private static readonly JsonDocumentOptions ParseOptions = new() { AllowDuplicateProperties = false };

    /// <summary>The folder of vectors.json: CONFORMANCE_DIR, or the repo's, which the build bakes in.</summary>
    internal static string ConformanceDir() => Configured("CONFORMANCE_DIR", "ConformanceDir");

    /// <summary>The JS library's src/, whose constants JsSourceTests reads back.</summary>
    internal static string JsSourceDir() => Configured("JS_SOURCE_DIR", "JsSourceDir");

    private static string Configured(string variable, string metadata)
    {
        string? configured = Environment.GetEnvironmentVariable(variable);
        if (!string.IsNullOrEmpty(configured))
        {
            return configured;
        }

        return typeof(Vectors).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .Single(attribute => attribute.Key == metadata).Value
            ?? throw new InvalidOperationException($"no {metadata} in the test assembly");
    }

    internal static JsonElement Parse(string json)
    {
        using JsonDocument document = JsonDocument.Parse(json, ParseOptions);
        return document.RootElement.Clone();
    }

    /// <summary>A case the harness can't run: an option it can't map. The readme makes that a failure.</summary>
    internal sealed class UnmappableException : Exception
    {
        internal UnmappableException(string message)
            : base(message)
        {
        }
    }

    internal static IReadOnlyList<string> Keys(JsonElement element) =>
        element.EnumerateObject().Select(property => property.Name).ToList();

    /// <summary>The failure when the object's keys are not exactly <paramref name="expected"/>, or none.</summary>
    internal static List<string> CompareKeys(JsonElement element, string[] expected, string path)
    {
        var failures = new List<string>();
        var keys = Keys(Object(element, path));
        if (!new HashSet<string>(keys).SetEquals(expected) || keys.Count != expected.Length)
        {
            failures.Add($"{path}: keys [{string.Join(", ", keys)}], expected [{string.Join(", ", expected)}]");
        }

        return failures;
    }

    internal static JsonElement Object(JsonElement value, string path) =>
        value.ValueKind == JsonValueKind.Object ? value : throw new UnmappableException($"{path}: not an object");

    internal static JsonElement Get(JsonElement value, string key, string path) =>
        Object(value, path).TryGetProperty(key, out JsonElement found)
            ? found
            : throw new UnmappableException($"{path}: no {key}");

    internal static List<JsonElement> Array(JsonElement value, string path) =>
        value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().ToList()
            : throw new UnmappableException($"{path}: not an array");

    internal static double Number(JsonElement value, string path) =>
        value.ValueKind == JsonValueKind.Number ? value.GetDouble() : throw new UnmappableException($"{path}: not a number");

    internal static string String(JsonElement value, string path) =>
        value.ValueKind == JsonValueKind.String ? value.GetString()! : throw new UnmappableException($"{path}: not a string");

    internal static bool IsNull(JsonElement value) => value.ValueKind == JsonValueKind.Null;

    /// <summary>
    /// Maps a case's <c>options</c> to the C# API. Building the options may itself throw
    /// <see cref="ArgumentOutOfRangeException"/>, as the JS call would throw a RangeError: an error case counts that as
    /// the call's error.
    /// </summary>
    internal static AnalysisOptions Options(JsonElement options)
    {
        var keys = Keys(Object(options, "options"));
        if (keys.Any(key => !OptionKeys.Contains(key)))
        {
            throw new UnmappableException($"options: unknown key in [{string.Join(", ", keys)}]");
        }

        Engine? engine = options.TryGetProperty("engine", out JsonElement engineValue) ? MapEngine(engineValue) : null;
        TempoRange? range = null;
        if (options.TryGetProperty("tempoRange", out JsonElement rangeValue))
        {
            if (CompareKeys(rangeValue, TempoRangeKeys, "options.tempoRange").Count > 0)
            {
                throw new UnmappableException($"options.tempoRange: keys [{string.Join(", ", Keys(rangeValue))}]");
            }

            range = new TempoRange(
                Number(Get(rangeValue, "min", "tempoRange"), "tempoRange.min"),
                Number(Get(rangeValue, "max", "tempoRange"), "tempoRange.max"));
        }

        return new AnalysisOptions(engine, range);
    }

    private static Engine MapEngine(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.String)
        {
            return value.GetString() switch
            {
                "tempogram" => Engine.Tempogram,
                "peaks" => Engine.Peaks,
                var other => throw new UnmappableException($"options.engine: {other}"),
            };
        }

        var keys = Keys(Object(value, "options.engine"));
        if (keys.Any(key => !EngineKeys.Contains(key))
            || !value.TryGetProperty("name", out JsonElement name)
            || name.ValueKind != JsonValueKind.String
            || name.GetString() != "peaks")
        {
            throw new UnmappableException($"options.engine: {value.GetRawText()}");
        }

        if (!value.TryGetProperty("lowpass", out JsonElement lowpass) || IsNull(lowpass))
        {
            return Engine.Peaks;
        }

        var lowpassKeys = Keys(Object(lowpass, "options.engine.lowpass"));
        if (lowpassKeys.Any(key => !LowpassKeys.Contains(key)))
        {
            throw new UnmappableException($"options.engine.lowpass: unknown key in [{string.Join(", ", lowpassKeys)}]");
        }

        double frequency = lowpass.TryGetProperty("frequency", out JsonElement f) ? Number(f, "lowpass.frequency") : Lowpass.DefaultFrequency;
        double q = lowpass.TryGetProperty("q", out JsonElement qValue) ? Number(qValue, "lowpass.q") : Lowpass.DefaultQ;
        return Engine.PeaksWith(new Lowpass(frequency, q));
    }

    /// <summary>JS's Object.is on numbers: 0 and -0 differ, NaN equals NaN.</summary>
    internal static bool Same(double expected, double actual) =>
        BitConverter.DoubleToInt64Bits(expected) == BitConverter.DoubleToInt64Bits(actual);

    private static void Exact(List<string> failures, string path, double expected, double actual)
    {
        if (!Same(expected, actual))
        {
            failures.Add(Invariant($"{path}: {actual}, expected {expected}"));
        }
    }

    private static void Within(List<string> failures, string path, double expected, double actual, double tolerance)
    {
        // NaN fails, as the negated comparison makes it
        if (!(Math.Abs(actual - expected) <= tolerance))
        {
            failures.Add(Invariant($"{path}: {actual}, expected {expected} within {tolerance}"));
        }
    }

    /// <summary>The name the JS library and the vectors use for an enum value: <c>top</c>, <c>peaks</c>.</summary>
    internal static string Id<T>(T value)
        where T : struct, Enum => value.ToString().ToLowerInvariant();

    /// <summary>Compares a reading with the reference under the readme's rules.</summary>
    /// <param name="expected">The reference, a JSON null for no tempo.</param>
    /// <param name="actual">The port's reading, or null for no tempo.</param>
    /// <returns>One message per mismatch, empty on a pass.</returns>
    internal static List<string> Compare(JsonElement expected, Reading? actual, double bpmExactTolerance, double confidenceTolerance)
    {
        var failures = new List<string>();
        if (IsNull(expected) || actual is null)
        {
            if (!IsNull(expected) || actual is not null)
            {
                failures.Add($"reading: {(actual is null ? "null" : "a reading")}, expected {(IsNull(expected) ? "null" : "a reading")}");
            }

            return failures;
        }

        failures.AddRange(CompareKeys(expected, ReadingKeys, "expected"));
        Exact(failures, "bpm", Number(Get(expected, "bpm", "expected"), "expected.bpm"), actual.Bpm);
        Within(failures, "bpmExact", Number(Get(expected, "bpmExact", "expected"), "expected.bpmExact"), actual.BpmExact, bpmExactTolerance);
        string engine = String(Get(expected, "engine", "expected"), "expected.engine");
        if (Id(actual.Engine) != engine)
        {
            failures.Add($"engine: {Id(actual.Engine)}, expected {engine}");
        }

        // null means unmeasured, never a small number: both null, or both numbers within tolerance
        JsonElement confidence = Get(expected, "confidence", "expected");
        if (IsNull(confidence) || actual.Confidence is null)
        {
            if (!IsNull(confidence) || actual.Confidence is not null)
            {
                failures.Add($"confidence: {actual.Confidence?.ToString(CultureInfo.InvariantCulture) ?? "null"}, expected {confidence.GetRawText()}");
            }
        }
        else
        {
            Within(failures, "confidence", Number(confidence, "expected.confidence"), actual.Confidence.Value, confidenceTolerance);
        }

        JsonElement audio = Get(expected, "audio", "expected");
        failures.AddRange(CompareKeys(audio, AudioKeys, "expected.audio"));
        Exact(failures, "audio.from", Number(Get(audio, "from", "audio"), "audio.from"), actual.AudioFrom);
        Exact(failures, "audio.to", Number(Get(audio, "to", "audio"), "audio.to"), actual.AudioTo);
        // A whole-buffer analysis has no audio context: the port has no such field, and the reference must agree
        if (!IsNull(Get(audio, "contextTime", "audio")))
        {
            failures.Add($"audio.contextTime: null, expected {audio.GetProperty("contextTime").GetRawText()}");
        }

        List<JsonElement> candidates = Array(Get(expected, "candidates", "expected"), "expected.candidates");
        if (candidates.Count != actual.Candidates.Count)
        {
            failures.Add($"candidates: {actual.Candidates.Count} of them, expected {candidates.Count}");
            return failures;
        }

        for (int i = 0; i < candidates.Count; i++)
        {
            Candidate mine = actual.Candidates[i];
            failures.AddRange(CompareKeys(candidates[i], CandidateKeys, $"candidates[{i}]"));
            Exact(failures, $"candidates[{i}].bpm", Number(Get(candidates[i], "bpm", "candidate"), "candidate.bpm"), mine.Bpm);
            string relation = String(Get(candidates[i], "relation", "candidate"), "candidate.relation");
            if (Id(mine.Relation) != relation)
            {
                failures.Add($"candidates[{i}].relation: {Id(mine.Relation)}, expected {relation}");
            }
        }

        return failures;
    }

    /// <summary>
    /// The exception type the port throws for a JS error category, per the readme: <c>Error</c> for unusable samples,
    /// <c>RangeError</c> for a value out of range. Any other category has no mapping, and fails.
    /// </summary>
    internal static Type ExceptionFor(string category) => category switch
    {
        "Error" => typeof(ArgumentException),
        "RangeError" => typeof(ArgumentOutOfRangeException),
        _ => throw new UnmappableException($"expectedError: no mapping for {category}"),
    };

    internal static byte[] Gunzip(string path)
    {
        using FileStream file = File.OpenRead(path);
        using var gzip = new GZipStream(file, CompressionMode.Decompress);
        using var bytes = new MemoryStream();
        gzip.CopyTo(bytes);
        return bytes.ToArray();
    }

    /// <summary>Mono signed 16-bit little-endian PCM, each sample divided by 32768: exact in a 32-bit float.</summary>
    internal static float[] DecodePcm16(byte[] bytes)
    {
        if (bytes.Length % 2 != 0)
        {
            throw new UnmappableException($"PCM has an odd byte count: {bytes.Length}");
        }

        var samples = new float[bytes.Length / 2];
        for (int i = 0; i < samples.Length; i++)
        {
            short value = (short)(bytes[2 * i] | (bytes[(2 * i) + 1] << 8));
            samples[i] = value / 32768f;
        }

        return samples;
    }

    /// <summary>Overwrites the samples an input's <c>nonFinite</c> names, after decoding: 16-bit PCM holds no NaN or infinity.</summary>
    internal static void ApplyNonFinite(float[] samples, JsonElement entries, string id)
    {
        foreach (JsonElement entry in Array(entries, $"{id}.nonFinite"))
        {
            if (CompareKeys(entry, new[] { "index", "value" }, $"{id}.nonFinite[]").Count > 0)
            {
                throw new UnmappableException($"{id}: nonFinite entry keys [{string.Join(", ", Keys(entry))}]");
            }

            double index = Number(entry.GetProperty("index"), $"{id}.nonFinite[].index");
            if (index != Math.Floor(index) || index < 0 || index >= samples.Length)
            {
                throw new UnmappableException(Invariant($"{id}: nonFinite index {index} is not a sample index"));
            }

            samples[(int)index] = String(entry.GetProperty("value"), $"{id}.nonFinite[].value") switch
            {
                "NaN" => float.NaN,
                "Infinity" => float.PositiveInfinity,
                "-Infinity" => float.NegativeInfinity,
                string other => throw new UnmappableException($"{id}: nonFinite value {other} is not NaN, Infinity or -Infinity"),
            };
        }
    }

    internal static string Sha256(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

    internal static string Invariant(FormattableString text) => text.ToString(CultureInfo.InvariantCulture);
}
