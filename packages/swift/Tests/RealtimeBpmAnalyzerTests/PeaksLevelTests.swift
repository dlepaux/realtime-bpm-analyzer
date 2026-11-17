// RBA-221's level-relative search at its edges, which the conformance inputs reach only in the middle: the
// percentile's index, the windows' bounds, and the floor and full-scale guards.

import Foundation
@testable import RealtimeBpmAnalyzer
import XCTest

final class PeaksLevelTests: XCTestCase {
    /// One window a sample long per value, at 4 Hz, where a 0.25 s window is one sample.
    private func level(_ maxima: [Float]) -> Float {
        Peaks.levelReference(maxima, sampleRate: 4)
    }

    func testTakesTheMaximumAtTheFlooredPercentileIndex() {
        // 100 windows of 1..100: floor(99 * 98 / 100) = 97, the 98th value
        let hundred = (0..<100).map { Float(100 - $0) / 1000 }
        XCTAssertEqual(level(hundred), Float(98) / 1000)
        // Two windows: floor(1 * 98 / 100) = 0, so the louder one never sets the level
        XCTAssertEqual(level([0.9, 0.1]), 0.1)
        XCTAssertEqual(level([0.5]), 0.5)
    }

    func testCountsOnlyPositiveSamplesAndAShorterLastWindow() {
        // At 8 Hz a window is two samples: [-0.9, 0.2], [0.3, -0.5], [0.4]
        XCTAssertEqual(Peaks.levelReference([-0.9, 0.2, 0.3, -0.5, 0.4], sampleRate: 8), 0.3)
        XCTAssertEqual(Peaks.levelReference([-0.9, -0.2], sampleRate: 8), 0)
        XCTAssertEqual(Peaks.levelReference([], sampleRate: 8), 0)
        // A NaN sample never becomes a window's maximum
        XCTAssertEqual(Peaks.levelReference([.nan, 0.2], sampleRate: 8), 0.2)
    }

    func testSearchesNothingUnderTheFloorOrAtFullScale() {
        let loud = [Float](repeating: 1, count: 64)
        let underFloor = [Float](repeating: Float(Peaks.silenceFloor * 0.99), count: 64)
        XCTAssertEqual(Peaks.findPeaksRelativeToLevel(loud, sampleRate: 4), [])
        XCTAssertEqual(Peaks.findPeaksRelativeToLevel(underFloor, sampleRate: 4), [])
    }

    func testReadsAQuietPulseWithItsConfidenceUnmeasured() throws {
        // A one-sample click every 0.5 s at 1 kHz, 20 s, at -40 dBFS: the fixed ladder finds nothing in it
        let samples = (0..<20_000).map { $0 % 500 == 0 ? Float(0.01) : 0 }
        let options = AnalysisOptions(engine: .peaks(lowpass: Lowpass(frequency: 400, q: 1)))
        let reading = try XCTUnwrap(try analyzeChannelData(samples, sampleRate: 1_000, options: options))
        XCTAssertEqual(reading.bpm, 120)
        XCTAssertNil(reading.confidence)
    }
}
