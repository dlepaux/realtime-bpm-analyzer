using System;
using Xunit;

namespace RealtimeBpmAnalyzer.Tests;

/// <summary>
/// The peaks engine's level-relative search at its edges, which the conformance inputs reach only in the middle: the
/// percentile's index, the windows' bounds, and the floor and full-scale guards.
/// </summary>
public sealed class PeaksLevelTests
{
    /// <summary>One window a sample long per value, at 4 Hz, where a 0.25 s window is one sample.</summary>
    private static float Level(params float[] maxima) => PeaksEngine.LevelReference(maxima, 4);

    [Fact]
    public void Takes_the_maximum_at_the_floored_percentile_index()
    {
        // 100 windows of 0.001 to 0.100: floor(99 * 98 / 100) = 97, the 98th value
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

    /// <summary>The 32-bit float with these bits, so the arithmetic traps below are exact.</summary>
    private static float F32(int bits) => BitConverter.Int32BitsToSingle(bits);

    [Fact]
    public void Compares_each_sample_with_the_scaled_rung_in_double()
    {
        // conformance/readme.md, "The peaks level": a 32-bit threshold passes every vector, so this pins it. At 4 Hz a
        // window is one sample. The level is L, the first 32-bit float above 0.01 whose 0.9 * L rounds up when stored;
        // twelve samples hold that stored 0.9 * L, so they clear the double threshold 0.9 * L and rung 0.9 finds 15
        // peaks. A 32-bit threshold equals them and finds 3, so the search would go on to 0.85 and take sample 50 too
        var data = new float[100];
        Array.Fill(data, F32(0x3C23D70D), 0, 3);
        Array.Fill(data, F32(0x3C1374BF), 10, 12);
        data[50] = F32(0x3C0E8A74);
        Assert.Equal(F32(0x3C23D70D), PeaksEngine.LevelReference(data, 4));
        Assert.Equal(new[] { 0, 1, 2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 }, PeaksEngine.FindPeaksRelativeToLevel(data, 4));
    }

    [Fact]
    public void Compares_the_level_with_the_silence_floor_in_double()
    {
        // The 32-bit float nearest -70 dBFS is just under the double floor, so it searches nothing; the next one up does
        float under = F32(0x39A5CB5F);
        float over = F32(0x39A5CB60);
        Assert.True(under < PeaksEngine.SilenceFloor && over > PeaksEngine.SilenceFloor);
        var quiet = new float[64];
        Array.Fill(quiet, under);
        Assert.Empty(PeaksEngine.FindPeaksRelativeToLevel(quiet, 4));
        Array.Fill(quiet, over);
        Assert.Equal(64, PeaksEngine.FindPeaksRelativeToLevel(quiet, 4).Length);
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
