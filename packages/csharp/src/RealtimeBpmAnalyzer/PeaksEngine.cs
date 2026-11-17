using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace RealtimeBpmAnalyzer
{
    /// <summary>
    /// The peaks engine on a whole buffer: the JS library's applyLowpass, findPeaks, identifyIntervals, groupByTempo
    /// and getTopCandidates (core/lowpass.ts, core/peak-detection.ts, core/tempo.ts).
    /// </summary>
    /// <remarks>
    /// Ties are part of the reading: tempos with equal counts keep the order the intervals first met them, through
    /// insertion-ordered maps and a stable sort, as the JS Map and Array.prototype.sort keep it.
    /// </remarks>
    internal static class PeaksEngine
    {
        /// <summary>The lowest rate, in Hz, at which the skip after a peak rounds to a whole sample: JS's peaksMinSampleRate.</summary>
        internal const double MinSampleRate = 2;

        /// <summary>Thresholds descend from one step under this.</summary>
        private const double StartThreshold = 0.95;

        /// <summary>The lowest threshold.</summary>
        private const double MinValidThreshold = 0.2;

        private const double ThresholdStep = 0.05;

        /// <summary>Rungs are rounded to nine decimals, so each one is the literal it stands for.</summary>
        private const double ThresholdDecimals = 1e9;

        /// <summary>A threshold with fewer peaks than this is skipped.</summary>
        private const int MinPeaks = 15;

        /// <summary>Seconds skipped after a peak, past its decay.</summary>
        private const double PeakSkipSeconds = 0.25;

        /// <summary>Each peak is paired with the next ones up to this many places on, this one excluded.</summary>
        private const int MaxIntervalComparisons = 10;

        private const int MaxCandidates = 5;

        /// <param name="samples">The caller's samples, left untouched.</param>
        /// <param name="sampleRate">Their rate, positive and above twice the cutoff (checked by the caller).</param>
        /// <param name="lowpass">The lowpass settings.</param>
        /// <param name="range">The range tempos are folded into.</param>
        /// <returns>Up to 5 candidates, by votes, empty when no threshold found enough peaks.</returns>
        internal static List<Tempo> Detect(float[] samples, double sampleRate, Lowpass lowpass, TempoRange range)
        {
            float[] filtered = ApplyLowpass(samples, sampleRate, lowpass);
            int[] peaks = FindPeaks(filtered, sampleRate);
            OrderedMap<int, int> intervals = IdentifyIntervals(peaks);
            List<Tempo> tempos = GroupByTempo(intervals, sampleRate, range);
            return TopCandidates(tempos);
        }

        /// <summary>
        /// The Web Audio spec's lowpass biquad, with double-precision state and float32 output, as the JS library runs
        /// it in plain JS and browsers render it.
        /// </summary>
        internal static float[] ApplyLowpass(float[] samples, double sampleRate, Lowpass lowpass)
        {
            double w0 = Math.PI * (lowpass.Frequency / (sampleRate / 2));
            double cosW0 = Math.Cos(w0);
            double alpha = Math.Sin(w0) / (2 * Math.Pow(10, lowpass.Q / 20));
            double a0 = 1 + alpha;
            double b0 = ((1 - cosW0) / 2) / a0;
            double b1 = (1 - cosW0) / a0;
            double b2 = ((1 - cosW0) / 2) / a0;
            double a1 = (-2 * cosW0) / a0;
            double a2 = (1 - alpha) / a0;

            var output = new float[samples.Length];
            double x1 = 0;
            double x2 = 0;
            double y1 = 0;
            double y2 = 0;
            for (int i = 0; i < samples.Length; i++)
            {
                double x0 = samples[i];
                double y0 = (b0 * x0) + (b1 * x1) + (b2 * x2) - (a1 * y1) - (a2 * y2);
                output[i] = (float)y0;
                x2 = x1;
                x1 = x0;
                y2 = y1;
                y1 = y0;
            }

            return output;
        }

        /// <summary>The thresholds from one step under the start down to the first at or under the floor: 0.9 to 0.2.</summary>
        internal static double[] ThresholdLadder()
        {
            int maxRungs = Math.Max(1, (int)Math.Ceiling(StartThreshold / ThresholdStep));
            var rungs = new List<double>(maxRungs);
            for (int n = 1; n <= maxRungs; n++)
            {
                double threshold = JsMath.Round((StartThreshold - (n * ThresholdStep)) * ThresholdDecimals) / ThresholdDecimals;
                rungs.Add(threshold);
                if (threshold <= MinValidThreshold)
                {
                    break;
                }
            }

            return rungs.ToArray();
        }

        /// <summary>The peaks at the highest threshold that has at least <see cref="MinPeaks"/> of them, or none.</summary>
        internal static int[] FindPeaks(float[] data, double sampleRate)
        {
            double skip = JsMath.Round(PeakSkipSeconds * sampleRate);
            // Each pass of FindPeaksAtThreshold moves on by at least one sample only while the skip is one sample or
            // more, which bounds its loop to data.Length passes. BpmAnalyzer refuses a rate under 2 Hz, where it is 0,
            // before this, as the JS library does (RBA-260)
            if (!(skip >= 1))
            {
                throw new ArgumentOutOfRangeException(
                    nameof(sampleRate),
                    string.Format(CultureInfo.InvariantCulture, "Invalid sample rate: {0}. The peaks engine needs at least {1} Hz, where the skip after a peak is a whole sample.", sampleRate, MinSampleRate));
            }

            int step = skip >= int.MaxValue ? int.MaxValue : (int)skip;
            foreach (double threshold in ThresholdLadder())
            {
                int[] peaks = FindPeaksAtThreshold(data, threshold, step);
                if (peaks.Length >= MinPeaks)
                {
                    return peaks;
                }
            }

            return Array.Empty<int>();
        }

        private static int[] FindPeaksAtThreshold(float[] data, double threshold, int step)
        {
            var peaks = new List<int>();
            // long: a step near int.MaxValue must not wrap the index past the end
            for (long i = 0; i < data.Length; i++)
            {
                // The float sample against the double threshold, in double, as in JS: a float threshold would miss a
                // sample that is exactly (float)0.85 (conformance/readme.md, peaks-threshold-edge-4k)
                if (data[i] > threshold)
                {
                    peaks.Add((int)i);
                    // Past the peak's decay: the loop's own increment makes it a skip of `step`
                    i += step - 1;
                }
            }

            return peaks.ToArray();
        }

        /// <summary>Each interval between a peak and the next nine, with how often it occurs, in first-seen order.</summary>
        internal static OrderedMap<int, int> IdentifyIntervals(int[] peaks)
        {
            var intervals = new OrderedMap<int, int>();
            for (int n = 0; n < peaks.Length; n++)
            {
                for (int i = 1; i < MaxIntervalComparisons; i++)
                {
                    int next = n + i;
                    if (next >= peaks.Length)
                    {
                        break;
                    }

                    int interval = peaks[next] - peaks[n];
                    intervals.Set(interval, intervals.TryGetValue(interval, out int count) ? count + 1 : 1);
                }
            }

            return intervals;
        }

        /// <summary>Folds each interval's tempo into the range by octaves, and groups the votes by the whole BPM they round to.</summary>
        internal static List<Tempo> GroupByTempo(OrderedMap<int, int> intervalCounts, double sampleRate, TempoRange range)
        {
            double min = range.Min;
            double max = range.Max;
            var groups = new OrderedMap<long, Votes>();
            // The same votes seen from across the range's edge, for the exact tempo only
            var acrossEdge = new OrderedMap<long, Votes>();

            for (int entry = 0; entry < intervalCounts.Count; entry++)
            {
                int interval = intervalCounts.KeyAt(entry);
                int count = intervalCounts.ValueAt(entry);
                if (interval == 0)
                {
                    continue;
                }

                double folded = 60 / (Math.Abs((double)interval) / sampleRate);
                while (folded < min)
                {
                    folded *= 2;
                }

                while (folded > max)
                {
                    folded /= 2;
                }

                AddVote(groups, folded, count);
                // An octave image the fold could have come from
                if (folded * 2 > max)
                {
                    AddVote(acrossEdge, folded * 2, count);
                }

                if (folded / 2 < min)
                {
                    AddVote(acrossEdge, folded / 2, count);
                }
            }

            return WithScores(groups, acrossEdge);
        }

        private static void AddVote(OrderedMap<long, Votes> groups, double tempo, int count)
        {
            long key = (long)JsMath.Round(tempo);
            groups.TryGetValue(key, out Votes votes);
            // A replaced key keeps its place, as in a JS Map
            groups.Set(key, new Votes(votes.Count + count, votes.WeightedSum + (count * tempo)));
        }

        /// <summary>
        /// Each tempo's raw score and exact tempo from the ±1 BPM window around it: the score is the window's share of
        /// all votes, and the exact tempo the vote-weighted mean of the window, the votes folded across the range's
        /// edge included.
        /// </summary>
        private static List<Tempo> WithScores(OrderedMap<long, Votes> groups, OrderedMap<long, Votes> acrossEdge)
        {
            long totalVotes = 0;
            for (int i = 0; i < groups.Count; i++)
            {
                totalVotes += groups.ValueAt(i).Count;
            }

            var tempos = new List<Tempo>(groups.Count);
            for (int g = 0; g < groups.Count; g++)
            {
                long tempo = groups.KeyAt(g);
                long support = 0;
                long foldedSupport = 0;
                double weightedSum = 0;
                // The JS sums run over the window first, then the images across the edge, in this order
                for (int side = 0; side < 2; side++)
                {
                    OrderedMap<long, Votes> source = side == 0 ? groups : acrossEdge;
                    for (long key = tempo - 1; key <= tempo + 1; key++)
                    {
                        source.TryGetValue(key, out Votes votes);
                        if (side == 0)
                        {
                            support += votes.Count;
                        }

                        foldedSupport += votes.Count;
                        weightedSum += votes.WeightedSum;
                    }
                }

                double exact = foldedSupport > 0 ? weightedSum / foldedSupport : tempo;
                double score = totalVotes > 0 ? (double)support / totalVotes : 0;
                tempos.Add(new Tempo(tempo, exact, groups.ValueAt(g).Count, score));
            }

            return tempos;
        }

        /// <summary>The five tempos with the most votes.</summary>
        private static List<Tempo> TopCandidates(List<Tempo> tempos) =>
            // OrderByDescending is a stable sort, as Array.prototype.sort is: equal counts keep their first-seen
            // order. List.Sort is not stable, and would reorder tied candidates
            tempos.OrderByDescending(tempo => tempo.Count).Take(MaxCandidates).ToList();

        /// <summary>The interval votes that rounded to one whole BPM, and the sum of their unrounded tempos weighted by count.</summary>
        private readonly struct Votes
        {
            internal Votes(long count, double weightedSum)
            {
                Count = count;
                WeightedSum = weightedSum;
            }

            internal long Count { get; }

            internal double WeightedSum { get; }
        }
    }
}
