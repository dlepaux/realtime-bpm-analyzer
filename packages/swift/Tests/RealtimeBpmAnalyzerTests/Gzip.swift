// A gzip reader for the conformance inputs, test-only. Foundation has no gzip on Linux, and a system zlib module
// would need a module map and a dev package on every machine, so this is a plain DEFLATE decoder (RFC 1951, after
// Mark Adler's puff.c) inside the gzip framing (RFC 1952). The member's CRC-32 and length are checked, and the
// harness checks each input's SHA-256 too, so a decoding bug fails loudly rather than as a misreading.

struct GzipError: Error, CustomStringConvertible {
    let description: String
}

enum Gzip {
    /// The decompressed bytes of a single-member gzip file.
    static func decompress(_ data: [UInt8]) throws -> [UInt8] {
        guard data.count >= 18, data[0] == 0x1f, data[1] == 0x8b, data[2] == 8 else {
            throw GzipError(description: "not a gzip file with DEFLATE compression")
        }
        let flags = data[3]
        guard flags & 0xe0 == 0 else { throw GzipError(description: "reserved gzip flags set") }
        var position = 10
        if flags & 0x04 != 0 {
            guard position + 2 <= data.count else { throw GzipError(description: "truncated extra field") }
            position += 2 + Int(data[position]) + (Int(data[position + 1]) << 8)
        }
        for flag: UInt8 in [0x08, 0x10] where flags & flag != 0 {
            while position < data.count, data[position] != 0 { position += 1 }
            position += 1
        }
        if flags & 0x02 != 0 { position += 2 }
        guard position < data.count else { throw GzipError(description: "truncated gzip header") }

        var inflater = Inflater(data, at: position)
        let output = try inflater.run()
        let trailer = inflater.byteAlignedPosition
        guard trailer + 8 == data.count else {
            throw GzipError(description: "expected one gzip member and its 8-byte trailer, found \(data.count - trailer) bytes")
        }
        let crc = littleEndian32(data, trailer)
        let size = littleEndian32(data, trailer + 4)
        guard crc == crc32(output) else { throw GzipError(description: "CRC-32 mismatch") }
        guard size == UInt32(truncatingIfNeeded: output.count) else { throw GzipError(description: "length mismatch") }
        return output
    }

    private static func littleEndian32(_ data: [UInt8], _ at: Int) -> UInt32 {
        (0..<4).reduce(UInt32(0)) { $0 | (UInt32(data[at + $1]) << (8 * UInt32($1))) }
    }

    static func crc32(_ bytes: [UInt8]) -> UInt32 {
        var table = [UInt32](repeating: 0, count: 256)
        for n in 0..<256 {
            var c = UInt32(n)
            for _ in 0..<8 { c = c & 1 != 0 ? 0xedb8_8320 ^ (c >> 1) : c >> 1 }
            table[n] = c
        }
        var crc: UInt32 = 0xffff_ffff
        for byte in bytes { crc = table[Int((crc ^ UInt32(byte)) & 0xff)] ^ (crc >> 8) }
        return crc ^ 0xffff_ffff
    }
}

/// A canonical Huffman code: how many codes of each length, and the symbols in code order.
private struct Huffman {
    var counts = [Int](repeating: 0, count: 16)
    var symbols: [Int]

    init(lengths: ArraySlice<Int>) throws {
        symbols = [Int](repeating: 0, count: lengths.count)
        for length in lengths { counts[length] += 1 }
        var left = 1
        for length in 1..<16 {
            left = (left << 1) - counts[length]
            guard left >= 0 else { throw GzipError(description: "over-subscribed Huffman code") }
        }
        var offsets = [Int](repeating: 0, count: 16)
        for length in 1..<15 { offsets[length + 1] = offsets[length] + counts[length] }
        for (symbol, length) in lengths.enumerated() where length != 0 {
            symbols[offsets[length]] = symbol
            offsets[length] += 1
        }
    }
}

private struct Inflater {
    private static let lengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
    private static let lengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
    private static let distanceBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
    private static let distanceExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
    private static let codeLengthOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

    private let data: [UInt8]
    private var position: Int
    private var bitBuffer = 0
    private var bitCount = 0
    private var output: [UInt8] = []

    init(_ data: [UInt8], at position: Int) {
        self.data = data
        self.position = position
    }

    /// Where the bytes after the stream start: the bits left in the buffer belong to the last stream byte.
    var byteAlignedPosition: Int { position }

