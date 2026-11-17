// The public value types: the JS library's options, its `Reading` and its two error categories, in Swift's casing.

import Foundation

/// The analysis engine, the JS library's `engine` option.
public enum Engine: Sendable, Hashable {
    /// The default: band-wise onset strength read through a tempogram, over the full band.
    case tempogram
    /// Counts the intervals between bass peaks, read through a biquad lowpass.
    case peaks(lowpass: Lowpass)

    /// The peaks engine with its default lowpass, 200 Hz and 1 dB. Being a value, it equals only that lowpass:
    /// `engine == .peaks` is false for `.peaks(lowpass: custom)`, so test for the engine with ``name`` or `if case`.
    public static var peaks: Engine { .peaks(lowpass: .default) }

    /// The name a reading reports.
    public var name: EngineName {
        switch self {
        case .tempogram: return .tempogram
        case .peaks: return .peaks
        }
    }
}

/// The name of the engine that produced a reading.
public enum EngineName: String, Sendable, Hashable, CaseIterable {
    case tempogram
    case peaks
}

/// The biquad lowpass the peaks engine reads the bass through, with the Web Audio `BiquadFilterNode` coefficients.
///
/// Checked when the analysis runs: both settings finite, the cutoff above 0 and below half the sample rate as the
/// 32-bit float Web Audio stores it, and `q` from ``minQ`` to ``maxQ``.
public struct Lowpass: Sendable, Hashable {
    /// The lowest `q`, in dB: under it, Web Audio's 32-bit resonance term stops being a normal float.
    public static let minQ: Double = -758
    /// The highest `q`, in dB: over it, Web Audio's 32-bit resonance term overflows.
    public static let maxQ: Double = 770
    /// 200 Hz and 1 dB.
    public static let `default` = Lowpass()

    /// The cutoff, in Hz.
    public var frequency: Double
    /// The resonance at the cutoff, in dB.
    public var q: Double

    public init(frequency: Double = 200, q: Double = 1) {
        self.frequency = frequency
        self.q = q
    }
}

/// The tempos, in BPM, a reading is reported in, both included: the JS library's `tempoRange`.
///
/// Checked when the analysis runs: both bounds positive and finite, `max` at least twice `min` (folding moves a tempo
/// by whole octaves), `max` at most 2^31 - 1, and `max / min` finite. The confidence was measured on ``default``
/// only: on any other range it is `nil`.
public struct TempoRange: Sendable, Hashable {
    /// 90 to 180 BPM, the default and the range the confidence was measured on.
    public static let `default` = TempoRange(min: 90, max: 180)
    /// The largest `max`, so that a whole BPM fits a signed 32-bit integer, as in every port.
    public static let maximumBpm: Double = 2_147_483_647

    public var min: Double
    public var max: Double

    public init(min: Double, max: Double) {
        self.min = min
        self.max = max
    }
}

/// What `analyzeChannelData(_:sampleRate:options:)` reads the samples with. The defaults are the JS library's.
public struct AnalysisOptions: Sendable, Hashable {
    public var engine: Engine
    public var tempoRange: TempoRange

    public init(engine: Engine = .tempogram, tempoRange: TempoRange = .default) {
        self.engine = engine
        self.tempoRange = tempoRange
    }
}

/// How a candidate relates to the reading's tempo. Like the JS library's, it may gain a case in a minor release, so
/// a `switch` over it should keep a `default`.
public enum CandidateRelation: String, Sendable, Hashable {
    case top
    /// Within 2% of half the top tempo.
    case half
    /// Within 2% of twice the top tempo.
    case double
    case other
}

/// A tempo the engine considered, in its rank order.
public struct Candidate: Sendable, Hashable {
    /// A whole BPM.
    public let bpm: Int
    public let relation: CandidateRelation

    public init(bpm: Int, relation: CandidateRelation) {
        self.bpm = bpm
        self.relation = relation
    }
}

/// The span analysed, in seconds: always the whole input. JS's `contextTime` has no equivalent here: it is a Web
/// Audio clock, and whole-input analysis sets it to null.
public struct AudioSpan: Sendable, Hashable {
    /// Always 0.
    public let from: Double
    /// The sample count divided by the sample rate.
    public let to: Double

    public init(from: Double, to: Double) {
        self.from = from
        self.to = to
    }
}

/// A tempo reading, with the same fields and the same meaning as the JS library's `Reading`.
public struct Reading: Sendable, Hashable {
    /// Relative tolerance of ``CandidateRelation/half`` and ``CandidateRelation/double``: within 2% of the ratio.
    public static let relationTolerance = 0.02

    /// The tempo, a whole BPM inside the tempo range. Equal to `candidates[0].bpm`.
    public let bpm: Int
    /// The same tempo, unrounded.
    public let bpmExact: Double
    /// The chance, 0 to 1, that ``bpm`` is right. `nil` when unmeasured: when the analysis ran on any tempo range
    /// other than 90 to 180, the only one the confidence was calibrated on, or when the peaks engine found the beats
    /// only relative to a quiet or bass-light input's own level, which input may hold no beat at all.
    public let confidence: Double?
    /// One to five tempos in the engine's rank order, the first with relation ``CandidateRelation/top``.
    public let candidates: [Candidate]
    public let audio: AudioSpan
    public let engine: EngineName

    public init(bpm: Int, bpmExact: Double, confidence: Double?, candidates: [Candidate], audio: AudioSpan, engine: EngineName) {
        self.bpm = bpm
        self.bpmExact = bpmExact
        self.confidence = confidence
        self.candidates = candidates
        self.audio = audio
        self.engine = engine
    }
}

/// Why an analysis was refused: one case per category of the JS library's errors. Messages are for people and may
/// change; the case is the contract.
public enum AnalysisError: Error, Sendable, Hashable, CustomStringConvertible, LocalizedError {
    /// The samples can't be analysed: there are none, or one is NaN or infinite. JS throws an `Error` for these.
    case invalidSamples(String)
    /// A value is outside its valid range: the sample rate, the tempo range or a lowpass setting. JS throws a
    /// `RangeError` for these.
    case outOfRange(String)

    public var description: String {
        switch self {
        case .invalidSamples(let message), .outOfRange(let message):
            return message
        }
    }

    /// The message, so `localizedDescription` shows it rather than Foundation's generic text.
    public var errorDescription: String? { description }
}
