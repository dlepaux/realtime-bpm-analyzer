// The peaks engine on a whole buffer: a biquad lowpass, bass peaks over a falling threshold, and votes for the
// intervals between them. A port of packages/realtime-bpm-analyzer/src/core/{lowpass,peak-detection,tempo,
// detect-tempo}.ts, offline path.
//
// Ties are part of the reading: tempos with equal counts keep the order the intervals first met them, through
// insertion-ordered maps and a stable sort, as the JS Map and Array.prototype.sort keep it.

import Foundation

enum Peaks {
    /// The lowest rate, in Hz, at which the 0.25 s skip after a peak rounds to a whole sample: JS's peaksMinSampleRate.
    static let minimumSampleRate: Double = 2
    /// Thresholds descend from one step under this.
    static let startThreshold = 0.95
    static let minValidThreshold = 0.2
    static let thresholdStep = 0.05
    /// Rungs are rounded to nine decimals, so each one is the literal it stands for.
    static let thresholdDecimals = 1e9
    /// A threshold with fewer peaks than this is skipped.
    static let minPeaks = 15
    /// Seconds skipped after a peak, past its decay.
    static let peakSkipSeconds = 0.25
    /// Each peak is paired with the next ones up to this many places on, this one excluded.
    static let maxIntervalComparisons = 10
    static let maxCandidates = 5

    /// Up to 5 candidates, by votes, empty when no threshold found enough peaks. The rate and the lowpass are checked.
    static func detect(_ samples: UnsafeBufferPointer<Float>, sampleRate: Double, lowpass: Lowpass, range: TempoRange) -> [Tempo] {
        let filtered = applyLowpass(samples, sampleRate: sampleRate, lowpass: lowpass)
        let peaks = findPeaks(filtered, sampleRate: sampleRate)
        let tempos = groupByTempo(identifyIntervals(peaks), sampleRate: sampleRate, range: range)
        return Array(stableSortedByCount(tempos).prefix(maxCandidates)).map { Tempo(tempo: Double($0.tempo), exact: $0.exact, score: $0.score) }
    }

    /// b0, b1, b2, a1, a2 as the Web Audio spec defines a `lowpass` BiquadFilterNode, with Q in dB.
    static func coefficients(_ lowpass: Lowpass, sampleRate: Double) -> (b0: Double, b1: Double, b2: Double, a1: Double, a2: Double) {
        let w0 = Double.pi * (lowpass.frequency / (sampleRate / 2))
        let cosW0 = cos(w0)
        let alpha = sin(w0) / (2 * pow(10, lowpass.q / 20))
        let a0 = 1 + alpha
        return (((1 - cosW0) / 2) / a0, (1 - cosW0) / a0, ((1 - cosW0) / 2) / a0, (-2 * cosW0) / a0, (1 - alpha) / a0)
    }

    /// The filtered samples, stored as 32-bit floats as the reference stores them, from double-precision state.
    static func applyLowpass(_ samples: UnsafeBufferPointer<Float>, sampleRate: Double, lowpass: Lowpass) -> [Float] {
        let (b0, b1, b2, a1, a2) = coefficients(lowpass, sampleRate: sampleRate)
        var output = [Float](repeating: 0, count: samples.count)
        var x1 = 0.0
        var x2 = 0.0
        var y1 = 0.0
        var y2 = 0.0
        for i in 0..<samples.count {
            let x0 = Double(samples[i])
            let y0 = (b0 * x0) + (b1 * x1) + (b2 * x2) - (a1 * y1) - (a2 * y2)
            output[i] = Float(y0)
            x2 = x1
            x1 = x0
            y2 = y1
            y1 = y0
        }
        return output
    }

    /// The thresholds from one step under the start down to the first at or under the floor: 0.9 to 0.2.
    static func thresholdLadder() -> [Double] {
        let maxRungs = Swift.max(1, Int((startThreshold / thresholdStep).rounded(.up)))
        var rungs: [Double] = []
        for n in 1...maxRungs {
            let threshold = jsRound((startThreshold - (Double(n) * thresholdStep)) * thresholdDecimals) / thresholdDecimals
            rungs.append(threshold)
            if threshold <= minValidThreshold { break }
        }
        return rungs
    }

    /// The peaks at the highest threshold that has at least `minPeaks` of them, or none.
    static func findPeaks(_ data: [Float], sampleRate: Double) -> [Int] {
        // At least one sample, as the rate is at least 2 Hz, which bounds each pass to `data.count` steps. A skip past
        // the end ends the pass after its first peak, so it is capped there rather than converted whole
        let skipSamples = jsRound(peakSkipSeconds * sampleRate)
        precondition(skipSamples >= 1, "a skip of no sample would find the same peak forever")
        let skip = skipSamples < Double(data.count) ? Int(skipSamples) : data.count
        for threshold in thresholdLadder() {
            let peaks = findPeaks(data, threshold: threshold, skip: skip)
            if peaks.count >= minPeaks { return peaks }
        }
        return []
    }

