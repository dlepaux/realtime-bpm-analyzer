package io.github.dlepaux.realtimebpmanalyzer;

/**
 * The range, in BPM, a tempo is reported in: the JS library's {@code tempoRange}. Immutable.
 *
 * <p>The peaks engine folds every tempo into it by octaves, and the tempogram searches it. The confidence is measured
 * on {@link #DEFAULT} only: on any other range it is {@code null}.
 */
public final class TempoRange {
    /** 90 to 180 BPM, the default, the range the confidence was measured on. */
    public static final TempoRange DEFAULT = new TempoRange(90, 180);

    private final double min;
    private final double max;

    private TempoRange(double min, double max) {
        this.min = min;
        this.max = max;
    }

    /**
     * A range to read the tempo in. Equal to {@link #DEFAULT} when it is 90 to 180, which keeps the confidence.
     *
     * @param min The lowest tempo, in BPM
     * @param max The highest tempo, in BPM
     * @return The range
     * @throws OutOfRangeException When a bound is not a positive finite number, or {@code max} is under twice
     * {@code min}: folding moves a tempo by whole octaves, so a narrower range can leave it outside both bounds. Also
     * when {@code max} is above {@link Integer#MAX_VALUE}, so that a reading's whole BPM fits an {@code int}, and when
     * {@code max / min} is past the largest double, which leaves the tempogram's grid no finite size. The JS library
     * has both bounds too.
     */
    public static TempoRange of(double min, double max) {
        if (!isPositiveFinite(min) || !isPositiveFinite(max)) {
            throw new OutOfRangeException("Invalid tempoRange: min and max must be positive finite numbers (got min="
                + min + ", max=" + max + ").");
        }
        if (max < min * 2) {
            throw new OutOfRangeException("Invalid tempoRange: max (" + max + ") must be at least twice min (" + min
                + ") so that every tempo has an octave inside the range.");
        }
        if (max > Integer.MAX_VALUE) {
            throw new OutOfRangeException("Invalid tempoRange: max (" + max + ") must be at most "
                + Integer.MAX_VALUE + " BPM, so that a tempo fits an int.");
        }
        if (Double.isInfinite(max / min)) {
            throw new OutOfRangeException("Invalid tempoRange: max / min (" + max + " / " + min
                + ") is too large, past the largest finite number.");
        }
        return new TempoRange(min, max);
    }

    private static boolean isPositiveFinite(double value) {
        return value > 0 && !Double.isInfinite(value);
    }

    /**
     * @return The lowest tempo, in BPM
     */
    public double min() {
        return min;
    }

    /**
     * @return The highest tempo, in BPM
     */
    public double max() {
        return max;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof TempoRange)) {
            return false;
        }
        TempoRange that = (TempoRange) other;
        return Double.compare(min, that.min) == 0 && Double.compare(max, that.max) == 0;
    }

    @Override
    public int hashCode() {
        return 31 * Double.valueOf(min).hashCode() + Double.valueOf(max).hashCode();
    }

    @Override
    public String toString() {
        return "TempoRange{min=" + min + ", max=" + max + "}";
    }
}
