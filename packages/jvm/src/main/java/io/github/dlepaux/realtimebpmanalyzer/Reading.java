package io.github.dlepaux.realtimebpmanalyzer;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The tempo of the samples analysed, the JS library's {@code Reading}. Immutable.
 *
 * <p>{@link BpmAnalyzer#analyzeChannelData} returns {@code null} instead of a reading when it finds no tempo.
 */
public final class Reading {
    /** Relative tolerance of {@link Relation#HALF} and {@link Relation#DOUBLE}: within 2% of the exact ratio. */
    public static final double RELATION_TOLERANCE = 0.02;

    private final int bpm;
    private final double bpmExact;
    private final Double confidence;
    private final List<Candidate> candidates;
    private final double audioFrom;
    private final double audioTo;
    private final EngineName engine;

    Reading(int bpm, double bpmExact, Double confidence, List<Candidate> candidates, double audioFrom, double audioTo,
            EngineName engine) {
        this.bpm = bpm;
        this.bpmExact = bpmExact;
        this.confidence = confidence;
        this.candidates = Collections.unmodifiableList(new ArrayList<Candidate>(candidates));
        this.audioFrom = audioFrom;
        this.audioTo = audioTo;
        this.engine = engine;
    }

    /**
     * @return The tempo, a whole BPM inside the tempo range. Equal to the first candidate's.
     */
    public int bpm() {
        return bpm;
    }

    /**
     * @return The same tempo, unrounded
     */
    public double bpmExact() {
        return bpmExact;
    }

    /**
     * The chance, from 0 to 1, that {@link #bpm()} is right: a confidence of 0.8 is right about 80% of the time.
     *
     * @return The chance, or {@code null} when it was not measured: the reading's tempo is outside 90 to 180 BPM, or
     * the analysis ran on any tempo range other than 90 to 180. {@code null} is never a small number. Kotlin sees a
     * platform type, so check it for null.
     */
    public Double confidence() {
        return confidence;
    }

    /**
     * @return One to five tempos the engine considered, best first, the first one with {@link Relation#TOP}. The list
     * is unmodifiable.
     */
    public List<Candidate> candidates() {
        return candidates;
    }

    /**
     * @return Where the analysed audio starts, in seconds: always 0 for a whole-buffer analysis
     */
    public double audioFrom() {
        return audioFrom;
    }

    /**
     * @return Where the analysed audio ends, in seconds: the sample count divided by the sample rate
     */
    public double audioTo() {
        return audioTo;
    }

    /**
     * @return The engine that measured the tempo
     */
    public EngineName engine() {
        return engine;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Reading)) {
            return false;
        }
        Reading that = (Reading) other;
        return bpm == that.bpm
            && Double.compare(bpmExact, that.bpmExact) == 0
            && (confidence == null ? that.confidence == null : confidence.equals(that.confidence))
            && candidates.equals(that.candidates)
            && Double.compare(audioFrom, that.audioFrom) == 0
            && Double.compare(audioTo, that.audioTo) == 0
            && engine == that.engine;
    }

    @Override
    public int hashCode() {
        int hash = bpm;
        hash = 31 * hash + Double.valueOf(bpmExact).hashCode();
        hash = 31 * hash + (confidence == null ? 0 : confidence.hashCode());
        hash = 31 * hash + candidates.hashCode();
        hash = 31 * hash + Double.valueOf(audioFrom).hashCode();
        hash = 31 * hash + Double.valueOf(audioTo).hashCode();
        return 31 * hash + engine.hashCode();
    }

    @Override
    public String toString() {
        return "Reading{bpm=" + bpm + ", bpmExact=" + bpmExact + ", confidence=" + confidence
            + ", candidates=" + candidates + ", audioFrom=" + audioFrom + ", audioTo=" + audioTo
            + ", engine=" + engine.id() + "}";
    }
}
