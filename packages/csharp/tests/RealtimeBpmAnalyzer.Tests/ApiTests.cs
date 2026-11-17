using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Xunit;

namespace RealtimeBpmAnalyzer.Tests;

/// <summary>The C# API around the engines: what the conformance vectors don't reach.</summary>
public sealed class ApiTests
{
    private const double Rate = 44_100;

    private static readonly AnalysisOptions PeaksOptions = new(engine: Engine.Peaks);

    /// <summary>A decaying 60 Hz kick every beat, loud enough for both engines.</summary>
    private static float[] Kicks(double bpm, double seconds)
    {
        var samples = new float[(int)(seconds * Rate)];
        int beat = (int)Math.Round(Rate * 60 / bpm);
        for (int start = 0; start < samples.Length; start += beat)
        {
            for (int i = 0; i < Rate / 20 && start + i < samples.Length; i++)
            {
                double t = i / Rate;
                samples[start + i] = (float)(0.99 * Math.Exp(-t * 40) * Math.Sin(2 * Math.PI * 60 * t));
            }
        }

        return samples;
    }

    [Fact]
    public void Reads_a_tempo_with_either_engine()
    {
        float[] samples = Kicks(120, 10);
        Reading? tempogram = BpmAnalyzer.AnalyzeChannelData(samples, Rate);
        Assert.NotNull(tempogram);
        Assert.Equal(120, tempogram.Bpm);
        Assert.Equal(EngineName.Tempogram, tempogram.Engine);
        Assert.Equal(tempogram.Bpm, tempogram.Candidates[0].Bpm);
        Assert.Equal(Relation.Top, tempogram.Candidates[0].Relation);
        Assert.Equal(0, tempogram.AudioFrom);
        Assert.Equal(10.0, tempogram.AudioTo);
        Assert.NotNull(tempogram.Confidence);

        Reading? peaks = BpmAnalyzer.AnalyzeChannelData(samples, Rate, PeaksOptions);
        Assert.NotNull(peaks);
        Assert.Equal(120, peaks.Bpm);
        Assert.Equal(EngineName.Peaks, peaks.Engine);
    }

    [Fact]
    public void Null_options_are_the_defaults()
    {
        float[] samples = Kicks(120, 10);
        Assert.Equal(BpmAnalyzer.AnalyzeChannelData(samples, Rate, AnalysisOptions.Default), BpmAnalyzer.AnalyzeChannelData(samples, Rate));
        Assert.Equal(AnalysisOptions.Default, new AnalysisOptions());
        Assert.Equal(Engine.Tempogram, AnalysisOptions.Default.Engine);
        Assert.Equal(TempoRange.Default, AnalysisOptions.Default.TempoRange);
        Assert.Equal(Engine.Peaks, Engine.PeaksWith(new Lowpass()));
        Assert.Equal(new AnalysisOptions(Engine.Peaks, new TempoRange(60, 140)), AnalysisOptions.Default.WithEngine(Engine.Peaks).WithTempoRange(new TempoRange(60, 140)));
        Assert.Null(Engine.Tempogram.Lowpass);
    }

    [Fact]
    public void Leaves_the_input_untouched()
    {
        float[] samples = Kicks(120, 10);
        float[] copy = (float[])samples.Clone();
        BpmAnalyzer.AnalyzeChannelData(samples, Rate);
        BpmAnalyzer.AnalyzeChannelData(samples, Rate, PeaksOptions);
        Assert.Equal(copy, samples);
    }

    [Fact]
    public void A_reading_is_immutable()
    {
        Reading? reading = BpmAnalyzer.AnalyzeChannelData(Kicks(120, 10), Rate);
        Assert.NotNull(reading);
        var list = Assert.IsAssignableFrom<IList<Candidate>>(reading.Candidates);
        Assert.True(list.IsReadOnly);
        Assert.Throws<NotSupportedException>(() => list.Clear());
        Assert.All(typeof(Reading).GetProperties(), property => Assert.Null(property.SetMethod));
    }

