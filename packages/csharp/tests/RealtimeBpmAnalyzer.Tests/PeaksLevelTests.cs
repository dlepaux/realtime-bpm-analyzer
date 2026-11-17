using System;
using Xunit;

namespace RealtimeBpmAnalyzer.Tests;

/// <summary>
/// RBA-221's level-relative search at its edges, which the conformance inputs reach only in the middle: the
/// percentile's index, the windows' bounds, and the floor and full-scale guards.
/// </summary>
public sealed class PeaksLevelTests
{
    /// <summary>One window a sample long per value, at 4 Hz, where a 0.25 s window is one sample.</summary>
    private static float Level(params float[] maxima) => PeaksEngine.LevelReference(maxima, 4);

    [Fact]
    public void Takes_the_maximum_at_the_floored_percentile_index()
    {
        // 100 windows of 1..100: floor(99 * 98 / 100) = 97, the 98th value
        var hundred = new float[100];
        for (int i = 0; i < hundred.Length; i++)
        {
            hundred[i] = (hundred.Length - i) / 1000f;
        }

        Assert.Equal(98 / 1000f, Level(hundred));
        // Two windows: floor(1 * 98 / 100) = 0, so the louder one never sets the level
        Assert.Equal(0.1f, Level(0.9f, 0.1f));
        Assert.Equal(0.5f, Level(0.5f));
    }

    [Fact]
    public void Counts_only_positive_samples_and_a_shorter_last_window()
    {
        // At 8 Hz a window is two samples: [-0.9, 0.2], [0.3, -0.5], [0.4]
        Assert.Equal(0.3f, PeaksEngine.LevelReference(new[] { -0.9f, 0.2f, 0.3f, -0.5f, 0.4f }, 8));
        Assert.Equal(0f, PeaksEngine.LevelReference(new[] { -0.9f, -0.2f }, 8));
        Assert.Equal(0f, PeaksEngine.LevelReference(Array.Empty<float>(), 8));
        // A NaN sample never becomes a window's maximum
        Assert.Equal(0.2f, PeaksEngine.LevelReference(new[] { float.NaN, 0.2f }, 8));
    }

    [Fact]
    public void Searches_nothing_under_the_floor_or_at_full_scale()
    {
        var loud = new float[64];
        var underFloor = new float[64];
        for (int i = 0; i < loud.Length; i++)
        {
            loud[i] = 1f;
            underFloor[i] = (float)(PeaksEngine.SilenceFloor * 0.99);
        }

        Assert.Empty(PeaksEngine.FindPeaksRelativeToLevel(loud, 4));
        Assert.Empty(PeaksEngine.FindPeaksRelativeToLevel(underFloor, 4));
    }

    [Fact]
    public void Reads_a_quiet_pulse_with_its_confidence_unmeasured()
    {
        // A one-sample click every 0.5 s at 1 kHz, 20 s, at -40 dBFS: the fixed ladder finds nothing in it
        var samples = new float[20_000];
        for (int i = 0; i < samples.Length; i += 500)
        {
            samples[i] = 0.01f;
        }

        Reading? reading = BpmAnalyzer.AnalyzeChannelData(samples, 1_000, new AnalysisOptions(engine: Engine.PeaksWith(new Lowpass(400, 1))));
        Assert.NotNull(reading);
        Assert.Equal(120, reading.Bpm);
        Assert.Null(reading.Confidence);
    }
}
