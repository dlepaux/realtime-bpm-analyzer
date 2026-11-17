// Whole-input analysis: the checks, in the JS library's order, then the engine, then the reading. A port of
// `analyzeChannelData` (packages/realtime-bpm-analyzer/src/node.ts) and of what it calls in
// src/core/{offline,engine,tempo,lowpass}.ts.

import Foundation

/// Detects the tempo of one channel of decoded audio, as the JS library's `analyzeChannelData` does, with the same
/// readings: the shared conformance vectors check it on every build.
///
/// It decodes nothing: pass the samples of one channel, from -1 to 1, and their rate. It holds no state, so it can run
/// on any thread; a long file takes a while, so keep it off the main thread.
///
/// ```swift
/// if let reading = try analyzeChannelData(samples, sampleRate: 44_100) {
///     print(reading.bpm, reading.confidence ?? "unmeasured")
/// }
/// ```
///
/// - Parameters:
///   - samples: One channel, from -1 to 1. Left untouched.
///   - sampleRate: Their rate in Hz: at least 100 for the tempogram; for peaks at least 2, and above twice the
///     lowpass cutoff.
///   - options: The engine and the tempo range. The defaults are the tempogram on 90 to 180 BPM.
/// - Returns: The reading, or `nil` when no tempo was found: silence, noise, or under 1.5 s for the tempogram.
/// - Throws: An ``AnalysisError``, and no other error: ``AnalysisError/invalidSamples(_:)`` when there are no
///   samples or one is NaN or infinite, ``AnalysisError/outOfRange(_:)`` when the sample rate, the tempo range or a
///   lowpass setting is out of its range (see ``TempoRange`` and ``Lowpass``).
public func analyzeChannelData(_ samples: [Float], sampleRate: Double, options: AnalysisOptions = AnalysisOptions()) throws -> Reading? {
    try samples.withUnsafeBufferPointer { try analyzeChannelData($0, sampleRate: sampleRate, options: options) }
}

/// ``analyzeChannelData(_:sampleRate:options:)`` on samples you hold in a buffer, such as an `AVAudioPCMBuffer`'s
/// `floatChannelData[0]`, without copying them into an array. The buffer is only read, and only during the call.
public func analyzeChannelData(_ samples: UnsafeBufferPointer<Float>, sampleRate: Double, options: AnalysisOptions = AnalysisOptions()) throws -> Reading? {
    guard !samples.isEmpty else {
        throw AnalysisError.invalidSamples("Invalid channel data: expected a non-empty buffer of samples.")
    }
    // A NaN or infinite sample is no PCM: through the peaks lowpass it turns every later sample into NaN. The caller
    // can fix its decoding, so it is refused, as the JS library refuses it (RBA-260)
    if let index = samples.firstIndex(where: { !$0.isFinite }) {
        throw AnalysisError.invalidSamples(
            "Invalid channel data: sample \(index) is \(samples[index]), and every sample must be a finite number.")
    }

    // The engine first, then the range, then the tempogram's sample rate: the JS library's order for
    // `{name: 'peaks', lowpass}` and the tempogram. JS's bare 'peaks' checks the range before the lowpass, which this
    // API can't tell from an explicit default lowpass; every one of these faults is `.outOfRange`, so a call with two
    // of them fails in the same category either way, only its message can differ
    var lowpass: Lowpass?
    if case .peaks(let settings) = options.engine {
        try checkLowpass(settings, sampleRate: sampleRate)
        // Below 2 Hz the 0.25 s skip after a peak rounds to no sample (RBA-260)
        guard sampleRate >= Peaks.minimumSampleRate else {
            throw AnalysisError.outOfRange("Invalid sample rate: \(sampleRate). The peaks engine needs at least "
                + "\(Peaks.minimumSampleRate) Hz, where the skip after a peak is a whole sample.")
        }
        lowpass = settings
    }
    let range = try checkTempoRange(options.tempoRange)
    // One double division, as in JS: the rate is checked by the engine's path below
    let audio = AudioSpan(from: 0, to: Double(samples.count) / sampleRate)

    guard let lowpass else {
        guard sampleRate.isFinite, sampleRate >= Tempogram.minimumSampleRate else {
            throw AnalysisError.outOfRange("Invalid sample rate: \(sampleRate). The tempogram needs at least "
                + "\(Tempogram.minimumSampleRate) Hz.")
        }
        return reading(Tempogram.detect(samples, sampleRate: sampleRate, range: range), audio, .tempogram, range, calibrated: true)
    }
    let detection = Peaks.detect(samples, sampleRate: sampleRate, lowpass: lowpass, range: range)
    return reading(detection.tempos, audio, .peaks, range, calibrated: detection.calibrated)
}

