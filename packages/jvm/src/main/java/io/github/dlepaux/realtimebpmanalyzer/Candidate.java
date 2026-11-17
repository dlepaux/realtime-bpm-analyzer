package io.github.dlepaux.realtimebpmanalyzer;

/** Another tempo the engine considered, with how it relates to the reading's tempo. Immutable. */
public final class Candidate {
    private final int bpm;
    private final Relation relation;

    Candidate(int bpm, Relation relation) {
        this.bpm = bpm;
        this.relation = relation;
    }

    /**
     * @return The tempo, a whole BPM
     */
    public int bpm() {
        return bpm;
    }

    /**
     * @return How it relates to the reading's tempo
     */
    public Relation relation() {
        return relation;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Candidate)) {
            return false;
        }
        Candidate that = (Candidate) other;
        return bpm == that.bpm && relation == that.relation;
    }

    @Override
    public int hashCode() {
        return 31 * bpm + relation.hashCode();
    }

    @Override
    public String toString() {
        return "Candidate{bpm=" + bpm + ", relation=" + relation.id() + "}";
    }
}
