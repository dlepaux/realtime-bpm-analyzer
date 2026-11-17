namespace RealtimeBpmAnalyzer
{
    /// <summary>One engine candidate before it becomes a <see cref="Reading"/>: the JS library's internal <c>Tempo</c>.</summary>
    internal readonly struct Tempo
    {
        internal Tempo(long whole, double exact, long count, double score)
        {
            Whole = whole;
            Exact = exact;
            Count = count;
            Score = score;
        }

        /// <summary>The whole BPM.</summary>
        internal long Whole { get; }

        /// <summary>The same tempo, unrounded.</summary>
        internal double Exact { get; }

        /// <summary>What ranks the candidates: the peaks engine's vote count, the tempogram's scaled salience.</summary>
        internal long Count { get; }

        /// <summary>The engine's raw score, 0 to 1, which the calibration maps to a confidence.</summary>
        internal double Score { get; }
    }
}