/// Folding moves a tempo by octaves, so the range must span one. The JS library's two bounds (RBA-260): a whole BPM
/// fits a signed 32-bit integer, and the tempogram's grid has a finite size, at most 71,333 tempos.
func checkTempoRange(_ range: TempoRange) throws -> TempoRange {
    let (min, max) = (range.min, range.max)
    guard min.isFinite, min > 0, max.isFinite, max > 0 else {
        throw AnalysisError.outOfRange("Invalid tempoRange: min and max must be positive finite numbers (got min=\(min), max=\(max)).")
    }
    guard max >= min * 2 else {
        throw AnalysisError.outOfRange("Invalid tempoRange: max (\(max)) must be at least twice min (\(min)) so that every tempo has an octave inside the range.")
    }
    guard max <= TempoRange.maximumBpm else {
        throw AnalysisError.outOfRange("Invalid tempoRange: max (\(max)) must be at most \(Int(TempoRange.maximumBpm)) BPM.")
    }
    guard (max / min).isFinite else {
        throw AnalysisError.outOfRange("Invalid tempoRange: max / min (\(max) / \(min)) is too large, past the largest finite number.")
    }
    return range
}

/// The JS library's checks on every lowpass path. The cutoff is read as the 32-bit float a Web Audio `AudioParam`
/// stores, so a cutoff that rounds onto 0 or Nyquist is refused.
func checkLowpass(_ lowpass: Lowpass, sampleRate: Double) throws {
    for (name, value) in [("frequency", lowpass.frequency), ("q", lowpass.q)] where !value.isFinite {
        throw AnalysisError.outOfRange("The lowpass setting \(name) \(value) is not a finite number.")
    }
    guard sampleRate.isFinite, sampleRate > 0 else {
        throw AnalysisError.outOfRange("Invalid sample rate: \(sampleRate). Sample rate must be positive.")
    }
    let nyquist = sampleRate / 2
    let stored = Double(Float(lowpass.frequency))
    guard stored > 0, stored < nyquist else {
        throw AnalysisError.outOfRange("The lowpass setting frequency \(lowpass.frequency) is out of range: at a sample "
            + "rate of \(sampleRate) Hz, it must be above 0 and below \(nyquist) Hz.")
    }
    guard lowpass.q >= Lowpass.minQ, lowpass.q <= Lowpass.maxQ else {
        throw AnalysisError.outOfRange("The lowpass setting q \(lowpass.q) is out of range: it must be from \(Lowpass.minQ) to \(Lowpass.maxQ) dB.")
    }
}

/// One tempo an engine found: a whole BPM, the unrounded tempo, and the raw score the calibration reads.
struct Tempo {
    let tempo: Double
    let exact: Double
    let score: Double
}

private let maxCandidates = 5

/// A candidate's relation to the top tempo, within 2% of half or double it (the JS library's contract/transitions.ts).
func relation(to top: Int, of bpm: Int) -> CandidateRelation {
    func near(_ target: Double) -> Bool { abs(Double(bpm) - target) <= target * Reading.relationTolerance }
    if near(Double(top) / 2) { return .half }
    return near(Double(top) * 2) ? .double : .other
}

/// Every tempo is a whole BPM inside the checked range, whose max is at most 2^31 - 1, so it fits an `Int` on every
/// platform, 32-bit watchOS included.
private func wholeBpm(_ tempo: Double) -> Int {
    guard let bpm = Int(exactly: tempo) else { preconditionFailure("a tempo that is no whole BPM in range: \(tempo)") }
    return bpm
}

/// `calibrated` is false when the calibration never saw readings found the way these were, as for a peaks file read
/// relative to its own level (RBA-221): the confidence is then nil, unmeasured.
private func reading(_ tempos: [Tempo], _ audio: AudioSpan, _ engine: EngineName, _ range: TempoRange, calibrated: Bool) -> Reading? {
    guard let top = tempos.first else { return nil }
    let bpm = wholeBpm(top.tempo)
    let candidates = tempos.prefix(maxCandidates).enumerated().map { index, tempo -> Candidate in
        let candidate = wholeBpm(tempo.tempo)
        return Candidate(bpm: candidate, relation: index == 0 ? .top : relation(to: bpm, of: candidate))
    }
    return Reading(
        bpm: bpm,
        bpmExact: top.exact,
        confidence: calibrated ? Calibration.calibrate(engine, raw: top.score, bpm: top.tempo, range: range) : nil,
        candidates: candidates,
        audio: audio,
        engine: engine
    )
}