    /// Each index above the threshold, then the next one at least `skip` samples on, past the peak's decay. Compared
    /// as doubles, as JS compares: the threshold is not rounded to a float (conformance/readme.md, Arithmetic).
    private static func findPeaks(_ data: [Float], threshold: Double, skip: Int) -> [Int] {
        var peaks: [Int] = []
        var i = 0
        while i < data.count {
            if Double(data[i]) > threshold {
                peaks.append(i)
                i += skip
            } else {
                i += 1
            }
        }
        return peaks
    }

    /// How often each interval occurs between a peak and its next 9, in the order first met: ties keep that order.
    static func identifyIntervals(_ peaks: [Int]) -> OrderedCounts<Int> {
        var counts = OrderedCounts<Int>()
        for n in peaks.indices {
            for next in (n + 1)..<Swift.min(n + maxIntervalComparisons, peaks.count) {
                counts.add(peaks[next] - peaks[n], count: 1, weighted: 0)
            }
        }
        return counts
    }

    /// One whole BPM's candidate: its unrounded tempo, its vote count and its raw score from 0 to 1.
    struct Group {
        let tempo: Int64
        let exact: Double
        let count: Int64
        let score: Double
    }

    /// Folds each interval's tempo into the range by octaves and groups the votes by the whole BPM they round to.
    static func groupByTempo(_ intervals: OrderedCounts<Int>, sampleRate: Double, range: TempoRange) -> [Group] {
        // Keyed by a whole BPM in 64 bits: an image across the top edge reaches 2^32, past a 32-bit Int
        var groups = OrderedCounts<Int64>()
        // The same votes seen from across the range's edge, for the exact tempo only
        var acrossEdge = OrderedCounts<Int64>()
        for (interval, votes) in intervals.entries where interval != 0 {
            var folded = 60 / (Double(abs(interval)) / sampleRate)
            // Bounded: max >= 2 * min, so each loop ends within one pass of octaves
            while folded < range.min { folded *= 2 }
            while folded > range.max { folded /= 2 }
            groups.add(key(folded), count: votes.count, weighted: Double(votes.count) * folded)
            if folded * 2 > range.max { acrossEdge.add(key(folded * 2), count: votes.count, weighted: Double(votes.count) * (folded * 2)) }
            if folded / 2 < range.min { acrossEdge.add(key(folded / 2), count: votes.count, weighted: Double(votes.count) * (folded / 2)) }
        }
        return withScores(groups, acrossEdge)
    }

    private static func key(_ tempo: Double) -> Int64 {
        let rounded = jsRound(tempo)
        // At most twice the largest max, 2^32: far inside Int64
        precondition(rounded >= 0 && rounded < 0x1p62, "a folded tempo outside the range: \(tempo)")
        return Int64(rounded)
    }

    /// Each group's score and exact tempo from its ±1 BPM window: the score is the window's share of all votes, and
    /// the exact tempo the vote-weighted mean of the window, the votes folded across the range's edge included.
    private static func withScores(_ groups: OrderedCounts<Int64>, _ acrossEdge: OrderedCounts<Int64>) -> [Group] {
        let total = groups.entries.reduce(Int64(0)) { $0 + $1.votes.count }
        return groups.entries.map { tempo, votes in
            var support: Int64 = 0
            var foldedSupport: Int64 = 0
            var weightedSum = 0.0
            // The JS sums run over the window first, then the images across the edge, in this order
            for (side, source) in [groups, acrossEdge].enumerated() {
                for key in (tempo - 1)...(tempo + 1) {
                    let found = source[key]
                    let count = found?.count ?? 0
                    if side == 0 { support += count }
                    foldedSupport += count
                    weightedSum += found?.weighted ?? 0
                }
            }
            return Group(
                tempo: tempo,
                // A group of zero-count votes has no mean: its whole BPM is all there is
                exact: foldedSupport > 0 ? weightedSum / Double(foldedSupport) : Double(tempo),
                count: votes.count,
                score: total > 0 ? Double(support) / Double(total) : 0
            )
        }
    }

    /// Most votes first; equal counts keep their first-seen order, as Array.prototype.sort keeps them. Swift's `sort`
    /// does not promise stability, so the position breaks ties.
    private static func stableSortedByCount(_ groups: [Group]) -> [Group] {
        groups.enumerated()
            .sorted { $0.element.count != $1.element.count ? $0.element.count > $1.element.count : $0.offset < $1.offset }
            .map(\.element)
    }
}

/// Vote counts and weighted sums by key, iterated in the order each key was first added, as a JS `Map` iterates.
struct OrderedCounts<Key: Hashable> {
    struct Votes {
        var count: Int64
        var weighted: Double
    }

    private var positions: [Key: Int] = [:]
    private(set) var entries: [(key: Key, votes: Votes)] = []

    subscript(key: Key) -> Votes? {
        positions[key].map { entries[$0].votes }
    }

    /// A key already there keeps its place, as in a JS `Map`.
    mutating func add(_ key: Key, count: Int64, weighted: Double) {
        if let position = positions[key] {
            entries[position].votes.count += count
            entries[position].votes.weighted += weighted
        } else {
            positions[key] = entries.count
            entries.append((key, Votes(count: count, weighted: weighted)))
        }
    }
}
