using System;
using System.Collections.Generic;
using System.Globalization;

namespace RealtimeBpmAnalyzer
{
    /// <summary>
    /// Offline BPM analysis of mono PCM samples: the C# port of the JS library's <c>analyzeChannelData</c>
    /// (realtime-bpm-analyzer/node). It gives the same readings as the JS library, which the shared conformance
    /// vectors check on every build.
    /// </summary>
    /// <remarks>
    /// It decodes nothing: the caller supplies the samples as floats from -1 to 1, one channel, and their sample rate.
    /// It holds no state and starts no thread, so it can run from any thread; a long file takes a while, so keep it
    /// off a game's or an app's main thread.
    /// </remarks>
    /// <example>
    /// <code>
    /// Reading? reading = BpmAnalyzer.AnalyzeChannelData(samples, 44100);
    /// if (reading != null)
    /// {
    ///     Console.WriteLine(reading.Bpm);
    /// }
    /// </code>
    /// </example>
    public static class BpmAnalyzer
    {
        /// <summary>Analyses the samples.</summary>
        /// <param name="samples">One channel, from -1 to 1. Left untouched.</param>
        /// <param name="sampleRate">Their rate in Hz.</param>
        /// <param name="options">The engine and the tempo range; null for <see cref="AnalysisOptions.Default"/>, the tempogram on 90 to 180 BPM.</param>
        /// <returns>The reading, or <see langword="null"/> when no tempo was found.</returns>
        /// <exception cref="ArgumentNullException">When <paramref name="samples"/> is null.</exception>
        /// <exception cref="ArgumentException">
        /// Exactly this type, the JS library's <c>Error</c>: when <paramref name="samples"/> is empty, or holds a NaN
        /// or infinite sample.
        /// </exception>
        /// <exception cref="ArgumentOutOfRangeException">
        /// The JS library's <c>RangeError</c>: when the sample rate is not finite, or is under 122.97509238026915 Hz
        /// for the tempogram, the first rate at which its FFT has a bin above DC, or under 2 Hz or not above twice the lowpass cutoff for the peaks engine.
        /// </exception>
        public static Reading? AnalyzeChannelData(float[] samples, double sampleRate, AnalysisOptions? options = null)
        {
            if (samples is null)
            {
                throw new ArgumentNullException(nameof(samples));
            }

            if (samples.Length == 0)
            {
                throw new ArgumentException("Invalid channel data: expected a non-empty float array.", nameof(samples));
            }

            RequireFiniteSamples(samples);

            AnalysisOptions resolved = options ?? AnalysisOptions.Default;
            Engine engine = resolved.Engine;
            TempoRange range = resolved.TempoRange;
            double audioTo = samples.Length / sampleRate;
            if (engine.Name == EngineName.Tempogram)
            {
                return ToReading(TempogramEngine.Detect(samples, sampleRate, range), audioTo, EngineName.Tempogram, range, true);
            }

            // Engine.Peaks and Engine.PeaksWith always carry a lowpass
            Lowpass lowpass = engine.Lowpass ?? Lowpass.Default;
            RequireLowpassFits(lowpass, sampleRate);
            // After the lowpass, as JS checks a {name: 'peaks', lowpass} engine. Engine.Peaks carries a lowpass too,
            // so a bare 'peaks' call, which JS checks floor first, fails here on the lowpass: a RangeError either way
            if (!(sampleRate >= PeaksEngine.MinSampleRate))
            {
                throw new ArgumentOutOfRangeException(
                    nameof(sampleRate),
                    Invariant($"Invalid sample rate: {sampleRate}. The peaks engine needs at least {PeaksEngine.MinSampleRate} Hz, where the skip after a peak is a whole sample."));
            }

            PeaksEngine.Detection detection = PeaksEngine.Detect(samples, sampleRate, lowpass, range);
            return ToReading(detection.Tempos, audioTo, EngineName.Peaks, range, detection.Calibrated);
        }

        /// <summary>
        /// A NaN or infinite sample is no PCM, and through the peaks lowpass it would turn every later sample into
        /// NaN. The caller can fix its decoding, so it is refused, as the JS library refuses it.
        /// </summary>
        private static void RequireFiniteSamples(float[] samples)
        {
            for (int i = 0; i < samples.Length; i++)
            {
                if (float.IsNaN(samples[i]) || float.IsInfinity(samples[i]))
                {
                    throw new ArgumentException(
                        Invariant($"Invalid channel data: sample {i} is {samples[i]}, and every sample must be a finite number."),
                        nameof(samples));
                }
            }
        }

        /// <summary>The cutoff is stored as a 32-bit float, as Web Audio stores it, and must sit strictly under Nyquist.</summary>
        private static void RequireLowpassFits(Lowpass lowpass, double sampleRate)
        {
            if (double.IsNaN(sampleRate) || double.IsInfinity(sampleRate) || sampleRate <= 0)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(sampleRate),
                    Invariant($"Invalid sample rate: {sampleRate}. Sample rate must be positive."));
            }

            double nyquist = sampleRate / 2;
            float stored = (float)lowpass.Frequency;
            if (!(stored > 0 && stored < nyquist))
            {
                throw new ArgumentOutOfRangeException(
                    nameof(lowpass),
                    Invariant($"The lowpass setting frequency {lowpass.Frequency} is out of range: at a sample rate of {sampleRate} Hz, it must be above 0 and below {nyquist} Hz."));
            }
        }

        /// <summary>
        /// The reading of the top candidate. <c>calibrated</c> is false when the calibration never saw readings found
        /// the way these were, as for a peaks file read relative to its own level: the confidence is then
        /// null, unmeasured.
        /// </summary>
        private static Reading? ToReading(List<Tempo> tempos, double audioTo, EngineName engine, TempoRange range, bool calibrated)
        {
            if (tempos.Count == 0)
            {
                return null;
            }

            Tempo top = tempos[0];
            var candidates = new List<Candidate>();
            for (int i = 0; i < Math.Min(5, tempos.Count); i++)
            {
                long bpm = tempos[i].Whole;
                Relation relation = i == 0 ? Relation.Top : RelationTo(top.Whole, bpm);
                candidates.Add(new Candidate(ToInt(bpm), relation));
            }

            return new Reading(
                ToInt(top.Whole),
                top.Exact,
                calibrated ? Calibration.Calibrate(engine, top.Score, top.Whole, range) : null,
                candidates,
                0,
                audioTo,
                engine);
        }

        /// <summary>TempoRange caps Max at int.MaxValue and no engine reads past its range, so this never throws.</summary>
        private static int ToInt(long bpm)
        {
            if (bpm < int.MinValue || bpm > int.MaxValue)
            {
                throw new InvalidOperationException(Invariant($"A tempo past the range: {bpm}"));
            }

            return (int)bpm;
        }

        /// <summary>A candidate's relation to the top tempo, within 2% of half or double it: contract/transitions.ts.</summary>
        internal static Relation RelationTo(long top, long bpm)
        {
            if (Near(bpm, top / 2.0))
            {
                return Relation.Half;
            }

            return Near(bpm, top * 2.0) ? Relation.Double : Relation.Other;
        }

        private static bool Near(long bpm, double target) => Math.Abs(bpm - target) <= target * Reading.RelationTolerance;

        private static string Invariant(FormattableString text) => text.ToString(CultureInfo.InvariantCulture);
    }
}
