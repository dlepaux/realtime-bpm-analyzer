using System;
using System.Globalization;

namespace RealtimeBpmAnalyzer
{
    /// <summary>
    /// The biquad lowpass the peaks engine reads the bass through: the JS library's <c>engine.lowpass</c>, with the
    /// Web Audio <c>BiquadFilterNode</c> coefficients. Immutable.
    /// </summary>
    public sealed class Lowpass : IEquatable<Lowpass>
    {
        /// <summary>The default cutoff, in Hz.</summary>
        public const double DefaultFrequency = 200;

        /// <summary>The default resonance, in dB.</summary>
        public const double DefaultQ = 1;

        /// <summary>The lowest <see cref="Q"/>, in dB: under it, Web Audio's 32-bit resonance term stops being a normal float.</summary>
        public const double MinQ = -758;

        /// <summary>The highest <see cref="Q"/>, in dB: over it, Web Audio's 32-bit resonance term overflows.</summary>
        public const double MaxQ = 770;

        /// <summary>200 Hz and 1 dB.</summary>
        public static readonly Lowpass Default = new Lowpass(DefaultFrequency, DefaultQ);

        /// <summary>
        /// Lowpass settings. The cutoff is checked again at analysis time, against half the samples' sample rate.
        /// </summary>
        /// <param name="frequency">The cutoff, in Hz.</param>
        /// <param name="q">The resonance at the cutoff, in dB.</param>
        /// <exception cref="ArgumentOutOfRangeException">
        /// When a setting is NaN or infinite, the cutoff is not above 0 as the 32-bit float Web Audio stores, or
        /// <paramref name="q"/> is not from <see cref="MinQ"/> to <see cref="MaxQ"/>.
        /// </exception>
        public Lowpass(double frequency = DefaultFrequency, double q = DefaultQ)
        {
            RequireFinite(nameof(frequency), frequency);
            RequireFinite(nameof(q), q);
            if (!((float)frequency > 0))
            {
                throw new ArgumentOutOfRangeException(
                    nameof(frequency),
                    Invariant($"The lowpass setting frequency {frequency} is out of range: it must be above 0 Hz."));
            }

            if (q < MinQ || q > MaxQ)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(q),
                    Invariant($"The lowpass setting q {q} is out of range: it must be from {MinQ} to {MaxQ} dB."));
            }

            Frequency = frequency;
            Q = q;
        }

        /// <summary>The cutoff, in Hz.</summary>
        public double Frequency { get; }

        /// <summary>The resonance at the cutoff, in dB.</summary>
        public double Q { get; }

        /// <inheritdoc/>
        public bool Equals(Lowpass? other) =>
            other is not null && Frequency.Equals(other.Frequency) && Q.Equals(other.Q);

        /// <inheritdoc/>
        public override bool Equals(object? obj) => Equals(obj as Lowpass);

        /// <inheritdoc/>
        public override int GetHashCode() => unchecked((31 * Frequency.GetHashCode()) + Q.GetHashCode());

        /// <inheritdoc/>
        public override string ToString() => Invariant($"Lowpass {{ Frequency = {Frequency}, Q = {Q} }}");

        private static void RequireFinite(string name, double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                throw new ArgumentOutOfRangeException(
                    name,
                    Invariant($"The lowpass setting {name} {value} is not a finite number."));
            }
        }

        private static string Invariant(FormattableString text) => text.ToString(CultureInfo.InvariantCulture);
    }
}