    [Fact]
    public void Confidence_is_null_off_the_measured_range()
    {
        Reading? reading = BpmAnalyzer.AnalyzeChannelData(Kicks(120, 10), Rate, new AnalysisOptions(tempoRange: new TempoRange(80, 200)));
        Assert.NotNull(reading);
        Assert.Null(reading.Confidence);
        // An explicit 90 to 180 is the default range, and keeps it
        Assert.NotNull(BpmAnalyzer.AnalyzeChannelData(Kicks(120, 10), Rate, new AnalysisOptions(tempoRange: new TempoRange(90, 180)))?.Confidence);

        Assert.Null(Calibration.Calibrate(EngineName.Peaks, 0.5, 89, TempoRange.Default));
        Assert.Null(Calibration.Calibrate(EngineName.Peaks, 0.5, 181, TempoRange.Default));
        Assert.Null(Calibration.Calibrate(EngineName.Peaks, 0.5, double.NaN, TempoRange.Default));
        Assert.NotNull(Calibration.Calibrate(EngineName.Peaks, 0.5, 90, TempoRange.Default));
        Assert.NotNull(Calibration.Calibrate(EngineName.Peaks, 0.5, 180, TempoRange.Default));
        // A score that is not a number reads as the bottom of the table
        Assert.Equal(Calibration.Calibrate(EngineName.Tempogram, 0, 120, TempoRange.Default), Calibration.Calibrate(EngineName.Tempogram, double.NaN, 120, TempoRange.Default));
        Assert.Equal(Calibration.Calibrate(EngineName.Tempogram, 0, 120, TempoRange.Default), Calibration.Calibrate(EngineName.Tempogram, double.PositiveInfinity, 120, TempoRange.Default));
    }

    [Fact]
    public void Reads_nothing_in_silence_or_in_short_audio()
    {
        Assert.Null(BpmAnalyzer.AnalyzeChannelData(new float[(int)(10 * Rate)], Rate));
        Assert.Null(BpmAnalyzer.AnalyzeChannelData(new float[(int)(10 * Rate)], Rate, PeaksOptions));
        Assert.Null(BpmAnalyzer.AnalyzeChannelData(Kicks(120, 1.4), Rate));
    }

    [Fact]
    public void Refuses_unusable_input()
    {
        Assert.Throws<ArgumentException>(() => BpmAnalyzer.AnalyzeChannelData(Array.Empty<float>(), Rate));
        Assert.Throws<ArgumentNullException>(() => BpmAnalyzer.AnalyzeChannelData(null!, Rate));
        Assert.Throws<ArgumentNullException>(() => AnalysisOptions.Default.WithEngine(null!));
        Assert.Throws<ArgumentNullException>(() => AnalysisOptions.Default.WithTempoRange(null!));
        Assert.Throws<ArgumentNullException>(() => Engine.PeaksWith(null!));
    }

    [Fact]
    public void Refuses_a_NaN_or_infinite_sample()
    {
        foreach (float value in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
        {
            var samples = new float[1000];
            samples[999] = value;
            foreach (AnalysisOptions options in new[] { AnalysisOptions.Default, PeaksOptions })
            {
                // Exactly ArgumentException, the JS Error, not its ArgumentOutOfRangeException subtype
                ArgumentException thrown = Assert.Throws<ArgumentException>(() => BpmAnalyzer.AnalyzeChannelData(samples, Rate, options));
                Assert.Contains("sample 999", thrown.Message, StringComparison.Ordinal);
            }
        }
    }

    [Fact]
    public void Refuses_sample_rates_the_engines_cannot_run()
    {
        var samples = new float[1000];
        foreach (double rate in new[] { double.NaN, double.PositiveInfinity, 0, -44_100, 99.9 })
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => BpmAnalyzer.AnalyzeChannelData(samples, rate));
        }

