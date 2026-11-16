package io.github.dlepaux.realtimebpmanalyzer;

/**
 * The biquad lowpass the peaks engine reads the bass through: the JS library's {@code engine.lowpass}, with the Web
 * Audio {@code BiquadFilterNode} coefficients. Immutable.
 */
public final class Lowpass {
    /** The default cutoff, in Hz. */
    public static final double DEFAULT_FREQUENCY = 200;
    /** The default resonance, in dB. */
    public static final double DEFAULT_Q = 1;
    /** The lowest {@code q}, in dB: under it, Web Audio's 32-bit resonance term stops being a normal float. */
    public static final double MIN_Q = -758;
    /** The highest {@code q}, in dB: over it, Web Audio's 32-bit resonance term overflows. */
    public static final double MAX_Q = 770;

    /** 200 Hz and 1 dB. */
    public static final Lowpass DEFAULT = new Lowpass(DEFAULT_FREQUENCY, DEFAULT_Q);

    private final double frequency;
    private final double q;

    private Lowpass(double frequency, double q) {
        this.frequency = frequency;
        this.q = q;
    }

    /**
     * Lowpass settings. The cutoff is checked again at analysis time, against half the samples' sample rate.
     *
     * @param frequency The cutoff, in Hz
     * @param q The resonance at the cutoff, in dB
     * @return The settings
     * @throws OutOfRangeException When a setting is NaN or infinite, the cutoff is not above 0 as the 32-bit float Web
     * Audio stores, or {@code q} is not from {@link #MIN_Q} to {@link #MAX_Q}
     */
    public static Lowpass of(double frequency, double q) {
        requireFinite("frequency", frequency);
        requireFinite("q", q);
        if (!((float) frequency > 0)) {
            throw new OutOfRangeException("The lowpass setting frequency " + frequency
                + " is out of range: it must be above 0 Hz.");
        }
        if (q < MIN_Q || q > MAX_Q) {
            throw new OutOfRangeException("The lowpass setting q " + q + " is out of range: it must be from "
                + MIN_Q + " to " + MAX_Q + " dB.");
        }
        return new Lowpass(frequency, q);
    }

    private static void requireFinite(String name, double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            throw new OutOfRangeException("The lowpass setting " + name + " " + value + " is not a finite number.");
        }
    }

    /**
     * @param frequency The cutoff, in Hz
     * @return These settings with another cutoff
     * @throws OutOfRangeException As {@link #of} does
     */
    public Lowpass withFrequency(double frequency) {
        return of(frequency, q);
    }

    /**
     * @param q The resonance, in dB
     * @return These settings with another resonance
     * @throws OutOfRangeException As {@link #of} does
     */
    public Lowpass withQ(double q) {
        return of(frequency, q);
    }

    /**
     * @return The cutoff, in Hz
     */
    public double frequency() {
        return frequency;
    }

    /**
     * @return The resonance at the cutoff, in dB
     */
    public double q() {
        return q;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Lowpass)) {
            return false;
        }
        Lowpass that = (Lowpass) other;
        return Double.compare(frequency, that.frequency) == 0 && Double.compare(q, that.q) == 0;
    }

    @Override
    public int hashCode() {
        return 31 * Double.valueOf(frequency).hashCode() + Double.valueOf(q).hashCode();
    }

    @Override
    public String toString() {
        return "Lowpass{frequency=" + frequency + ", q=" + q + "}";
    }
}
