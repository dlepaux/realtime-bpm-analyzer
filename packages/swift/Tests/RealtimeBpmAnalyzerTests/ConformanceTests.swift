// The definition of done: every case of ../../conformance/vectors.json, the readings the JS library gives, reads the
// same here within the tolerances the file states. Skipping a case is a failure, and so is a key nobody mapped.

import Foundation
import RealtimeBpmAnalyzer
import XCTest

/// The repo's conformance folder: CONFORMANCE_DIR when set, else found from this file's place in the repo.
func conformanceDirectory() -> URL {
    if let configured = ProcessInfo.processInfo.environment["CONFORMANCE_DIR"] {
        return URL(fileURLWithPath: configured)
    }
    return URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // RealtimeBpmAnalyzerTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // swift
        .deletingLastPathComponent() // packages
        .deletingLastPathComponent()
        .appendingPathComponent("conformance")
}

final class ConformanceTests: XCTestCase {
    func testEveryCaseReadsAsTheJsReference() throws {
        let directory = conformanceDirectory()
        let root = try Vectors.object(try JSON.parse(try Data(contentsOf: directory.appendingPathComponent("vectors.json"))), "vectors.json")
        try Vectors.checkKeys(root, allowed: Vectors.fileKeys, "vectors.json")
        XCTAssertEqual(try Vectors.number(root["schemaVersion"], "schemaVersion"), 2, "this harness reads schema version 2")
        guard root["schemaVersion"] == .number(2) else { return }
        XCTAssertEqual(root["pcm"], Vectors.pcm, "the input encoding this harness decodes")
        let tolerances = try Vectors.tolerances(root["tolerances"])
        let inputs = try Vectors.inputs(root["inputs"], in: directory)

        var failures: [String] = []
        var deviations = Deviations()
        var passed = 0
        let cases = try Vectors.array(root["cases"], "cases")
        for (index, entry) in cases.enumerated() {
            let problems = run(entry, index, inputs, tolerances, &deviations)
            if problems.isEmpty { passed += 1 } else { failures.append(contentsOf: problems) }
        }

        var errorsPassed = 0
        let errorCases = try Vectors.array(root["errorCases"], "errorCases")
        for (index, entry) in errorCases.enumerated() {
            let problems = runError(entry, index, inputs)
            if problems.isEmpty { errorsPassed += 1 } else { failures.append(contentsOf: problems) }
        }

        XCTAssertFalse(cases.isEmpty || errorCases.isEmpty, "an empty set proves nothing")
        let verdict = failures.isEmpty && !cases.isEmpty && !errorCases.isEmpty ? "PASS" : "FAIL"
        // The line CI looks for, with the largest float differences from the reference
        print("conformance: \(verdict), \(passed)/\(cases.count) cases and \(errorsPassed)/\(errorCases.count) error cases; "
            + "largest deviation: bpmExact \(deviations.bpmExact) BPM, confidence \(deviations.confidence) "
            + "(every other field exact)")
        for failure in failures { XCTFail(failure) }
    }

    private func samples(_ inputs: [String: [Float]], _ fields: [String: JSON], _ id: String) throws -> [Float] {
        let name = try Vectors.string(fields["input"], "\(id).input")
        guard let samples = inputs[name] else { throw HarnessError(description: "no input \(name)") }
        return samples
    }

    private func run(_ entry: JSON, _ index: Int, _ inputs: [String: [Float]], _ tolerances: Tolerances, _ deviations: inout Deviations) -> [String] {
        var id = "cases[\(index)]"
        do {
            let fields = try Vectors.object(entry, id)
            id = try Vectors.string(fields["id"], "\(id).id")
            try Vectors.checkKeys(fields, allowed: Vectors.caseKeys, id)
            let reading = try analyzeChannelData(
                try samples(inputs, fields, id),
                sampleRate: try Vectors.number(fields["sampleRate"], "\(id).sampleRate"),
                options: try Vectors.options(fields["options"])
            )
            return Vectors.compare(fields["expected"], reading, tolerances, &deviations).map { "\(id): \($0)" }
        } catch {
            return ["\(id): \(error)"]
        }
    }

    private func runError(_ entry: JSON, _ index: Int, _ inputs: [String: [Float]]) -> [String] {
        var id = "errorCases[\(index)]"
        let expected: String
        let call: () throws -> Reading?
        do {
            let fields = try Vectors.object(entry, id)
            id = try Vectors.string(fields["id"], "\(id).id")
            try Vectors.checkKeys(fields, allowed: Vectors.errorCaseKeys, id)
            expected = try Vectors.string(fields["expectedError"], "\(id).expectedError")
            guard expected == "Error" || expected == "RangeError" else { return ["\(id): unknown error category \(expected)"] }
            _ = try Vectors.string(fields["why"], "\(id).why")
            let samples = try samples(inputs, fields, id)
            let sampleRate = try Vectors.number(fields["sampleRate"], "\(id).sampleRate")
            let options = try Vectors.options(fields["options"])
            call = { try analyzeChannelData(samples, sampleRate: sampleRate, options: options) }
        } catch {
            return ["\(id): \(error)"]
        }
        do {
            let reading = try call()
            return ["\(id): expected \(expected), read \(String(describing: reading))"]
        } catch let error as AnalysisError {
            let name = jsErrorName(of: error)
            return name == expected ? [] : ["\(id): expected \(expected), threw \(name): \(error)"]
        } catch {
            return ["\(id): expected \(expected), threw another error type: \(error)"]
        }
    }
}
