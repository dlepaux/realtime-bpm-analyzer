// Reads ../../conformance/vectors.json strictly and compares a reading with an expected one, under the rules of
// conformance/readme.md. A key nobody mapped is a failure, in `options` above all: a case this port can't map to its
// API is a case it can't run, and skipping it is a failure.

import Foundation
import RealtimeBpmAnalyzer

struct HarnessError: Error, CustomStringConvertible {
    let description: String
}

/// A JSON value, with every key kept, so that an unknown one can be refused.
enum JSON: Decodable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSON].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSON].self))
        }
    }

    static func parse(_ data: Data) throws -> JSON {
        try JSONDecoder().decode(JSON.self, from: data)
    }
}

/// The largest float differences seen from the reference, over the cases that pass or fail.
struct Deviations {
    var bpmExact = 0.0
    var confidence = 0.0
}

struct Tolerances {
    let bpmExact: Double
    let confidence: Double
}

/// The name of the JS error each category of `AnalysisError` stands for.
func jsErrorName(of error: AnalysisError) -> String {
    switch error {
    case .invalidSamples: return "Error"
    case .outOfRange: return "RangeError"
    }
}

enum Vectors {
    static let fileKeys: Set = ["schemaVersion", "pcm", "tolerances", "inputs", "cases", "errorCases"]
    static let inputKeys: Set = ["id", "file", "sampleRate", "samples", "sha256", "description"]
    static let caseKeys: Set = ["id", "input", "sampleRate", "options", "expected"]
    static let errorCaseKeys: Set = ["id", "input", "sampleRate", "options", "expectedError", "why"]
    static let readingKeys: Set = ["bpm", "bpmExact", "confidence", "candidates", "audio", "engine"]
    static let pcm: JSON = .object([
        "encoding": .string("signed 16-bit little-endian"),
        "channels": .number(1),
        "compression": .string("gzip"),
        "divisor": .number(32768),
    ])

    // MARK: Reading the file

    static func object(_ value: JSON?, _ path: String) throws -> [String: JSON] {
        guard case .object(let object)? = value else { throw HarnessError(description: "\(path) is not an object") }
        return object
    }

    static func array(_ value: JSON?, _ path: String) throws -> [JSON] {
        guard case .array(let array)? = value else { throw HarnessError(description: "\(path) is not an array") }
        return array
    }

    static func number(_ value: JSON?, _ path: String) throws -> Double {
        guard case .number(let number)? = value else { throw HarnessError(description: "\(path) is not a number") }
        return number
    }

    static func string(_ value: JSON?, _ path: String) throws -> String {
        guard case .string(let string)? = value else { throw HarnessError(description: "\(path) is not a string") }
        return string
    }

    static func integer(_ value: JSON?, _ path: String) throws -> Int {
        let number = try number(value, path)
        guard let integer = Int(exactly: number) else { throw HarnessError(description: "\(path) is not an integer") }
        return integer
    }

    /// Fails on a key outside `allowed`, or a key of `required` missing.
    static func checkKeys(_ object: [String: JSON], allowed: Set<String>, required: Set<String>? = nil, _ path: String) throws {
        let unknown = Set(object.keys).subtracting(allowed)
        guard unknown.isEmpty else { throw HarnessError(description: "\(path) has a key nobody mapped: \(unknown.sorted())") }
        let missing = (required ?? allowed).subtracting(object.keys)
        guard missing.isEmpty else { throw HarnessError(description: "\(path) lacks \(missing.sorted())") }
    }

    static func tolerances(_ value: JSON?) throws -> Tolerances {
        let tolerances = try object(value, "tolerances")
        try checkKeys(tolerances, allowed: ["bpmExact", "confidence"], "tolerances")
        func absolute(_ field: String) throws -> Double {
            let entry = try object(tolerances[field], "tolerances.\(field)")
            try checkKeys(entry, allowed: ["absolute", "referenceSpread"], "tolerances.\(field)")
            return try number(entry["absolute"], "tolerances.\(field).absolute")
        }
        return Tolerances(bpmExact: try absolute("bpmExact"), confidence: try absolute("confidence"))
    }

