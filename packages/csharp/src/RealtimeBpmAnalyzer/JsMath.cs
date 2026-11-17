using System;

namespace RealtimeBpmAnalyzer
{
    /// <summary>The two JS <c>Math</c> functions whose .NET namesakes differ, or that netstandard2.0 lacks.</summary>
    internal static class JsMath
    {
        private static readonly double Ln2 = Math.Log(2);

        /// <summary>
        /// JS <c>Math.round</c>: half up, towards +infinity, so 2.5 gives 3 and -2.5 gives -2. .NET's
        /// <see cref="Math.Round(double)"/> rounds half to even, which reads <c>kick-122.5-44k</c> as 122, not 123.
        /// <c>Math.Floor(x + 0.5)</c> is wrong too, at 0.49999999999999994, where the sum rounds up to 1.
        /// </summary>
        internal static double Round(double value)
        {
            double floor = Math.Floor(value);
            // Exact: under 2^52 the fraction is representable, and above it every double is whole
            return value - floor >= 0.5 ? floor + 1 : floor;
        }

        /// <summary>
        /// The base-2 logarithm. netstandard2.0 has no <c>Math.Log2</c>: this is the natural logarithm's quotient,
        /// which can differ from JS's in the last bit, as the Java port's does (readme, "Differences").
        /// </summary>
        internal static double Log2(double value) => Math.Log(value) / Ln2;
    }
}
