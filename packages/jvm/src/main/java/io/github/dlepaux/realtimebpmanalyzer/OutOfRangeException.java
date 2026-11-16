package io.github.dlepaux.realtimebpmanalyzer;

/**
 * A value outside its valid range: the sample rate, the tempo range or a lowpass setting. It is the JS library's
 * {@code RangeError}.
 *
 * <p>It extends {@link IllegalArgumentException}, so a caller that catches every bad argument catches it too. The
 * other bad argument, samples that can't be analysed at all (none), is a plain {@link IllegalArgumentException}, the
 * JS library's {@code Error}.
 */
public final class OutOfRangeException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    /**
     * @param message What is out of range, and the range it must be in
     */
    public OutOfRangeException(String message) {
        super(message);
    }
}
