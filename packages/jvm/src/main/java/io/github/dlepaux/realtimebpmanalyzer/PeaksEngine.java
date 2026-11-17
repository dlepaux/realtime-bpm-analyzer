package io.github.dlepaux.realtimebpmanalyzer;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The peaks engine on a whole buffer: the JS library's applyLowpass, findPeaks, identifyIntervals, groupByTempo and
 * getTopCandidates (core/lowpass.ts, core/peak-detection.ts, core/tempo.ts).
 *
 * <p>Ties are part of the reading: tempos with equal counts keep the order the intervals first met them, through
 * insertion-ordered maps and a stable sort, as the JS Map and Array.prototype.sort keep it.
 */
final class PeaksEngine {
    /** Thresholds descend from one step under this. */
    private static final double START_THRESHOLD = 0.95;
    /** The lowest threshold. */
    private static final double MIN_VALID_THRESHOLD = 0.2;
    private static final double THRESHOLD_STEP = 0.05;
    /** Rungs are rounded to nine decimals, so each one is the literal it stands for. */
    private static final double THRESHOLD_DECIMALS = 1e9;
    /** A threshold with fewer peaks than this is skipped. */
    private static final int MIN_PEAKS = 15;
    /** Seconds skipped after a peak, past its decay. */
    private static final double PEAK_SKIP_SECONDS = 0.25;
    /** The lowest rate, in Hz, at which {@link #PEAK_SKIP_SECONDS} rounds to a whole sample: JS's peaksMinSampleRate. */
    static final double MIN_SAMPLE_RATE = 2;
    /** Each peak is paired with the next ones up to this many places on, this one excluded. */
    private static final int MAX_INTERVAL_COMPARISONS = 10;
    private static final int MAX_CANDIDATES = 5;
    /**
     * The percentile of the per-window maxima taken as a channel's level when the fixed ladder finds no peaks
     * (RBA-221): JS's levelPercentile.
     */
    static final int LEVEL_PERCENTILE = 98;
    /** -70 dBFS: under it the level-relative search reads silence. Written out as JS writes it, the same double. */
    static final double SILENCE_FLOOR = 0.00031622776601683794;

    private PeaksEngine() {
    }

    /**
     * @param samples The caller's samples, left untouched
     * @param sampleRate Their rate, positive and above twice the cutoff (checked by the caller)
     * @param lowpass The lowpass settings
     * @param range The range tempos are folded into
     * @return Up to 5 candidates, by votes, none when no threshold found enough peaks, and whether the confidence
     *     calibration covers them: JS's detectTempo
     */
    static Detection detect(float[] samples, double sampleRate, Lowpass lowpass, TempoRange range) {
        float[] filtered = applyLowpass(samples, sampleRate, lowpass);
        int[] peaks = findPeaks(filtered, sampleRate);
        boolean calibrated = true;
        // RBA-221: whatever the fixed ladder finds keeps exactly the reading it had. Only a channel it finds no peaks
        // in is searched again relative to its level, and the calibration never saw such a reading
        if (peaks.length == 0) {
            peaks = findPeaksRelativeToLevel(filtered, sampleRate);
            calibrated = false;
        }
        Map<Integer, Integer> intervals = identifyIntervals(peaks);
        List<Tempo> tempos = groupByTempo(intervals, sampleRate, range);
        return new Detection(topCandidates(tempos), calibrated);
    }

    /** The candidates of one channel, and whether the peaks calibration (RBA-106) covers them. */
    static final class Detection {
        final List<Tempo> tempos;
        /** False when the peaks were found only relative to the channel's level: the confidence is then unmeasured. */
        final boolean calibrated;

        Detection(List<Tempo> tempos, boolean calibrated) {
            this.tempos = tempos;
            this.calibrated = calibrated;
        }
    }

    /**
     * The Web Audio spec's lowpass biquad, with double-precision state and float32 output, as the JS library runs it
     * in plain JS and browsers render it.
     */
    static float[] applyLowpass(float[] samples, double sampleRate, Lowpass lowpass) {
        double w0 = Math.PI * (lowpass.frequency() / (sampleRate / 2));
        double cosW0 = StrictMath.cos(w0);
        double alpha = StrictMath.sin(w0) / (2 * StrictMath.pow(10, lowpass.q() / 20));
        double a0 = 1 + alpha;
        double b0 = ((1 - cosW0) / 2) / a0;
        double b1 = (1 - cosW0) / a0;
        double b2 = ((1 - cosW0) / 2) / a0;
        double a1 = (-2 * cosW0) / a0;
        double a2 = (1 - alpha) / a0;

        float[] output = new float[samples.length];
        double x1 = 0;
        double x2 = 0;
        double y1 = 0;
        double y2 = 0;
        for (int i = 0; i < samples.length; i++) {
            double x0 = samples[i];
            double y0 = (b0 * x0) + (b1 * x1) + (b2 * x2) - (a1 * y1) - (a2 * y2);
            output[i] = (float) y0;
            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
        }
        return output;
    }

