using System;

namespace RealtimeBpmAnalyzer
{
    /// <summary>The two tempo engines, the JS library's <c>'tempogram'</c> and <c>'peaks'</c>.</summary>
    public enum EngineName
    {
        /// <summary>The default: an onset tempogram over the full band, searching the tempo range.</summary>
        Tempogram,

        /// <summary>Peaks of the lowpassed signal, whose intervals vote for a tempo folded into the tempo range.</summary>
        Peaks,
    }

    /// <summary>
    /// The engine option: the JS library's <c>engine</c>, <c>'tempogram'</c>, <c>'peaks'</c> or
    /// <c>{name: 'peaks', lowpass}</c>. Immutable.
    /// </summary>
    public sealed class Engine : IEquatable<Engine>
    {
        /// <summary>The default engine, an onset tempogram. It takes no setting.</summary>
        public static readonly Engine Tempogram = new Engine(EngineName.Tempogram, null);

        /// <summary>The peaks engine, behind <see cref="RealtimeBpmAnalyzer.Lowpass.Default"/>.</summary>
        public static readonly Engine Peaks = new Engine(EngineName.Peaks, RealtimeBpmAnalyzer.Lowpass.Default);

        private Engine(EngineName name, Lowpass? lowpass)
        {
            Name = name;
            Lowpass = lowpass;
        }

        /// <summary>Which engine.</summary>
        public EngineName Name { get; }

        /// <summary>The peaks engine's lowpass, or <see langword="null"/> for the tempogram, which reads the full band.</summary>
        public Lowpass? Lowpass { get; }

        /// <summary>The peaks engine behind its own lowpass.</summary>
        /// <param name="lowpass">The lowpass the peaks engine reads through.</param>
        /// <returns>The peaks engine behind that lowpass.</returns>
        /// <exception cref="ArgumentNullException">When <paramref name="lowpass"/> is null.</exception>
        public static Engine PeaksWith(Lowpass lowpass) =>
            new Engine(EngineName.Peaks, lowpass ?? throw new ArgumentNullException(nameof(lowpass)));

        /// <inheritdoc/>
        public bool Equals(Engine? other) =>
            other is not null && Name == other.Name && Equals(Lowpass, other.Lowpass);

        /// <inheritdoc/>
        public override bool Equals(object? obj) => Equals(obj as Engine);

        /// <inheritdoc/>
        public override int GetHashCode() => unchecked((31 * (int)Name) + (Lowpass?.GetHashCode() ?? 0));

        /// <inheritdoc/>
        public override string ToString() =>
            Lowpass is null ? $"Engine {{ Name = {Name} }}" : $"Engine {{ Name = {Name}, Lowpass = {Lowpass} }}";
    }
}