    mutating func run() throws -> [UInt8] {
        var last = false
        while !last {
            last = try bits(1) == 1
            switch try bits(2) {
            case 0: try stored()
            case 1: try fixed()
            case 2: try dynamic()
            default: throw GzipError(description: "invalid DEFLATE block type")
            }
        }
        return output
    }

    private mutating func bits(_ need: Int) throws -> Int {
        while bitCount < need {
            guard position < data.count else { throw GzipError(description: "truncated DEFLATE stream") }
            bitBuffer |= Int(data[position]) << bitCount
            position += 1
            bitCount += 8
        }
        let value = bitBuffer & ((1 << need) - 1)
        bitBuffer >>= need
        bitCount -= need
        return value
    }

    private mutating func stored() throws {
        bitBuffer = 0
        bitCount = 0
        guard position + 4 <= data.count else { throw GzipError(description: "truncated stored block") }
        let length = Int(data[position]) | (Int(data[position + 1]) << 8)
        let complement = Int(data[position + 2]) | (Int(data[position + 3]) << 8)
        guard length == ~complement & 0xffff else { throw GzipError(description: "stored block length mismatch") }
        position += 4
        guard position + length <= data.count else { throw GzipError(description: "truncated stored block") }
        output.append(contentsOf: data[position..<(position + length)])
        position += length
    }

    private mutating func decode(_ code: Huffman) throws -> Int {
        var value = 0
        var first = 0
        var index = 0
        for length in 1..<16 {
            value |= try bits(1)
            let count = code.counts[length]
            if value - count < first { return code.symbols[index + (value - first)] }
            index += count
            first = (first + count) << 1
            value <<= 1
        }
        throw GzipError(description: "invalid Huffman code")
    }

    private mutating func fixed() throws {
        var lengths = [Int](repeating: 8, count: 288)
        for symbol in 144..<256 { lengths[symbol] = 9 }
        for symbol in 256..<280 { lengths[symbol] = 7 }
        try codes(Huffman(lengths: lengths[...]), Huffman(lengths: [Int](repeating: 5, count: 30)[...]))
    }

    private mutating func dynamic() throws {
        let literalCount = try bits(5) + 257
        let distanceCount = try bits(5) + 1
        let codeLengthCount = try bits(4) + 4
        guard literalCount <= 286, distanceCount <= 30 else { throw GzipError(description: "bad code counts") }
        var codeLengths = [Int](repeating: 0, count: 19)
        for i in 0..<codeLengthCount { codeLengths[Self.codeLengthOrder[i]] = try bits(3) }
        let codeLengthCode = try Huffman(lengths: codeLengths[...])

        var lengths: [Int] = []
        while lengths.count < literalCount + distanceCount {
            let symbol = try decode(codeLengthCode)
            switch symbol {
            case 0..<16:
                lengths.append(symbol)
            case 16:
                guard let previous = lengths.last else { throw GzipError(description: "repeat with no length") }
                lengths.append(contentsOf: repeatElement(previous, count: 3 + (try bits(2))))
            case 17:
                lengths.append(contentsOf: repeatElement(0, count: 3 + (try bits(3))))
            default:
                lengths.append(contentsOf: repeatElement(0, count: 11 + (try bits(7))))
            }
        }
        guard lengths.count == literalCount + distanceCount, lengths[256] != 0 else {
            throw GzipError(description: "bad code lengths")
        }
        try codes(
            Huffman(lengths: lengths[0..<literalCount]),
            Huffman(lengths: lengths[literalCount...])
        )
    }

    private mutating func codes(_ literals: Huffman, _ distances: Huffman) throws {
        while true {
            let symbol = try decode(literals)
            if symbol < 256 {
                output.append(UInt8(symbol))
                continue
            }
            if symbol == 256 { return }
            let lengthIndex = symbol - 257
            guard lengthIndex < Self.lengthBase.count else { throw GzipError(description: "bad length symbol") }
            let length = Self.lengthBase[lengthIndex] + (try bits(Self.lengthExtra[lengthIndex]))
            let distanceSymbol = try decode(distances)
            guard distanceSymbol < Self.distanceBase.count else { throw GzipError(description: "bad distance symbol") }
            let distance = Self.distanceBase[distanceSymbol] + (try bits(Self.distanceExtra[distanceSymbol]))
            guard distance <= output.count else { throw GzipError(description: "distance too far back") }
            let start = output.count - distance
            // Byte by byte: a copy may overlap the bytes it is writing
            for i in 0..<length { output.append(output[start + i]) }
        }
    }
}
