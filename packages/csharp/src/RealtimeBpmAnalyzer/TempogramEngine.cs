using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace RealtimeBpmAnalyzer
{
    /// <summary>
    /// The tempogram engine on a whole buffer: the JS library's detectTempogram (core/tempogram.ts) with the settings
    /// it ships, which no option changes. Band-wise spectral flux at about 100 frames a second, then, every 0.5 s, an
    /// autocorrelation of the last 8 s read through a four-beat comb and a log-Gaussian tempo prior, accumulated over
    /// the whole file with every frame weighted the same.
    /// </summary>
    /// <remarks>
    /// Only what decides the offline reading is ported: the realtime detector's "stable" rule and per-frame best tempo
    /// feed its events, never <c>detector.candidates()</c>, which is all <c>detectTempogram</c> returns. The sums keep
    /// the JS order of operations. The input samples and the onset strength ring are 32-bit floats, as in the JS
    /// library. The transcendental functions are the runtime's, which can differ from V8's in the last bit; the
    /// conformance tolerances absorb that, with the margin conformance/readme.md measures.
    /// </remarks>
    internal static class TempogramEngine
    {
        private const double FrameRate = 100;

        /// <summary>
        /// The lowest sample rate, in Hz, the tempogram runs at: the JS library's <c>tempogramMinSampleRate</c>, the
        /// first double at which its FFT has 4 points, so a bin above DC (RBA-261). Under it the FFT has 2, whose bins
        /// the onset sums skip, and every reading was empty.
        /// </summary>
        /// <remarks>
        /// The rate is compared with this double, not through <see cref="FftSize"/>: <see cref="JsMath.Log2"/> is a
        /// ratio of logarithms, which already gives 4 points on the two doubles under it where JS's <c>Math.log2</c>
        /// gives 2, so only the comparison makes the ports refuse the same rates. <c>consts.ts</c> derives the value.
        /// </remarks>
        internal const double MinSampleRate = 122.97509238026915;
        private const double Compression = 1000;
        private const double LocalMeanSeconds = 0.5;
        private const double WindowSeconds = 8;
        private const double WarmupSeconds = 4;
        private const double UpdateSeconds = 0.5;
        private const int CombBeats = 4;
        private const double HalfBeatPenalty = 0;
        private const double ThirdBeatPenalty = 0.3;
        private const double PriorBpm = 80;
        private const double PriorOctaves = 1.7;
        private const double ReadingSalience = 0.02;

        /// <summary>Tempo ratio between neighbours of the grid.</summary>
        private const double GridRatio = 1.01;

        /// <summary>Fastest the loudness reference falls, per frame.</summary>
        private const double LoudnessDecay = 0.9995;

        /// <summary>Loudness reference floor: silence stays silence.</summary>
        private const double MinimumLoudness = 0.05;

        private const int MaxCandidates = 5;

        /// <summary>Shorter audio has no two beats to compare at the slowest tempo searched.</summary>
        private const double ShortestRecordingSeconds = 1.5;

        /// <summary>The largest FFT whose size an int holds; the JS library's typed array would refuse it first.</summary>
        private const int MaxFftBits = 30;

        private static readonly int[] Bands = { 30, 200, 500, 1500, 4000, 10_000 };

        /// <summary>Onset strength smoothing over 50 ms, newest first.</summary>
        private static readonly double[] SmoothingWeights = { 1.0 / 9, 2.0 / 9, 3.0 / 9, 2.0 / 9, 1.0 / 9 };

        /// <param name="samples">The caller's samples, full band.</param>
        /// <param name="sampleRate">Their rate.</param>
        /// <param name="range">The tempos searched.</param>
        /// <returns>Up to 5 candidates, best first, empty when no pulse stands out or the audio is under 1.5 s.</returns>
        /// <exception cref="ArgumentOutOfRangeException">
        /// When the sample rate is not finite or under <see cref="MinSampleRate"/>, whatever the audio's length.
        /// </exception>
        internal static List<Tempo> Detect(float[] samples, double sampleRate, TempoRange range)
        {
            if (double.IsInfinity(sampleRate) || !(sampleRate >= MinSampleRate))
            {
                // R: .NET Framework's default format keeps 15 digits, which would print the floor as 122.975092380269
                // and the rate under it as the same
                throw new ArgumentOutOfRangeException(
                    nameof(sampleRate),
                    string.Format(
                        CultureInfo.InvariantCulture,
                        "Invalid sample rate: {0:R}. The tempogram needs at least {1:R} Hz, the lowest rate at which its FFT has a bin above DC.",
                        sampleRate,
                        MinSampleRate));
            }

            double seconds = samples.Length / sampleRate;
            if (seconds < ShortestRecordingSeconds)
            {
                return new List<Tempo>();
            }

            // A frame short of the end: rounding must not ask for more frames than the file holds
            double warmupSeconds = Math.Min(WarmupSeconds, seconds - (1 / FrameRate));
            var detector = new Detector(sampleRate, range, warmupSeconds);
            detector.Process(samples);
            return detector.Candidates();
        }

        /// <summary>The FFT size: the power of two nearest 23 ms of samples, on a log scale.</summary>
        /// <exception cref="ArgumentOutOfRangeException">
        /// When its size would not fit an int, from about 66 GHz. Defensive: a float[] can't hold the 1.5 s the
        /// analysis needs at that rate, so <see cref="Detect"/> returns no tempo first.
        /// </exception>
        internal static int FftSize(double sampleRate)
        {
            double bits = JsMath.Round(JsMath.Log2(0.023 * sampleRate));
            if (bits > MaxFftBits)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(sampleRate),
                    string.Format(CultureInfo.InvariantCulture, "Invalid sample rate: {0}. The tempogram's FFT would not fit in memory.", sampleRate));
            }

            return 1 << (int)bits;
        }

        /// <summary>
        /// JS's read of a typed array at an integer index: past either end it is <c>undefined</c>, which arithmetic
        /// turns into NaN.
        /// </summary>
        private static double At(double[] values, long index) =>
            index >= 0 && index < values.Length ? values[index] : double.NaN;

        /// <summary>Bit reversal of each index, and the twiddle factors, of an in-place radix-2 FFT.</summary>
        private sealed class Fft
        {
            private readonly int size;
            private readonly double[] cosines;
            private readonly double[] sines;
            private readonly int[] reversed;

            internal Fft(int size)
            {
                this.size = size;
                cosines = new double[size / 2];
                sines = new double[size / 2];
                reversed = new int[size];
                int bits = 0;
                while ((1 << bits) < size)
                {
                    bits++;
                }

                for (int i = 0; i < size / 2; i++)
                {
                    cosines[i] = Math.Cos((2 * Math.PI * i) / size);
                    sines[i] = -Math.Sin((2 * Math.PI * i) / size);
                }

                for (int i = 0; i < size; i++)
                {
                    int value = 0;
                    for (int bit = 0; bit < bits; bit++)
                    {
                        value = (value << 1) | ((i >> bit) & 1);
                    }

                    reversed[i] = value;
                }
            }

            internal void Transform(double[] re, double[] im)
            {
                for (int i = 0; i < size; i++)
                {
                    int j = reversed[i];
                    if (j > i)
                    {
                        // No tuple swap: netstandard2.0 has no System.ValueTuple
                        double swapped = re[i];
                        re[i] = re[j];
                        re[j] = swapped;
                        swapped = im[i];
                        im[i] = im[j];
                        im[j] = swapped;
                    }
                }

                for (int half = 1; half < size; half *= 2)
                {
                    int step = size / (2 * half);
                    for (int start = 0; start < size; start += 2 * half)
                    {
                        for (int k = 0; k < half; k++)
                        {
                            int a = start + k;
                            int b = a + half;
                            double wr = cosines[k * step];
                            double wi = sines[k * step];
                            double tr = (re[b] * wr) - (im[b] * wi);
                            double ti = (re[b] * wi) + (im[b] * wr);
                            re[b] = re[a] - tr;
                            im[b] = im[a] - ti;
                            re[a] += tr;
                            im[a] += ti;
                        }
                    }
                }
            }
        }

        /// <summary>Band-wise log-compressed spectral flux of one windowed frame, relative to a slow loudness reference.</summary>
        private sealed class OnsetStage
        {
            private readonly int bins;
            private readonly Fft fft;
            private readonly double[] im;
            private readonly double[] previousLog;
            private readonly int[] edges;
            private readonly double[] localMeans;
            private readonly double meanStep;
            private double loudness = MinimumLoudness;
            private bool hasPrevious;

            internal OnsetStage(double sampleRate, double frameRate)
            {
                Size = FftSize(sampleRate);
                bins = Size / 2;
                fft = new Fft(Size);
                Re = new double[Size];
                im = new double[Size];
                previousLog = new double[bins];
                double nyquist = sampleRate / 2;
                edges = new int[Bands.Length];
                for (int i = 0; i < Bands.Length; i++)
                {
                    edges[i] = (int)Math.Min(bins, Math.Max(1, JsMath.Round((Bands[i] / nyquist) * bins)));
                }

                localMeans = new double[Bands.Length - 1];
                meanStep = 1 / (LocalMeanSeconds * frameRate);
            }

            internal int Size { get; }

            /// <summary>The windowed samples of the next frame, written by the caller, then overwritten by <see cref="Frame"/>.</summary>
            internal double[] Re { get; }

            /// <summary>Consumes the windowed samples in <see cref="Re"/>, returns their onset strength.</summary>
            internal double Frame()
            {
                double[] re = Re;
                Array.Clear(im, 0, im.Length);
                fft.Transform(re, im);

                double peak = 0;
                double total = 0;
                for (int bin = 1; bin < bins; bin++)
                {
                    double power = (re[bin] * re[bin]) + (im[bin] * im[bin]);
                    re[bin] = power;
                    peak = power > peak ? power : peak;
                    total += power;
                }

                if (double.IsNaN(total) || double.IsInfinity(total))
                {
                    // A NaN or infinite sample is no audio: no onset, and the state is kept. BpmAnalyzer refuses such
                    // samples first (RBA-260); this mirrors the reference's realtime rule (RBA-246)
                    return 0;
                }

                loudness = Math.Max(Math.Sqrt(peak), Math.Max(loudness * LoudnessDecay, MinimumLoudness));
                double scale = Compression / loudness;
                double strength = 0;
                for (int band = 0; band < localMeans.Length; band++)
                {
                    int first = edges[band];
                    int end = edges[band + 1];
                    double flux = 0;
                    for (int bin = first; bin < end; bin++)
                    {
                        double logarithm = Math.Log(1 + (scale * Math.Sqrt(re[bin])));
                        double rise = logarithm - previousLog[bin];
                        previousLog[bin] = logarithm;
                        flux += rise > 0 ? rise : 0;
                    }

                    flux /= Math.Max(1, end - first);
                    localMeans[band] += meanStep * (flux - localMeans[band]);
                    double novelty = flux - localMeans[band];
                    strength += novelty > 0 ? novelty : 0;
                }

                if (!hasPrevious)
                {
                    // The first frame rises from nothing, which is no onset
                    hasPrevious = true;
                    return 0;
                }

                return strength;
            }
        }

        /// <summary>The streaming detector, with the state the offline reading depends on.</summary>
        private sealed class Detector
        {
            private readonly int hop;
            private readonly OnsetStage onset;
            private readonly int fftSize;
            private readonly double[] hann;
            private readonly float[] samplesRing;
            private readonly int windowFrames;

            /// <summary>Written twice, so the latest window is always a contiguous range. 32-bit, as in JS.</summary>
            private readonly float[] ossRing;
            private readonly double[] recent = new double[SmoothingWeights.Length];
            private readonly double[] centred;
            private readonly double[] autocorrelation;
            private readonly double[] tempos;
            private readonly double[] prior;

            /// <summary>For each tempo, each beat multiple: the lag in frames.</summary>
            private readonly double[] lags;
            private readonly int maxLag;
            private readonly double[] salience;
            private readonly double[] accumulated;
            private readonly double[] ranking;
            private readonly int updateFrames;
            private readonly int warmupFrames;
            private int samplesWritten;
            private int sinceHop;
            private int frames;
            private double accumulatedWeight;

            internal Detector(double sampleRate, TempoRange range, double warmupSeconds)
            {
                hop = (int)JsMath.Round(sampleRate / FrameRate);
                double frameRate = sampleRate / hop;
                onset = new OnsetStage(sampleRate, frameRate);
                fftSize = onset.Size;
                hann = new double[fftSize];
                for (int i = 0; i < fftSize; i++)
                {
                    // Periodic (dividing by N), as the reference: the symmetric window fails 44 cases
                    hann[i] = 0.5 - (0.5 * Math.Cos((2 * Math.PI * i) / fftSize));
                }

                samplesRing = new float[fftSize];
                windowFrames = (int)JsMath.Round(WindowSeconds * frameRate);
                ossRing = new float[2 * windowFrames];
                centred = new double[windowFrames];

                int size = (int)Math.Floor(Math.Log(range.Max / range.Min) / Math.Log(GridRatio)) + 1;
                tempos = new double[size];
                prior = new double[size];
                lags = new double[size * CombBeats];
                double longestLag = 0;
                for (int i = 0; i < size; i++)
                {
                    double tempo = range.Min * Math.Pow(GridRatio, i);
                    tempos[i] = tempo;
                    double octaves = JsMath.Log2(tempo / PriorBpm) / PriorOctaves;
                    prior[i] = Math.Exp(-0.5 * (octaves * octaves));
                    for (int k = 0; k < CombBeats; k++)
                    {
                        double lag = ((k + 1) * 60 * frameRate) / tempo;
                        lags[(i * CombBeats) + k] = lag;
                        longestLag = lag < windowFrames - 1 && lag > longestLag ? lag : longestLag;
                    }
                }

                maxLag = (int)Math.Ceiling(longestLag) + 1;
                autocorrelation = new double[maxLag + 1];
                salience = new double[size];
                accumulated = new double[size];
                ranking = new double[size];
                updateFrames = (int)Math.Max(1, JsMath.Round(UpdateSeconds * frameRate));
                warmupFrames = (int)JsMath.Round(warmupSeconds * frameRate);
            }

            internal void Process(float[] samples)
            {
                foreach (float sample in samples)
                {
                    samplesRing[samplesWritten % fftSize] = sample;
                    samplesWritten++;
                    sinceHop++;
                    if (sinceHop == hop)
                    {
                        sinceHop = 0;
                        Ingest(OnsetStrength());
                    }
                }
            }

            internal List<Tempo> Candidates()
            {
                var peaks = new List<int>();
                for (int i = 0; i < ranking.Length; i++)
                {
                    if (IsLocalPeak(i))
                    {
                        peaks.Add(i);
                    }
                }

                // OrderByDescending is stable, as Array.prototype.sort: equal rankings keep the grid's order
                var candidates = new List<Tempo>();
                foreach (int i in peaks.OrderByDescending(peak => ranking[peak]).Take(MaxCandidates))
                {
                    double exact = RefinedTempo(i);
                    double score = Math.Min(1, accumulated[i] / accumulatedWeight);
                    if (score >= ReadingSalience)
                    {
                        candidates.Add(new Tempo((long)JsMath.Round(exact), exact, (long)JsMath.Round(ranking[i] * 1000), score));
                    }
                }

                return candidates;
            }

            private double OnsetStrength()
            {
                double[] re = onset.Re;
                int position = samplesWritten % fftSize;
                for (int i = 0; i < fftSize; i++)
                {
                    re[i] = samplesRing[(position + i) % fftSize] * hann[i];
                }

                return onset.Frame();
            }

            private void Ingest(double onsetStrength)
            {
                int length = recent.Length;
                recent[frames % length] = onsetStrength;
                double strength = 0;
                for (int i = 0; i < length; i++)
                {
                    strength += recent[(frames + length - i) % length] * SmoothingWeights[i];
                }

                int slot = frames % windowFrames;
                ossRing[slot] = (float)strength;
                ossRing[slot + windowFrames] = (float)strength;
                frames++;
                if (frames >= warmupFrames && (frames - warmupFrames) % updateFrames == 0)
                {
                    // The realtime detector's frame also keeps its stable rule's history, which the offline reading
                    // never reads: only the accumulation decides detector.candidates()
                    if (ComputeSalience())
                    {
                        Accumulate();
                    }
                }
            }

            /// <summary>
            /// The autocorrelation at a fractional lag. A lag whose upper neighbour is past the array reads as NaN, as
            /// JS reads an undefined element: the salience's penalty then drops out, exactly as in the JS library. The
            /// lag is checked as a double first, since a tempo near 0 makes it infinite, which no int holds.
            /// </summary>
            private double CorrelationAt(double lag)
            {
                if (!(lag < autocorrelation.Length))
                {
                    return double.NaN;
                }

                long low = (long)Math.Floor(lag);
                return At(autocorrelation, low) + ((lag - low) * (At(autocorrelation, low + 1) - At(autocorrelation, low)));
            }

            /// <summary>Fills <see cref="salience"/> from the latest window, returns false when nothing pulses in it.</summary>
            private bool ComputeSalience()
            {
                int length = Math.Min(frames, windowFrames);
                int first = frames <= windowFrames ? 0 : frames % windowFrames;
                double mean = 0;
                for (int i = 0; i < length; i++)
                {
                    mean += ossRing[first + i];
                }

                mean /= length;
                for (int i = 0; i < length; i++)
                {
                    centred[i] = ossRing[first + i] - mean;
                }

                int lagEnd = Math.Min(maxLag, length - 1);
                for (int lag = 0; lag <= lagEnd; lag++)
                {
                    double sum = 0;
                    for (int i = lag; i < length; i++)
                    {
                        sum += centred[i] * centred[i - lag];
                    }

                    // Unbiased: a long lag overlaps less, which must not read as less periodic
                    autocorrelation[lag] = (sum * length) / (length - lag);
                }

                double energy = autocorrelation[0];
                if (energy < 1e-12)
                {
                    return false;
                }

                for (int i = 0; i < salience.Length; i++)
                {
                    double sum = 0;
                    double weight = 0;
                    for (int k = 0; k < CombBeats; k++)
                    {
                        double lag = lags[(i * CombBeats) + k];
                        if (lag >= lagEnd)
                        {
                            break;
                        }

                        sum += CorrelationAt(lag);
                        weight += 1;
                    }

                    double comb = weight > 0 ? sum / (weight * energy) : 0;
                    double beat = lags[i * CombBeats];
                    double between = (HalfBeatPenalty * CorrelationAt(beat / 2)) + (ThirdBeatPenalty * CorrelationAt(beat / 3));
                    salience[i] = comb - ((between > 0 ? between : 0) / energy);
                }

                return true;
            }

            /// <summary>Every frame weighs the same over a whole file: the JS half-life is infinite, so its memory is 1.</summary>
            private void Accumulate()
            {
                accumulatedWeight += 1;
                for (int i = 0; i < accumulated.Length; i++)
                {
                    double positive = salience[i] > 0 ? salience[i] : 0;
                    accumulated[i] += positive;
                    ranking[i] = (accumulated[i] / accumulatedWeight) * prior[i];
                }
            }

            private bool IsLocalPeak(int i)
            {
                double left = i > 0 ? ranking[i - 1] : double.NegativeInfinity;
                double right = i < ranking.Length - 1 ? ranking[i + 1] : double.NegativeInfinity;
                return ranking[i] > 0 && ranking[i] >= left && ranking[i] >= right;
            }

            /// <summary>A peak's tempo, refined by a parabola through it and its neighbours on the log-tempo grid.</summary>
            private double RefinedTempo(int i)
            {
                if (i == 0 || i == ranking.Length - 1)
                {
                    return tempos[i];
                }

                double denominator = ranking[i - 1] - (2 * ranking[i]) + ranking[i + 1];
                double offset = denominator == 0 ? 0 : (0.5 * (ranking[i - 1] - ranking[i + 1])) / denominator;
                return tempos[i] * Math.Pow(GridRatio, offset);
            }
        }
    }
}