        // The cutoff must sit under Nyquist: 400 Hz has none above 200
        foreach (double rate in new[] { double.NaN, double.NegativeInfinity, 0, -1, 400 })
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => BpmAnalyzer.AnalyzeChannelData(samples, rate, PeaksOptions));
        }

        Assert.Throws<ArgumentOutOfRangeException>(() => TempogramEngine.FftSize(7e10));
        Assert.Equal(1 << 30, TempogramEngine.FftSize(4e10));
        Assert.Equal(1024, TempogramEngine.FftSize(Rate));
    }

    [Theory]
    [InlineData(0, 180)]
    [InlineData(-90, 180)]
    [InlineData(double.NaN, 180)]
    [InlineData(90, double.PositiveInfinity)]
    [InlineData(90, 179.9)]
    [InlineData(1, (double)int.MaxValue + 1)]
    [InlineData(1e-306, 1000)]
    public void Refuses_an_invalid_tempo_range_when_it_is_made(double min, double max)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new TempoRange(min, max));
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(-1, 1)]
    [InlineData(1e-46, 1)]
    [InlineData(double.NaN, 1)]
    [InlineData(double.PositiveInfinity, 1)]
    [InlineData(200, Lowpass.MinQ - 1)]
    [InlineData(200, Lowpass.MaxQ + 1)]
    [InlineData(200, double.NaN)]
    public void Refuses_an_invalid_lowpass_when_it_is_made(double frequency, double q)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new Lowpass(frequency, q));
    }

    [Fact]
    public void Accepts_the_bounds_of_each_option()
    {
        Assert.Equal(int.MaxValue, new TempoRange(1, int.MaxValue).Max);
        Assert.Equal(1e-305, new TempoRange(1e-305, 1000).Min);
        Assert.Equal(new Lowpass(150, 1), new Lowpass(frequency: 150));
        Assert.Equal(new Lowpass(200, 3), new Lowpass(q: 3));
        Assert.Equal(Lowpass.MinQ, new Lowpass(q: Lowpass.MinQ).Q);
        Assert.Equal(Lowpass.MaxQ, new Lowpass(q: Lowpass.MaxQ).Q);
    }

    /// <summary>Under 2 Hz the skip after a peak rounds to no sample, so the peaks engine refuses the rate, as JS does.</summary>
    [Fact]
    public async Task Peaks_engine_refuses_a_rate_under_two_hertz()
    {
        var samples = new float[200];
        for (int i = 0; i < samples.Length; i += 2)
        {
            samples[i] = 0.99f;
        }

        var options = new AnalysisOptions(engine: Engine.PeaksWith(new Lowpass(0.2, 1)));
        foreach (double rate in new[] { 1.99, 1, 0.5 })
        {
            var thrown = Assert.Throws<ArgumentOutOfRangeException>(() => BpmAnalyzer.AnalyzeChannelData(samples, rate, options));
            Assert.Contains("at least 2 Hz", thrown.Message, StringComparison.Ordinal);
        }

        // At 2 Hz the skip is one sample: the analysis must run and end
        Task analysis = Task.Run(() => BpmAnalyzer.AnalyzeChannelData(samples, 2, options));
        Assert.Same(analysis, await Task.WhenAny(analysis, Task.Delay(TimeSpan.FromSeconds(10))));
        await analysis;
    }

    [Fact]
    public void Relations_follow_the_JS_tolerance()
    {
        Assert.Equal(Relation.Half, BpmAnalyzer.RelationTo(120, 60));
        Assert.Equal(Relation.Half, BpmAnalyzer.RelationTo(120, 61));
        Assert.Equal(Relation.Other, BpmAnalyzer.RelationTo(120, 62));
        Assert.Equal(Relation.Double, BpmAnalyzer.RelationTo(90, 180));
        Assert.Equal(Relation.Double, BpmAnalyzer.RelationTo(90, 177));
        Assert.Equal(Relation.Other, BpmAnalyzer.RelationTo(90, 176));
        Assert.Equal(Relation.Other, BpmAnalyzer.RelationTo(120, 130));
    }

    /// <summary>JS Math.round, which C#'s Math.Round (half to even) and Math.Floor(x + 0.5) both get wrong somewhere.</summary>
    [Theory]
    [InlineData(122.5, 123)]
    [InlineData(2.5, 3)]
    [InlineData(-2.5, -2)]
    [InlineData(0.49999999999999994, 0)]
    [InlineData(4503599627370495.5, 4503599627370496)]
    [InlineData(4503599627370497, 4503599627370497)]
    [InlineData(-0.4, 0)]
    public void Rounds_half_up_as_JS_does(double value, double expected)
    {
        Assert.Equal(expected, JsMath.Round(value));
    }

    /// <summary>A JS Map's order: first insertion, and a replaced key keeps its place. The peaks engine's ties read it.</summary>
    [Fact]
    public void The_ordered_map_keeps_first_insertion_order()
    {
        var map = new OrderedMap<long, int>();
        foreach (long key in new long[] { 128, 64, 256, 32 })
        {
            map.Set(key, 1);
        }

        map.Set(64, 7);
        Assert.Equal(new long[] { 128, 64, 256, 32 }, Enumerable.Range(0, map.Count).Select(map.KeyAt));
        Assert.Equal(7, map.ValueAt(1));
        Assert.False(map.TryGetValue(1, out _));
    }

    /// <summary>
    /// Unity's ".NET Standard" level and Godot C# read the package only if it needs nothing beyond netstandard2.0: no
    /// other assembly, no unsafe code.
    /// </summary>
    [Fact]
    public void The_library_needs_nothing_but_netstandard()
    {
        Assembly library = typeof(BpmAnalyzer).Assembly;
        Assert.Equal(new[] { "netstandard" }, library.GetReferencedAssemblies().Select(name => name.Name));
        Assert.Equal(".NETStandard,Version=v2.0", library.GetCustomAttribute<System.Runtime.Versioning.TargetFrameworkAttribute>()?.FrameworkName);
        Assert.DoesNotContain(library.GetModules(), module => module.GetCustomAttributes(typeof(System.Security.UnverifiableCodeAttribute), false).Length > 0);
        Assert.Equal(new[] { "RealtimeBpmAnalyzer" }, library.GetExportedTypes().Select(type => type.Namespace).Distinct());
    }
}
