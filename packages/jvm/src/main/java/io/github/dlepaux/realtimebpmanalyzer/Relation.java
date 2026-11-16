package io.github.dlepaux.realtimebpmanalyzer;

/** How a candidate's tempo relates to the reading's tempo. May grow in a minor release, as in the JS library. */
public enum Relation {
    /** The reading's own tempo. Only the first candidate has it. */
    TOP("top"),
    /** Half the top tempo, within {@link Reading#RELATION_TOLERANCE}. */
    HALF("half"),
    /** Twice the top tempo, within {@link Reading#RELATION_TOLERANCE}. */
    DOUBLE("double"),
    /** Anything else, 3:2 relatives included. */
    OTHER("other");

    private final String id;

    Relation(String id) {
        this.id = id;
    }

    /**
     * @return The name the JS library and the conformance vectors use: {@code top}, {@code half}, {@code double} or
     * {@code other}
     */
    public String id() {
        return id;
    }
}
