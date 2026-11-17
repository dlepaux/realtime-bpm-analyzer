package io.github.dlepaux.realtimebpmanalyzer;

/** One engine candidate before it becomes a {@link Reading}: the JS library's internal {@code Tempo}. */
final class Tempo {
    /** The whole BPM. */
    final long tempo;
    /** The same tempo, unrounded. */
    final double exact;
    /** What ranks the candidates: the peaks engine's vote count, the tempogram's scaled salience. */
    final long count;
    /** The engine's raw score, 0 to 1, which the calibration maps to a confidence. */
    final double confidence;

    Tempo(long tempo, double exact, long count, double confidence) {
        this.tempo = tempo;
        this.exact = exact;
        this.count = count;
        this.confidence = confidence;
    }
}
