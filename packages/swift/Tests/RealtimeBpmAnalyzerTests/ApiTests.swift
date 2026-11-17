// The public surface as an app sees it: both entry points, the defaults, one error case per category, and the
// confidence that stays nil where nothing was measured. The readings themselves are the conformance run's job.

import Foundation
import RealtimeBpmAnalyzer
import XCTest

final class ApiTests: XCTestCase {
    private let sampleRate = 22_050.0

    /// A decaying 60 Hz click every beat, `seconds` long.
    private func clicks(bpm: Double, seconds: Double) -> [Float] {
        let beat = Int(sampleRate * 60 / bpm)
        let click = Int(sampleRate * 0.05)
        return (0..<Int(sampleRate * seconds)).map { i in
            let t = i % beat
            guard t < click else { return 0 }
            return Float(sin(2 * Double.pi * 60 * Double(t) / sampleRate) * exp(-Double(t) / (Double(click) / 5)))
        }
    }

    private func category(_ call: () throws -> Reading?) -> String {
        do {
            _ = try call()
            return "none"
        } catch AnalysisError.invalidSamples {
            return "invalidSamples"
        } catch AnalysisError.outOfRange {
            return "outOfRange"
        } catch {
            return "another error: \(error)"
        }
    }

    func testBothEntryPointsReadTheSame() throws {
        let samples = clicks(bpm: 120, seconds: 10)
        for engine in [Engine.tempogram, .peaks] {
            let options = AnalysisOptions(engine: engine)
            let fromArray = try analyzeChannelData(samples, sampleRate: sampleRate, options: options)
            let fromBuffer = try samples.withUnsafeBufferPointer { try analyzeChannelData($0, sampleRate: sampleRate, options: options) }
            XCTAssertNotNil(fromArray, "\(engine)")
            XCTAssertEqual(fromArray, fromBuffer, "\(engine)")
            XCTAssertEqual(fromArray?.engine, engine.name)
            XCTAssertEqual(fromArray?.candidates.first?.relation, .top)
            XCTAssertEqual(fromArray?.audio, AudioSpan(from: 0, to: 10))
        }
    }

    func testDefaultsAreTheTempogramOnNinetyToOneEighty() {
        let options = AnalysisOptions()
        XCTAssertEqual(options.engine, .tempogram)
        XCTAssertEqual(options.tempoRange, TempoRange(min: 90, max: 180))
        XCTAssertEqual(Engine.peaks, .peaks(lowpass: Lowpass(frequency: 200, q: 1)))
        XCTAssertEqual(Engine.peaks.name, .peaks)
    }

    func testConfidenceIsNilOnARangeNobodyMeasured() throws {
        let samples = clicks(bpm: 120, seconds: 10)
        let measured = try analyzeChannelData(samples, sampleRate: sampleRate)
        XCTAssertNotNil(measured?.confidence)
        let custom = try analyzeChannelData(samples, sampleRate: sampleRate, options: AnalysisOptions(tempoRange: TempoRange(min: 60, max: 140)))
        XCTAssertNotNil(custom)
        XCTAssertNil(custom?.confidence)
        // Compared by value: an explicit 90 to 180 is the default range
        let explicit = try analyzeChannelData(samples, sampleRate: sampleRate, options: AnalysisOptions(tempoRange: TempoRange(min: 90, max: 180)))
        XCTAssertEqual(explicit, measured)
    }

    func testNoTempoReadsNil() throws {
        XCTAssertNil(try analyzeChannelData([Float](repeating: 0, count: 22_050 * 5), sampleRate: sampleRate))
        XCTAssertNil(try analyzeChannelData([Float](repeating: 0, count: 22_050 * 5), sampleRate: sampleRate, options: AnalysisOptions(engine: .peaks)))
        // Under 1.5 s, the tempogram reads nothing
        XCTAssertNil(try analyzeChannelData(clicks(bpm: 120, seconds: 1.4), sampleRate: sampleRate))
    }

    func testEachFaultThrowsItsCategory() {
        let samples = clicks(bpm: 120, seconds: 2)
        var nan = samples
        nan[7] = .nan
        var infinite = samples
        infinite[7] = -.infinity
        let peaks = { (lowpass: Lowpass) in AnalysisOptions(engine: .peaks(lowpass: lowpass)) }
        let faults: [(String, String, () throws -> Reading?)] = [
            ("no samples", "invalidSamples", { try analyzeChannelData([], sampleRate: self.sampleRate) }),
            ("a NaN sample", "invalidSamples", { try analyzeChannelData(nan, sampleRate: self.sampleRate) }),
            ("an infinite sample", "invalidSamples", { try analyzeChannelData(infinite, sampleRate: self.sampleRate) }),
            ("a tempogram rate under 100 Hz", "outOfRange", { try analyzeChannelData(samples, sampleRate: 99) }),
            ("a NaN rate", "outOfRange", { try analyzeChannelData(samples, sampleRate: .nan) }),
            ("a range under an octave", "outOfRange", {
                try analyzeChannelData(samples, sampleRate: self.sampleRate, options: AnalysisOptions(tempoRange: TempoRange(min: 100, max: 150)))
            }),
            ("a range past 2^31 - 1", "outOfRange", {
                try analyzeChannelData(samples, sampleRate: self.sampleRate, options: AnalysisOptions(tempoRange: TempoRange(min: 90, max: 2_147_483_648)))
            }),
            ("a cutoff at Nyquist", "outOfRange", { try analyzeChannelData(samples, sampleRate: self.sampleRate, options: peaks(Lowpass(frequency: 11_025))) }),
            ("a cutoff of 0", "outOfRange", { try analyzeChannelData(samples, sampleRate: self.sampleRate, options: peaks(Lowpass(frequency: 0))) }),
            ("a q over 770 dB", "outOfRange", { try analyzeChannelData(samples, sampleRate: self.sampleRate, options: peaks(Lowpass(q: 771))) }),
            ("a peaks rate under 2 Hz", "outOfRange", {
                try analyzeChannelData(samples, sampleRate: 1.5, options: peaks(Lowpass(frequency: 0.5)))
            }),
        ]
        for (fault, expected, call) in faults {
            XCTAssertEqual(category(call), expected, fault)
        }
        // A sample fault comes before an option fault, as in the JS library
        XCTAssertEqual(category { try analyzeChannelData(nan, sampleRate: 1) }, "invalidSamples")
    }

    func testErrorsDescribeThemselves() {
        let error = AnalysisError.outOfRange("Invalid sample rate: 99.0.")
        XCTAssertEqual(error.description, "Invalid sample rate: 99.0.")
        XCTAssertEqual(error.localizedDescription, "Invalid sample rate: 99.0.")
        XCTAssertNotEqual(AnalysisError.invalidSamples("x"), AnalysisError.outOfRange("x"))
    }
}
