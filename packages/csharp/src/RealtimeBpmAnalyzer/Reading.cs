using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;

namespace RealtimeBpmAnalyzer
{
    /// <summary>How a candidate's tempo relates to the reading's tempo. May grow in a minor release, as in the JS library.</summary>
    public enum Relation
    {
        /// <summary>The reading's own tempo. Only the first candidate has it.</summary>
        Top,

        /// <summary>Half the top tempo, within <see cref="Reading.RelationTolerance"/>.</summary>
        Half,

        /// <summary>Twice the top tempo, within <see cref="Reading.RelationTolerance"/>.</summary>
        // The JS library names this relation "double"; the same name in every port keeps readings comparable
#pragma warning disable CA1720
        Double,
#pragma warning restore CA1720

        /// <summary>Anything else, 3:2 relatives included.</summary>
        Other,
    }

    /// <summary>A tempo the engine considered, with how it relates to the reading's tempo. Immutable.</summary>
    public sealed class Candidate : IEquatable<Candidate>
    {
        internal Candidate(int bpm, Relation relation)
        {
            Bpm = bpm;
            Relation = relation;
        }

        /// <summary>The tempo, a whole BPM.</summary>
        public int Bpm { get; }

        /// <summary>How it relates to the reading's tempo.</summary>
        public Relation Relation { get; }

        /// <inheritdoc/>
        public bool Equals(Candidate? other) => other is not null && Bpm == other.Bpm && Relation == other.Relation;

        /// <inheritdoc/>
        public override bool Equals(object? obj) => Equals(obj as Candidate);

        /// <inheritdoc/>
        public override int GetHashCode() => unchecked((31 * Bpm) + (int)Relation);

        /// <inheritdoc/>
        public override string ToString() =>
            string.Format(CultureInfo.InvariantCulture, "Candidate {{ Bpm = {0}, Relation = {1} }}", Bpm, Relation);
    }

    /// <summary>
    /// The tempo of the samples analysed, the JS library's <c>Reading</c>. Immutable.
    /// <see cref="BpmAnalyzer.AnalyzeChannelData"/> returns <see langword="null"/> instead when it finds no tempo.
    /// </summary>
    public sealed class Reading : IEquatable<Reading>
    {
        /// <summary>Relative tolerance of <see cref="Relation.Half"/> and <see cref="Relation.Double"/>: within 2% of the exact ratio.</summary>
        public const double RelationTolerance = 0.02;

        internal Reading(
            int bpm,
            double bpmExact,
            double? confidence,
            IList<Candidate> candidates,
            double audioFrom,
            double audioTo,
            EngineName engine)
        {
            Bpm = bpm;
            BpmExact = bpmExact;
            Confidence = confidence;
            Candidates = new ReadOnlyCollection<Candidate>(candidates.ToArray());
            AudioFrom = audioFrom;
            AudioTo = audioTo;
            Engine = engine;
        }

        /// <summary>The tempo, a whole BPM inside the tempo range. Equal to the first candidate's.</summary>
        public int Bpm { get; }

        /// <summary>The same tempo, unrounded.</summary>
        public double BpmExact { get; }

        /// <summary>
        /// The chance, from 0 to 1, that <see cref="Bpm"/> is right: a confidence of 0.8 is right about 80% of the
        /// time. <see langword="null"/> when it was not measured: the reading's tempo is outside 90 to 180 BPM, or the
        /// analysis ran on any tempo range other than 90 to 180. <see langword="null"/> is never a small number.
        /// </summary>
        public double? Confidence { get; }

        /// <summary>One to five tempos the engine considered, best first, the first one with <see cref="Relation.Top"/>.</summary>
        public IReadOnlyList<Candidate> Candidates { get; }

        /// <summary>Where the analysed audio starts, in seconds: always 0 for a whole-buffer analysis.</summary>
        public double AudioFrom { get; }

        /// <summary>Where the analysed audio ends, in seconds: the sample count divided by the sample rate.</summary>
        public double AudioTo { get; }

        /// <summary>
        /// The engine that measured the tempo: the <see cref="RealtimeBpmAnalyzer.Engine.Name"/> of
        /// <see cref="AnalysisOptions.Engine"/>, without its settings.
        /// </summary>
        public EngineName Engine { get; }

        /// <inheritdoc/>
        public bool Equals(Reading? other) =>
            other is not null
            && Bpm == other.Bpm
            && BpmExact.Equals(other.BpmExact)
            && Nullable.Equals(Confidence, other.Confidence)
            && Candidates.SequenceEqual(other.Candidates)
            && AudioFrom.Equals(other.AudioFrom)
            && AudioTo.Equals(other.AudioTo)
            && Engine == other.Engine;

        /// <inheritdoc/>
        public override bool Equals(object? obj) => Equals(obj as Reading);

        /// <inheritdoc/>
        public override int GetHashCode()
        {
            unchecked
            {
                int hash = Bpm;
                hash = (31 * hash) + BpmExact.GetHashCode();
                hash = (31 * hash) + Confidence.GetHashCode();
                foreach (Candidate candidate in Candidates)
                {
                    hash = (31 * hash) + candidate.GetHashCode();
                }

                hash = (31 * hash) + AudioFrom.GetHashCode();
                hash = (31 * hash) + AudioTo.GetHashCode();
                return (31 * hash) + (int)Engine;
            }
        }

        /// <inheritdoc/>
        public override string ToString() =>
            string.Format(
                CultureInfo.InvariantCulture,
                "Reading {{ Bpm = {0}, BpmExact = {1}, Confidence = {2}, Candidates = [{3}], AudioFrom = {4}, AudioTo = {5}, Engine = {6} }}",
                Bpm,
                BpmExact,
                Confidence?.ToString(CultureInfo.InvariantCulture) ?? "null",
                string.Join(", ", Candidates),
                AudioFrom,
                AudioTo,
                Engine);
    }
}
