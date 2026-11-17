using System;

namespace RealtimeBpmAnalyzer
{
    /// <summary>
    /// The options of <see cref="BpmAnalyzer.AnalyzeChannelData"/>: the JS library's <c>engine</c> and
    /// <c>tempoRange</c>, with the same defaults. Immutable.
    /// </summary>
    /// <example>
    /// <code>
    /// var options = new AnalysisOptions(
    ///     engine: Engine.PeaksWith(new Lowpass(frequency: 150)),
    ///     tempoRange: new TempoRange(60, 140));
    /// </code>
    /// </example>
    public sealed class AnalysisOptions : IEquatable<AnalysisOptions>
    {
        /// <summary>The tempogram engine on 90 to 180 BPM.</summary>
        public static readonly AnalysisOptions Default = new AnalysisOptions();

        /// <summary>Options for an analysis. A null argument keeps its default.</summary>
        /// <param name="engine">The engine, <see cref="RealtimeBpmAnalyzer.Engine.Tempogram"/> by default.</param>
        /// <param name="tempoRange">The range the tempo is reported in, <see cref="RealtimeBpmAnalyzer.TempoRange.Default"/> by default.</param>
        public AnalysisOptions(Engine? engine = null, TempoRange? tempoRange = null)
        {
            Engine = engine ?? Engine.Tempogram;
            TempoRange = tempoRange ?? TempoRange.Default;
        }

        /// <summary>The engine.</summary>
        public Engine Engine { get; }

        /// <summary>The range the tempo is reported in.</summary>
        public TempoRange TempoRange { get; }

        /// <summary>These options with another engine.</summary>
        /// <param name="engine">The engine.</param>
        /// <returns>A copy with that engine.</returns>
        public AnalysisOptions WithEngine(Engine engine) =>
            new AnalysisOptions(engine ?? throw new ArgumentNullException(nameof(engine)), TempoRange);

        /// <summary>These options with another tempo range.</summary>
        /// <param name="tempoRange">The range.</param>
        /// <returns>A copy with that range.</returns>
        public AnalysisOptions WithTempoRange(TempoRange tempoRange) =>
            new AnalysisOptions(Engine, tempoRange ?? throw new ArgumentNullException(nameof(tempoRange)));

        /// <inheritdoc/>
        public bool Equals(AnalysisOptions? other) =>
            other is not null && Engine.Equals(other.Engine) && TempoRange.Equals(other.TempoRange);

        /// <inheritdoc/>
        public override bool Equals(object? obj) => Equals(obj as AnalysisOptions);

        /// <inheritdoc/>
        public override int GetHashCode() => unchecked((31 * Engine.GetHashCode()) + TempoRange.GetHashCode());

        /// <inheritdoc/>
        public override string ToString() => $"AnalysisOptions {{ Engine = {Engine}, TempoRange = {TempoRange} }}";
    }
}
