// The constants the port copies from the JS sources, read back from those sources: a regenerated calibration table or
// a new default fails here by name, not only through a conformance case that happens to reach it.

import Foundation
@testable import RealtimeBpmAnalyzer
import XCTest

final class JsSourceTests: XCTestCase {
    /// The JS library's src folder: JS_SOURCE_DIR when set, else found from this file's place in the repo.
    private func source(_ path: String) throws -> String {
        let directory: URL
        if let configured = ProcessInfo.processInfo.environment["JS_SOURCE_DIR"] {
            directory = URL(fileURLWithPath: configured)
        } else {
            directory = conformanceDirectory().deletingLastPathComponent()
                .appendingPathComponent("packages/realtime-bpm-analyzer/src")
        }
        return try String(contentsOf: directory.appendingPathComponent(path), encoding: .utf8)
    }

    private func matches(_ pattern: String, in text: String) -> [[String]] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            XCTFail("a bad pattern: \(pattern)")
            return []
        }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).map { match in
            (0..<match.numberOfRanges).map { group in
                Range(match.range(at: group), in: text).map { String(text[$0]) } ?? ""
            }
        }
    }

    /// The number a JS declaration such as `export const minPeaks = 15;` or a field such as `  frameRate: 100,` holds.
    private func constant(_ text: String, _ declaration: String, file: StaticString = #filePath, line: UInt = #line) -> Double? {
        let escaped = NSRegularExpression.escapedPattern(for: declaration)
        guard let found = matches("(?m)^\\s*\(escaped)\\s*[=:]\\s*(-?[0-9][0-9_.]*)[;,]", in: text).first,
              let value = Double(found[1].replacingOccurrences(of: "_", with: ""))
        else {
            XCTFail("no \(declaration) in the JS source", file: file, line: line)
            return nil
        }
        return value
    }

    func testDefaultsAreTheJsLibrarys() throws {
        let consts = try source("core/consts.ts")
        XCTAssertEqual(constant(consts, "export const minBpmRange"), TempoRange.default.min)
        XCTAssertEqual(constant(consts, "export const maxBpmRange"), TempoRange.default.max)
        XCTAssertTrue(consts.contains("export const maxTempoRangeBpm = (2 ** 31) - 1;"))
        XCTAssertEqual(TempoRange.maximumBpm, Double(Int32.max))
        XCTAssertEqual(constant(consts, "export const lowpassFrequency"), Lowpass.default.frequency)
        XCTAssertEqual(constant(consts, "export const lowpassQ"), Lowpass.default.q)
        XCTAssertEqual(constant(consts, "export const peaksMinSampleRate"), Peaks.minimumSampleRate)
        // The level-relative peaks search (RBA-221): the percentile of the window maxima, and the floor under which it
        // reads silence
        XCTAssertEqual(constant(consts, "export const levelPercentile"), Double(Peaks.levelPercentile))
        XCTAssertEqual(constant(consts, "export const silenceFloor"), Peaks.silenceFloor)

        let lowpass = try source("core/lowpass.ts")
        XCTAssertEqual(constant(lowpass, "const qMin"), Lowpass.minQ)
        XCTAssertEqual(constant(lowpass, "const qMax"), Lowpass.maxQ)

        XCTAssertTrue(try source("core/engine.ts").contains("export const defaultEngine: EngineName = 'tempogram';"))
        XCTAssertEqual(AnalysisOptions().engine, .tempogram)
        XCTAssertEqual(Engine.peaks, .peaks(lowpass: .default))
    }

    func testPeaksTuningIsTheJsLibrarys() throws {
        let consts = try source("core/consts.ts")
        XCTAssertEqual(constant(consts, "export const startThreshold"), Peaks.startThreshold)
        XCTAssertEqual(constant(consts, "export const minValidThreshold"), Peaks.minValidThreshold)
        XCTAssertEqual(constant(consts, "export const thresholdStep"), Peaks.thresholdStep)
        XCTAssertEqual(constant(consts, "export const minPeaks").map(Int.init), Peaks.minPeaks)
        XCTAssertEqual(constant(consts, "export const peakSkipDuration"), Peaks.peakSkipSeconds)
        XCTAssertEqual(constant(consts, "export const maxIntervalComparisons").map(Int.init), Peaks.maxIntervalComparisons)
        XCTAssertEqual(Peaks.thresholdLadder(), [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2])
    }

    func testTempogramTuningIsTheJsLibrarys() throws {
        let tempogram = try source("core/tempogram.ts")
        guard let start = tempogram.range(of: "export const defaultTempogramTuning"),
              let end = tempogram.range(of: "};", range: start.upperBound..<tempogram.endIndex)
        else { return XCTFail("no defaultTempogramTuning in tempogram.ts") }
        let tuning = String(tempogram[start.lowerBound..<end.upperBound])
        let fields: [(String, Double)] = [
            ("frameRate", Tempogram.frameRate), ("compression", Tempogram.compression),
            ("localMeanSeconds", Tempogram.localMeanSeconds), ("windowSeconds", Tempogram.windowSeconds),
            ("warmupSeconds", Tempogram.warmupSeconds), ("updateSeconds", Tempogram.updateSeconds),
            ("combBeats", Double(Tempogram.combBeats)), ("halfBeatPenalty", Tempogram.halfBeatPenalty),
            ("thirdBeatPenalty", Tempogram.thirdBeatPenalty), ("priorBpm", Tempogram.priorBpm),
            ("priorOctaves", Tempogram.priorOctaves), ("readingSalience", Tempogram.readingSalience),
        ]
        for (name, value) in fields {
            XCTAssertEqual(constant(tuning, name), value, name)
        }
        let bands = matches("bands: \\[([^\\]]*)\\]", in: tuning).first?[1]
            .split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "_", with: "")) }
        XCTAssertEqual(bands, Tempogram.bands)
        // The offline path overrides the half-life: the whole file is one window of evidence, never forgotten
        XCTAssertTrue(tempogram.contains("halfLifeSeconds: Number.POSITIVE_INFINITY,"))
        XCTAssertEqual(Tempogram.halfLifeSeconds, .infinity)

        XCTAssertEqual(constant(tempogram, "const gridRatio"), Tempogram.gridRatio)
        XCTAssertEqual(constant(tempogram, "const loudnessDecay"), Tempogram.loudnessDecay)
        XCTAssertEqual(constant(tempogram, "const minimumLoudness"), Tempogram.minimumLoudness)
        XCTAssertEqual(constant(tempogram, "const maxCandidates").map(Int.init), Tempogram.maxCandidates)
    }

    /// Every table of calibration.ts, by engine then name.
    private func jsTables() throws -> [String: Calibration.Table] {
        let calibration = try source("core/calibration.ts")
        guard let start = calibration.range(of: "export const CALIBRATION") else {
            XCTFail("no CALIBRATION in calibration.ts")
            return [:]
        }
        let body = String(calibration[start.lowerBound...])
        let peaksAt = body.range(of: "peaks: {").map { body.distance(from: body.startIndex, to: $0.lowerBound) } ?? 0
        var tables: [String: Calibration.Table] = [:]
        guard let regex = try? NSRegularExpression(pattern: "(\\w+): \\[((?:\\s*\\[[^\\]]*\\],?)+)\\s*\\]") else { return [:] }
        for match in regex.matches(in: body, range: NSRange(body.startIndex..., in: body)) {
            guard let name = Range(match.range(at: 1), in: body), let points = Range(match.range(at: 2), in: body) else { continue }
            let table = matches("\\[([0-9.]+), ([0-9.]+)\\]", in: String(body[points])).compactMap { pair -> (raw: Double, calibrated: Double)? in
                guard let raw = Double(pair[1]), let calibrated = Double(pair[2]) else { return nil }
                return (raw, calibrated)
            }
            let engine = match.range.location < peaksAt ? "tempogram" : "peaks"
            tables["\(engine).\(body[name])"] = table
        }
        return tables
    }

    func testCalibrationReadsTheJsTables() throws {
        let tables = try jsTables()
        XCTAssertEqual(Set(tables.keys), ["tempogram.all", "tempogram.from140", "tempogram.from165", "peaks.all",
                                          "peaks.from90", "peaks.from140", "peaks.from165"], "the tables of calibration.ts")

        // The bpm that picks each table: the tempogram has no band under 140, and peaks' shared table is never read
        assertCalibrationReads(.tempogram, 100, tables["tempogram.all"] ?? [])
        assertCalibrationReads(.tempogram, 150, tables["tempogram.from140"] ?? [])
        assertCalibrationReads(.tempogram, 170, tables["tempogram.from165"] ?? [])
        assertCalibrationReads(.peaks, 100, tables["peaks.from90"] ?? [])
        assertCalibrationReads(.peaks, 150, tables["peaks.from140"] ?? [])
        assertCalibrationReads(.peaks, 170, tables["peaks.from165"] ?? [])
        // Never read, but kept as the benchmark committed it, as the JS library keeps it
        XCTAssertEqual(Calibration.peaks.all.map(\.raw), tables["peaks.all"]?.map(\.raw))
        XCTAssertEqual(Calibration.peaks.all.map(\.calibrated), tables["peaks.all"]?.map(\.calibrated))
    }

    /// At every point and between every two, the port reads what the JS table interpolates to.
    private func assertCalibrationReads(_ engine: EngineName, _ bpm: Double, _ table: Calibration.Table, line: UInt = #line) {
        XCTAssertEqual(table.count, 20, "\(engine) at \(bpm)", line: line)
        guard let first = table.first, let last = table.last else { return }
        for (i, point) in table.enumerated() {
            XCTAssertEqual(Calibration.calibrate(engine, raw: point.raw, bpm: bpm, range: .default), point.calibrated,
                           "\(engine) at \(bpm), point \(i)", line: line)
            guard i > 0 else { continue }
            let previous = table[i - 1]
            let raw = (previous.raw + point.raw) / 2
            let expected = previous.calibrated + ((point.calibrated - previous.calibrated) * (raw - previous.raw) / (point.raw - previous.raw))
            XCTAssertEqual(Calibration.calibrate(engine, raw: raw, bpm: bpm, range: .default), expected,
                           "\(engine) at \(bpm), between points \(i - 1) and \(i)", line: line)
        }
        XCTAssertEqual(Calibration.calibrate(engine, raw: 0, bpm: bpm, range: .default), first.calibrated, "flat under the table", line: line)
        XCTAssertEqual(Calibration.calibrate(engine, raw: 1, bpm: bpm, range: .default), last.calibrated, "flat over the table", line: line)
    }
}
