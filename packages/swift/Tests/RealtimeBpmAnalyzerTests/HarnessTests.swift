// The harness's own rules: a conformance run that passes must be one that would have failed on any wrong field, any
// unknown key and any bad decoding.

import Foundation
import RealtimeBpmAnalyzer
import XCTest

final class HarnessTests: XCTestCase {
    private let tolerances = Tolerances(bpmExact: 1e-6, confidence: 1e-6)

    private let reading = Reading(
        bpm: 120,
        bpmExact: 120.25,
        confidence: 0.9,
        candidates: [Candidate(bpm: 120, relation: .top), Candidate(bpm: 60, relation: .half)],
        audio: AudioSpan(from: 0, to: 9.3),
        engine: .tempogram
    )

    private func expected(_ change: (inout [String: JSON]) -> Void = { _ in }) -> JSON {
        var fields: [String: JSON] = [
            "bpm": .number(120),
            "bpmExact": .number(120.25),
            "confidence": .number(0.9),
            "candidates": .array([
                .object(["bpm": .number(120), "relation": .string("top")]),
                .object(["bpm": .number(60), "relation": .string("half")]),
            ]),
            "audio": .object(["from": .number(0), "to": .number(9.3), "contextTime": .null]),
            "engine": .string("tempogram"),
        ]
        change(&fields)
        return .object(fields)
    }

    private func problems(_ expected: JSON?, _ actual: Reading?) -> [String] {
        var deviations = Deviations()
        return Vectors.compare(expected, actual, tolerances, &deviations)
    }

    func testPassesTheMatchingReadingWithinTolerance() {
        XCTAssertEqual(problems(expected(), reading), [])
        XCTAssertEqual(problems(expected { $0["bpmExact"] = .number(120.25 + 9e-7) }, reading), [])
        XCTAssertEqual(problems(.null, nil), [])
    }

    func testFailsEachMismatch() {
        let mismatches: [(String, (inout [String: JSON]) -> Void)] = [
            ("bpm", { $0["bpm"] = .number(121) }),
            ("bpmExact", { $0["bpmExact"] = .number(120.25 + 2e-6) }),
            ("confidence", { $0["confidence"] = .number(0.9 + 2e-6) }),
            ("confidence", { $0["confidence"] = .null }),
            ("candidates", { $0["candidates"] = .array([.object(["bpm": .number(120), "relation": .string("top")])]) }),
            ("candidates[1]", { $0["candidates"] = .array([
                .object(["bpm": .number(120), "relation": .string("top")]),
                .object(["bpm": .number(60), "relation": .string("other")]),
            ]) }),
            ("audio", { $0["audio"] = .object(["from": .number(0), "to": .number(9.3.nextUp), "contextTime": .null]) }),
            ("engine", { $0["engine"] = .string("peaks") }),
            ("key nobody mapped", { $0["tempo"] = .number(120) }),
            ("key nobody mapped", { $0["audio"] = .object(["from": .number(0), "to": .number(9.3), "contextTime": .null, "extra": .null]) }),
            ("contextTime", { $0["audio"] = .object(["from": .number(0), "to": .number(9.3), "contextTime": .number(0)]) }),
        ]
        for (field, change) in mismatches {
            let found = problems(expected(change), reading)
            XCTAssertTrue(found.contains { $0.contains(field) }, "\(field) should fail, found \(found)")
        }
        let unmeasured = Reading(bpm: 120, bpmExact: 120.25, confidence: nil, candidates: reading.candidates, audio: reading.audio, engine: .tempogram)
        XCTAssertFalse(problems(expected(), unmeasured).isEmpty, "a null confidence is not a number")
        XCTAssertFalse(problems(.null, reading).isEmpty, "a reading where none was expected")
        XCTAssertFalse(problems(expected(), nil).isEmpty, "no reading where one was expected")
        let nan = Reading(bpm: 120, bpmExact: .nan, confidence: 0.9, candidates: reading.candidates, audio: reading.audio, engine: .tempogram)
        XCTAssertFalse(problems(expected(), nan).isEmpty, "a NaN deviation fails")
    }