    /** The thresholds from one step under the start down to the first at or under the floor: 0.9 to 0.2. */
    static double[] thresholdLadder() {
        int maxRungs = Math.max(1, (int) Math.ceil(START_THRESHOLD / THRESHOLD_STEP));
        double[] rungs = new double[maxRungs];
        int count = 0;
        for (int n = 1; n <= maxRungs; n++) {
            double threshold = Math.round((START_THRESHOLD - (n * THRESHOLD_STEP)) * THRESHOLD_DECIMALS)
                / THRESHOLD_DECIMALS;
            rungs[count++] = threshold;
            if (threshold <= MIN_VALID_THRESHOLD) {
                break;
            }
        }
        double[] ladder = new double[count];
        System.arraycopy(rungs, 0, ladder, 0, count);
        return ladder;
    }

    /** The peaks at the highest threshold that has at least {@link #MIN_PEAKS} of them, or none. */
    static int[] findPeaks(float[] data, double sampleRate) {
        int step = skipOf(sampleRate);
        for (double threshold : thresholdLadder()) {
            int[] peaks = findPeaksAtThreshold(data, threshold, step);
            if (peaks.length >= MIN_PEAKS) {
                return peaks;
            }
        }
        return new int[0];
    }

    /**
     * The samples skipped after a peak, which is also the window of {@link #levelReference}: 0.25 s, rounded half up
     * as JS's Math.round rounds.
     */
    private static int skipOf(double sampleRate) {
        long skip = Math.round(PEAK_SKIP_SECONDS * sampleRate);
        // Each pass of findPeaksAtThreshold moves on by at least one sample only while the skip is one sample or more,
        // which bounds its loop to data.length passes, and no level window is then empty. BpmAnalyzer refuses a rate
        // under 2 Hz, where it is 0, before this, as the JS library does (RBA-260)
        if (skip < 1) {
            throw new OutOfRangeException("Invalid sample rate: " + sampleRate + ". The peaks engine needs at least "
                + MIN_SAMPLE_RATE + " Hz, where the skip after a peak is a whole sample.");
        }
        // A skip past the longest array reaches past its end either way, so the clamp changes no peak or window count
        return (int) Math.min(skip, Integer.MAX_VALUE);
    }

    /**
     * The level of a channel's loudest beats, which one click or clipped transient can't set (RBA-221): JS's
     * levelReference. The maxima of its 0.25 s windows, each from 0 so only positive samples count, sorted, and the one
     * at index floor((windows - 1) * 98 / 100), in whole numbers.
     */
    static float levelReference(float[] data, double sampleRate) {
        int window = skipOf(sampleRate);
        int count = (int) ((data.length + (long) window - 1) / window);
        if (count == 0) {
            return 0;
        }
        float[] maxima = new float[count];
        for (int w = 0; w < count; w++) {
            long start = (long) w * window;
            long end = Math.min(data.length, start + window);
            float maximum = 0;
            for (long i = start; i < end; i++) {
                // A NaN sample fails the comparison, so it never becomes a maximum, as in JS
                if (data[(int) i] > maximum) {
                    maximum = data[(int) i];
                }
            }
            maxima[w] = maximum;
        }
        Arrays.sort(maxima);
        return maxima[(int) (((long) (count - 1) * LEVEL_PERCENTILE) / 100)];
    }

    /**
     * The fixed ladder run again with every rung scaled by the channel's level, so a quiet or bass-light file is
     * searched the way a full-scale one is (RBA-221): JS's findPeaksRelativeToLevel. None under the silence floor, or
     * at full scale or above.
     */
    static int[] findPeaksRelativeToLevel(float[] data, double sampleRate) {
        // Widened to double here, so the floor comparison and every product below are in double, as in JS
        double level = levelReference(data, sampleRate);
        if (!(level >= SILENCE_FLOOR && level < 1)) {
            return new int[0];
        }
        int step = skipOf(sampleRate);
        for (double rung : thresholdLadder()) {
            int[] peaks = findPeaksAtThreshold(data, rung * level, step);
            if (peaks.length >= MIN_PEAKS) {
                return peaks;
            }
        }
        return new int[0];
    }

    private static int[] findPeaksAtThreshold(float[] data, double threshold, int step) {
        int[] peaks = new int[16];
        int count = 0;
        for (long i = 0; i < data.length; i++) {
            if (data[(int) i] > threshold) {
                if (count == peaks.length) {
                    int[] grown = new int[count * 2];
                    System.arraycopy(peaks, 0, grown, 0, count);
                    peaks = grown;
                }
                peaks[count++] = (int) i;
                // Past the peak's decay: the loop's own increment makes it a skip of `step`
                i += step - 1;
            }
        }
        int[] found = new int[count];
        System.arraycopy(peaks, 0, found, 0, count);
        return found;
    }