    // MARK: Options

    /// The case's options as this port's API takes them. A missing key is the library's default.
    static func options(_ value: JSON?) throws -> AnalysisOptions {
        let options = try object(value, "options")
        try checkKeys(options, allowed: ["engine", "tempoRange"], required: [], "options")
        var result = AnalysisOptions()
        if let engine = options["engine"] {
            result.engine = try self.engine(engine)
        }
        if let range = options["tempoRange"] {
            let bounds = try object(range, "options.tempoRange")
            try checkKeys(bounds, allowed: ["min", "max"], "options.tempoRange")
            result.tempoRange = TempoRange(
                min: try number(bounds["min"], "options.tempoRange.min"),
                max: try number(bounds["max"], "options.tempoRange.max")
            )
        }
        return result
    }

    private static func engine(_ value: JSON) throws -> Engine {
        switch value {
        case .string("tempogram"):
            return .tempogram
        case .string("peaks"):
            return .peaks
        case .object(let engine):
            try checkKeys(engine, allowed: ["name", "lowpass"], required: ["name"], "options.engine")
            guard case .string("peaks")? = engine["name"] else {
                throw HarnessError(description: "options.engine.name \(String(describing: engine["name"])) takes no settings")
            }
            var lowpass = Lowpass.default
            if let settings = engine["lowpass"] {
                let fields = try object(settings, "options.engine.lowpass")
                try checkKeys(fields, allowed: ["frequency", "q"], required: [], "options.engine.lowpass")
                if let frequency = fields["frequency"] { lowpass.frequency = try number(frequency, "lowpass.frequency") }
                if let q = fields["q"] { lowpass.q = try number(q, "lowpass.q") }
            }
            return .peaks(lowpass: lowpass)
        default:
            throw HarnessError(description: "options.engine \(value) is no engine this port knows")
        }
    }

    // MARK: Comparing

    /// Every way `actual` differs from `expected`, by field; empty when it matches. Updates the largest deviations.
    static func compare(_ expected: JSON?, _ actual: Reading?, _ tolerances: Tolerances, _ deviations: inout Deviations) -> [String] {
        guard let expected, expected != .null else {
            return actual == nil ? [] : ["expected no tempo, read \(actual!.bpm) BPM"]
        }
        guard let actual else { return ["expected a reading, found no tempo"] }
        do {
            return try compareReading(try object(expected, "expected"), actual, tolerances, &deviations)
        } catch {
            return ["\(error)"]
        }
    }

    private static func compareReading(_ expected: [String: JSON], _ actual: Reading, _ tolerances: Tolerances, _ deviations: inout Deviations) throws -> [String] {
        try checkKeys(expected, allowed: readingKeys, "expected")
        var problems: [String] = []
        let bpm = try number(expected["bpm"], "bpm")
        if Double(actual.bpm) != bpm { problems.append("bpm: expected \(bpm), read \(actual.bpm)") }

        let bpmExact = try number(expected["bpmExact"], "bpmExact")
        let bpmExactDeviation = abs(actual.bpmExact - bpmExact)
        deviations.bpmExact = max(deviations.bpmExact, bpmExactDeviation)
        // Written so that a NaN deviation fails
        if !(bpmExactDeviation <= tolerances.bpmExact) {
            problems.append("bpmExact: expected \(bpmExact), read \(actual.bpmExact)")
        }

        switch (expected["confidence"], actual.confidence) {
        case (.null?, nil):
            break
        case (.number(let confidence)?, let read?):
            let deviation = abs(read - confidence)
            deviations.confidence = max(deviations.confidence, deviation)
            if !(deviation <= tolerances.confidence) { problems.append("confidence: expected \(confidence), read \(read)") }
        case (let confidence, let read):
            problems.append("confidence: expected \(String(describing: confidence)), read \(String(describing: read))")
        }

        let candidates = try array(expected["candidates"], "candidates")
        if candidates.count != actual.candidates.count {
            problems.append("candidates: expected \(candidates.count), read \(actual.candidates.count)")
        } else {
            for (index, (candidate, read)) in zip(candidates, actual.candidates).enumerated() {
                let fields = try object(candidate, "candidates[\(index)]")
                try checkKeys(fields, allowed: ["bpm", "relation"], "candidates[\(index)]")
                let bpm = try number(fields["bpm"], "candidates[\(index)].bpm")
                let relation = try string(fields["relation"], "candidates[\(index)].relation")
                if Double(read.bpm) != bpm || read.relation.rawValue != relation {
                    problems.append("candidates[\(index)]: expected \(bpm) \(relation), read \(read.bpm) \(read.relation.rawValue)")
                }
            }
        }

        let audio = try object(expected["audio"], "audio")
        try checkKeys(audio, allowed: ["from", "to", "contextTime"], "audio")
        guard audio["contextTime"] == .null else { throw HarnessError(description: "audio.contextTime is not null") }
        let from = try number(audio["from"], "audio.from")
        let to = try number(audio["to"], "audio.to")
        if actual.audio.from != from || actual.audio.to != to {
            problems.append("audio: expected \(from) to \(to), read \(actual.audio.from) to \(actual.audio.to)")
        }

        let engine = try string(expected["engine"], "engine")
        if actual.engine.rawValue != engine { problems.append("engine: expected \(engine), read \(actual.engine.rawValue)") }
        return problems
    }

