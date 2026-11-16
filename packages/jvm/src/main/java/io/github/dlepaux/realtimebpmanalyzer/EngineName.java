package io.github.dlepaux.realtimebpmanalyzer;

/** The two tempo engines, the JS library's {@code 'tempogram'} and {@code 'peaks'}. */
public enum EngineName {
    /** The default: an onset tempogram over the full band, searching the tempo range. */
    TEMPOGRAM("tempogram"),
    /** Peaks of the lowpassed signal, whose intervals vote for a tempo folded into the tempo range. */
    PEAKS("peaks");

    private final String id;

    EngineName(String id) {
        this.id = id;
    }

    /**
     * @return The name the JS library and the conformance vectors use: {@code tempogram} or {@code peaks}
     */
    public String id() {
        return id;
    }
}