    func testMapsTheOptionsAsJsReadsThem() throws {
        XCTAssertEqual(try Vectors.options(.object([:])), AnalysisOptions())
        XCTAssertEqual(try Vectors.options(.object(["engine": .string("peaks")])).engine, .peaks(lowpass: Lowpass(frequency: 200, q: 1)))
        XCTAssertEqual(try Vectors.options(.object(["engine": .string("tempogram")])).engine, .tempogram)
        let lowpass = JSON.object(["engine": .object(["name": .string("peaks"), "lowpass": .object(["q": .number(3)])])])
        XCTAssertEqual(try Vectors.options(lowpass).engine, .peaks(lowpass: Lowpass(frequency: 200, q: 3)))
        let range = JSON.object(["tempoRange": .object(["min": .number(60), "max": .number(140)])])
        XCTAssertEqual(try Vectors.options(range).tempoRange, TempoRange(min: 60, max: 140))
    }

    func testRefusesATolerancePastTheReadmes() throws {
        func tolerances(_ absolute: Double) -> JSON {
            let entry = JSON.object(["absolute": .number(absolute), "referenceSpread": .number(0)])
            return .object(["bpmExact": entry, "confidence": entry])
        }
        XCTAssertEqual(try Vectors.tolerances(tolerances(1e-6)).bpmExact, 1e-6)
        XCTAssertThrowsError(try Vectors.tolerances(tolerances(1e-3)))
    }

    func testFailsOnAnOptionNobodyMapped() {
        let unmapped: [JSON] = [
            .object(["debug": .bool(true)]),
            .object(["engine": .string("auto")]),
            .object(["engine": .object(["name": .string("peaks"), "restartAfterSeconds": .number(5)])]),
            .object(["engine": .object(["name": .string("tempogram"), "lowpass": .object([:])])]),
            .object(["engine": .object(["name": .string("peaks"), "lowpass": .object(["Q": .number(1)])])]),
            .object(["tempoRange": .object(["min": .number(60)])]),
            .object(["tempoRange": .object(["min": .number(60), "max": .number(140), "step": .number(1)])]),
        ]
        for options in unmapped {
            XCTAssertThrowsError(try Vectors.options(options), "\(options)")
        }
    }

    func testDecodesSixteenBitLittleEndianAsTheReferenceDoes() throws {
        XCTAssertEqual(try Vectors.decode([0x00, 0x80, 0xff, 0x7f, 0x01, 0x00, 0xff, 0xff]), [Float(-1), Float(32767) / 32768, Float(1) / 32768, Float(-1) / 32768])
        XCTAssertThrowsError(try Vectors.decode([0x00]))
    }

    func testChecksumsMatchTheirStandards() {
        XCTAssertEqual(Gzip.crc32(Array("123456789".utf8)), 0xcbf4_3926)
        XCTAssertEqual(Sha256.hex(Array("abc".utf8)), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(Sha256.hex([]), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        let long = [UInt8](repeating: 0x61, count: 1_000)
        XCTAssertEqual(Sha256.hex(long), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3")
    }

    func testGzipRefusesACorruptFile() throws {
        // "hello\n", gzip -n: a fixed-Huffman block
        let hello: [UInt8] = [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xcb, 0x48, 0xcd, 0xc9, 0xc9, 0xe7,
                              0x02, 0x00, 0x20, 0x30, 0x3a, 0x36, 0x06, 0x00, 0x00, 0x00]
        XCTAssertEqual(try Gzip.decompress(hello), Array("hello\n".utf8))
        var corrupt = hello
        corrupt[18] ^= 0xff
        XCTAssertThrowsError(try Gzip.decompress(corrupt), "a wrong CRC-32")
        XCTAssertThrowsError(try Gzip.decompress(Array(hello.dropLast())), "a truncated trailer")
    }
}
