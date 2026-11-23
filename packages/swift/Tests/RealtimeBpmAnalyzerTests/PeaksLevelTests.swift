// The peaks engine's level-relative search at its edges, which the conformance inputs reach only in the middle: the
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
        // 100 windows of 0.001 to 0.100: floor(99 * 98 / 100) = 97, the 98th value
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

    func testComparesEachSampleWithTheScaledRungInDouble() {
        // conformance/readme.md, "The peaks level": a 32-bit threshold passes every vector, so this pins it. At 4 Hz a
        // window is one sample. The level is L, the first 32-bit float above 0.01 whose 0.9 * L rounds up when stored;
        // twelve samples hold that stored 0.9 * L, so they clear the double threshold 0.9 * L and rung 0.9 finds 15
        // peaks. A 32-bit threshold equals them and finds 3, so the search would go on to 0.85 and take sample 50 too
        var data = [Float](repeating: 0, count: 100)
        for i in 0..<3 { data[i] = Float(bitPattern: 0x3C23_D70D) }
        for i in 10..<22 { data[i] = Float(bitPattern: 0x3C13_74BF) }
        data[50] = Float(bitPattern: 0x3C0E_8A74)
        XCTAssertEqual(Peaks.levelReference(data, sampleRate: 4), Float(bitPattern: 0x3C23_D70D))
        XCTAssertEqual(Peaks.findPeaksRelativeToLevel(data, sampleRate: 4), [0, 1, 2] + Array(10..<22))
    }

    func testComparesTheLevelWithTheSilenceFloorInDouble() {
        // The 32-bit float nearest -70 dBFS is just under the double floor, so it searches nothing; the next one up does
        let under = Float(bitPattern: 0x39A5_CB5F)
        let over = Float(bitPattern: 0x39A5_CB60)
        XCTAssertTrue(Double(under) < Peaks.silenceFloor && Double(over) > Peaks.silenceFloor)
        XCTAssertEqual(Peaks.findPeaksRelativeToLevel([Float](repeating: under, count: 64), sampleRate: 4), [])
        XCTAssertEqual(Peaks.findPeaksRelativeToLevel([Float](repeating: over, count: 64), sampleRate: 4).count, 64)
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