    // MARK: Inputs

    /// The samples the JS library analysed: gunzipped, 16-bit little-endian, each divided by 32768 as a 32-bit float.
    static func decode(_ pcm: [UInt8]) throws -> [Float] {
        guard pcm.count % 2 == 0 else { throw HarnessError(description: "odd PCM byte count \(pcm.count)") }
        return stride(from: 0, to: pcm.count, by: 2).map { at in
            Float(Int16(bitPattern: UInt16(pcm[at]) | (UInt16(pcm[at + 1]) << 8))) / 32768
        }
    }

    /// Each input by id, checked against its count and digest, with its `nonFinite` samples written in.
    static func inputs(_ value: JSON?, in directory: URL) throws -> [String: [Float]] {
        var inputs: [String: [Float]] = [:]
        for (index, entry) in try array(value, "inputs").enumerated() {
            let input = try object(entry, "inputs[\(index)]")
            try checkKeys(input, allowed: inputKeys.union(["nonFinite"]), required: inputKeys, "inputs[\(index)]")
            let id = try string(input["id"], "inputs[\(index)].id")
            let file = directory.appendingPathComponent(try string(input["file"], "\(id).file"))
            let bytes = try Gzip.decompress([UInt8](try Data(contentsOf: file)))
            let digest = Sha256.hex(bytes)
            guard digest == (try string(input["sha256"], "\(id).sha256")) else {
                throw HarnessError(description: "\(id): SHA-256 \(digest) differs from vectors.json")
            }
            var samples = try decode(bytes)
            guard samples.count == (try integer(input["samples"], "\(id).samples")) else {
                throw HarnessError(description: "\(id): \(samples.count) samples, not as vectors.json says")
            }
            _ = try number(input["sampleRate"], "\(id).sampleRate")
            _ = try string(input["description"], "\(id).description")
            if let nonFinite = input["nonFinite"] {
                for (at, item) in try array(nonFinite, "\(id).nonFinite").enumerated() {
                    let override = try object(item, "\(id).nonFinite[\(at)]")
                    try checkKeys(override, allowed: ["index", "value"], "\(id).nonFinite[\(at)]")
                    let sample = try integer(override["index"], "\(id).nonFinite[\(at)].index")
                    guard samples.indices.contains(sample) else { throw HarnessError(description: "\(id): index \(sample) is past the end") }
                    switch try string(override["value"], "\(id).nonFinite[\(at)].value") {
                    case "NaN": samples[sample] = .nan
                    case "Infinity": samples[sample] = .infinity
                    case "-Infinity": samples[sample] = -.infinity
                    case let other: throw HarnessError(description: "\(id): unknown nonFinite value \(other)")
                    }
                }
            }
            guard inputs.updateValue(samples, forKey: id) == nil else { throw HarnessError(description: "input \(id) twice") }
        }
        return inputs
    }
}
