package com.realtimebpmanalyzer;

/**
 * The engine option: the JS library's {@code engine}, {@code 'tempogram'}, {@code 'peaks'} or
 * {@code {name: 'peaks', lowpass}}. Immutable.
 */
public final class Engine {
    /** The default engine, an onset tempogram. It takes no setting. */
    public static final Engine TEMPOGRAM = new Engine(EngineName.TEMPOGRAM, null);
    /** The peaks engine, behind the default lowpass. */
    public static final Engine PEAKS = new Engine(EngineName.PEAKS, Lowpass.DEFAULT);

    private final EngineName name;
    private final Lowpass lowpass;

    private Engine(EngineName name, Lowpass lowpass) {
        this.name = name;
        this.lowpass = lowpass;
    }

    /**
     * @param lowpass The lowpass the peaks engine reads through
     * @return The peaks engine behind that lowpass
     */
    public static Engine peaks(Lowpass lowpass) {
        if (lowpass == null) {
            throw new NullPointerException("lowpass");
        }
        return new Engine(EngineName.PEAKS, lowpass);
    }

    /**
     * @return Which engine
     */
    public EngineName name() {
        return name;
    }

    /**
     * @return The peaks engine's lowpass, or {@code null} for the tempogram, which reads the full band
     */
    public Lowpass lowpass() {
        return lowpass;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Engine)) {
            return false;
        }
        Engine that = (Engine) other;
        return name == that.name && (lowpass == null ? that.lowpass == null : lowpass.equals(that.lowpass));
    }

    @Override
    public int hashCode() {
        return 31 * name.hashCode() + (lowpass == null ? 0 : lowpass.hashCode());
    }

    @Override
    public String toString() {
        return lowpass == null ? "Engine{" + name.id() + "}" : "Engine{" + name.id() + ", " + lowpass + "}";
    }
}