    /** Each interval between a peak and the next nine, with how often it occurs, in first-seen order. */
    static Map<Integer, Integer> identifyIntervals(int[] peaks) {
        Map<Integer, Integer> intervals = new LinkedHashMap<Integer, Integer>();
        for (int n = 0; n < peaks.length; n++) {
            for (int i = 1; i < MAX_INTERVAL_COMPARISONS; i++) {
                int next = n + i;
                if (next >= peaks.length) {
                    break;
                }
                int interval = peaks[next] - peaks[n];
                Integer count = intervals.get(interval);
                intervals.put(interval, count == null ? 1 : count + 1);
            }
        }
        return intervals;
    }

    /** The interval votes that rounded to one whole BPM, and the sum of their unrounded tempos weighted by count. */
    private static final class Votes {
        final long count;
        final double weightedSum;

        Votes(long count, double weightedSum) {
            this.count = count;
            this.weightedSum = weightedSum;
        }
    }

    /** Folds each interval's tempo into the range by octaves, and groups the votes by the whole BPM they round to. */
    static List<Tempo> groupByTempo(Map<Integer, Integer> intervalCounts, double sampleRate, TempoRange range) {
        double min = range.min();
        double max = range.max();
        Map<Long, Votes> groups = new LinkedHashMap<Long, Votes>();
        // The same votes seen from across the range's edge, for the exact tempo only
        Map<Long, Votes> acrossEdge = new LinkedHashMap<Long, Votes>();

        for (Map.Entry<Integer, Integer> entry : intervalCounts.entrySet()) {
            int interval = entry.getKey();
            int count = entry.getValue();
            if (interval == 0) {
                continue;
            }
            double folded = 60 / (Math.abs((double) interval) / sampleRate);
            while (folded < min) {
                folded *= 2;
            }
            while (folded > max) {
                folded /= 2;
            }
            addVote(groups, folded, count);
            // An octave image the fold could have come from
            if (folded * 2 > max) {
                addVote(acrossEdge, folded * 2, count);
            }
            if (folded / 2 < min) {
                addVote(acrossEdge, folded / 2, count);
            }
        }
        return withConfidence(groups, acrossEdge);
    }

    private static void addVote(Map<Long, Votes> groups, double tempo, int count) {
        long key = Math.round(tempo);
        Votes votes = groups.get(key);
        long previousCount = votes == null ? 0 : votes.count;
        double previousSum = votes == null ? 0 : votes.weightedSum;
        // A replaced key keeps its place in a LinkedHashMap, as in a JS Map
        groups.put(key, new Votes(previousCount + count, previousSum + (count * tempo)));
    }

    /**
     * Each tempo's raw score and exact tempo from the ±1 BPM window around it: the score is the window's share of all
     * votes, and the exact tempo the vote-weighted mean of the window, the votes folded across the range's edge
     * included.
     */
    private static List<Tempo> withConfidence(Map<Long, Votes> groups, Map<Long, Votes> acrossEdge) {
        long totalVotes = 0;
        for (Votes votes : groups.values()) {
            totalVotes += votes.count;
        }

        List<Tempo> tempos = new ArrayList<Tempo>(groups.size());
        for (Map.Entry<Long, Votes> group : groups.entrySet()) {
            long tempo = group.getKey();
            long support = 0;
            long foldedSupport = 0;
            double weightedSum = 0;
            // The JS sums run over the window first, then the images across the edge, in this order
            for (int side = 0; side < 2; side++) {
                Map<Long, Votes> source = side == 0 ? groups : acrossEdge;
                for (long key = tempo - 1; key <= tempo + 1; key++) {
                    Votes votes = source.get(key);
                    long count = votes == null ? 0 : votes.count;
                    if (side == 0) {
                        support += count;
                    }
                    foldedSupport += count;
                    weightedSum += votes == null ? 0 : votes.weightedSum;
                }
            }
            double exact = foldedSupport > 0 ? weightedSum / foldedSupport : tempo;
            double confidence = totalVotes > 0 ? (double) support / totalVotes : 0;
            tempos.add(new Tempo(tempo, exact, group.getValue().count, confidence));
        }
        return tempos;
    }

    /** The five tempos with the most votes. */
    private static List<Tempo> topCandidates(List<Tempo> tempos) {
        List<Tempo> sorted = new ArrayList<Tempo>(tempos);
        // Stable, as Array.prototype.sort: equal counts keep their first-seen order
        Collections.sort(sorted, new Comparator<Tempo>() {
            @Override
            public int compare(Tempo a, Tempo b) {
                return Long.compare(b.count, a.count);
            }
        });
        return new ArrayList<Tempo>(sorted.subList(0, Math.min(MAX_CANDIDATES, sorted.size())));
    }
}
