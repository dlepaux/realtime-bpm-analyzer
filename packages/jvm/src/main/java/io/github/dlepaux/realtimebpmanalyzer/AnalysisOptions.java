package io.github.dlepaux.realtimebpmanalyzer;

/**
 * The options of {@link BpmAnalyzer#analyzeChannelData}: the JS library's {@code engine} and {@code tempoRange}, with
 * the same defaults. Immutable: each {@code with} method returns a copy.
 *
 * <pre>{@code
 * AnalysisOptions options = AnalysisOptions.DEFAULT
 *     .withEngine(Engine.peaks(Lowpass.DEFAULT.withFrequency(150)))
 *     .withTempoRange(TempoRange.of(60, 140));
 * }</pre>
 */
public final class AnalysisOptions {
    /** The tempogram engine on 90 to 180 BPM. */
    public static final AnalysisOptions DEFAULT = new AnalysisOptions(Engine.TEMPOGRAM, TempoRange.DEFAULT);

    private final Engine engine;
    private final TempoRange tempoRange;

    private AnalysisOptions(Engine engine, TempoRange tempoRange) {
        this.engine = engine;
        this.tempoRange = tempoRange;
    }

    /**
     * @param engine The engine
     * @return These options with that engine
     */
    public AnalysisOptions withEngine(Engine engine) {
        if (engine == null) {
            throw new NullPointerException("engine");
        }
        return new AnalysisOptions(engine, tempoRange);
    }

    /**
     * @param tempoRange The range the tempo is reported in
     * @return These options with that range
     */
    public AnalysisOptions withTempoRange(TempoRange tempoRange) {
        if (tempoRange == null) {
            throw new NullPointerException("tempoRange");
        }
        return new AnalysisOptions(engine, tempoRange);
    }

    /**
     * @return The engine, {@link Engine#TEMPOGRAM} by default
     */
    public Engine engine() {
        return engine;
    }

    /**
     * @return The tempo range, {@link TempoRange#DEFAULT} by default
     */
    public TempoRange tempoRange() {
        return tempoRange;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof AnalysisOptions)) {
            return false;
        }
        AnalysisOptions that = (AnalysisOptions) other;
        return engine.equals(that.engine) && tempoRange.equals(that.tempoRange);
    }

    @Override
    public int hashCode() {
        return 31 * engine.hashCode() + tempoRange.hashCode();
    }

    @Override
    public String toString() {
        return "AnalysisOptions{engine=" + engine + ", tempoRange=" + tempoRange + "}";
    }
}
