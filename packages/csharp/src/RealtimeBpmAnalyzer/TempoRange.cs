using System;
using System.Globalization;

namespace RealtimeBpmAnalyzer
{
    /// <summary>
    /// The range, in BPM, a tempo is reported in: the JS library's <c>tempoRange</c>. Immutable.
    /// </summary>
    /// <remarks>
    /// The peaks engine folds every tempo into it by octaves, and the tempogram searches it. The confidence is measured
    /// on <see cref="Default"/> only: on any other range it is <see langword="null"/>.
    /// </remarks>
    public sealed class TempoRange : IEquatable<TempoRange>
    {
        /// <summary>The lowest tempo of the default range, in BPM.</summary>
        public const double DefaultMin = 90;

        /// <summary>The highest tempo of the default range, in BPM.</summary>
        public const double DefaultMax = 180;

        /// <summary>The largest <see cref="Max"/>, so that a reading's whole BPM fits an <see cref="int"/>.</summary>
        public const double LargestMax = int.MaxValue;

        /// <summary>90 to 180 BPM, the default, the range the confidence was measured on.</summary>
        public static readonly TempoRange Default = new TempoRange(DefaultMin, DefaultMax);

        /// <summary>A range to read the tempo in. Equal to <see cref="Default"/> when it is 90 to 180, which keeps the confidence.</summary>
        /// <param name="min">The lowest tempo, in BPM.</param>
        /// <param name="max">The highest tempo, in BPM.</param>
        /// <exception cref="ArgumentOutOfRangeException">
        /// When a bound is not a positive finite number; when <paramref name="max"/> is under twice
        /// <paramref name="min"/>, since folding moves a tempo by whole octaves and a narrower range can leave it
        /// outside both bounds; when <paramref name="max"/> is above <see cref="LargestMax"/>; or when
        /// <c>max / min</c> is past the largest double, which leaves the tempogram's grid no finite size. The JS
        /// library refuses the same values with a RangeError.
        /// </exception>
        public TempoRange(double min, double max)
        {
            if (!IsPositiveFinite(min) || !IsPositiveFinite(max))
            {
                throw new ArgumentOutOfRangeException(
                    IsPositiveFinite(min) ? nameof(max) : nameof(min),
                    Invariant($"Invalid tempoRange: min and max must be positive finite numbers (got min={min}, max={max})."));
            }

            if (max < min * 2)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(max),
                    Invariant($"Invalid tempoRange: max ({max}) must be at least twice min ({min}) so that every tempo has an octave inside the range."));
            }

            if (max > LargestMax)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(max),
                    Invariant($"Invalid tempoRange: max ({max}) must be at most {LargestMax} BPM, so that a tempo fits an int."));
            }

            if (double.IsInfinity(max / min))
            {
                throw new ArgumentOutOfRangeException(
                    nameof(min),
                    Invariant($"Invalid tempoRange: max / min ({max} / {min}) is too large, past the largest finite number."));
            }

            Min = min;
            Max = max;
        }

        /// <summary>The lowest tempo, in BPM.</summary>
        public double Min { get; }

        /// <summary>The highest tempo, in BPM.</summary>
        public double Max { get; }

        /// <inheritdoc/>
        public bool Equals(TempoRange? other) =>
            other is not null && Min.Equals(other.Min) && Max.Equals(other.Max);

        /// <inheritdoc/>
        public override bool Equals(object? obj) => Equals(obj as TempoRange);

        /// <inheritdoc/>
        public override int GetHashCode() => unchecked((31 * Min.GetHashCode()) + Max.GetHashCode());

        /// <inheritdoc/>
        public override string ToString() => Invariant($"TempoRange {{ Min = {Min}, Max = {Max} }}");

        private static bool IsPositiveFinite(double value) => value > 0 && !double.IsInfinity(value);

        private static string Invariant(FormattableString text) => text.ToString(CultureInfo.InvariantCulture);
    }
}
