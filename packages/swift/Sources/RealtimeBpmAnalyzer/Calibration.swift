// Maps each engine's raw score to the chance its reading is right, as the JS library does.
//
// The tables are data from the JS library's benchmark, copied in millionths from
// packages/realtime-bpm-analyzer/src/core/calibration.ts, which explains how they were fitted. Regenerate them there,
// never edit them here: JsSourceTests holds this copy equal to that file.

enum Calibration {
    /// [raw, calibrated] points, raw increasing, calibrated non-decreasing.
    typealias Table = [(raw: Double, calibrated: Double)]

    /// The JS tables' points, each a decimal of at most six places, written in millionths. A float literal is not
    /// always the double JS reads: on x86_64, Swift 5.9 parses it through an 80-bit float, and 0.544738 compiled one
    /// ulp under. An integer over 1e6 is one correctly rounded division, so the nearest double on every platform.
    private static func millionths(_ points: [(Int, Int)]) -> Table {
        points.map { (raw: Double($0.0) / 1e6, calibrated: Double($0.1) / 1e6) }
    }

    struct Mapping {
        let all: Table
        let from90: Table?
        let from140: Table?
        let from165: Table?
    }

    static let tempogram = Mapping(
        all: millionths([
            (28_638, 200_510), (55_144, 372_585), (97_521, 575_647), (149_595, 635_569),
            (201_610, 690_485), (249_703, 727_670), (295_928, 762_304), (341_343, 765_585),
            (385_679, 799_125), (429_153, 835_641), (470_513, 845_789), (511_768, 869_486),
            (553_363, 884_798), (595_264, 895_735), (638_504, 910_317), (681_735, 915_421),
            (725_551, 919_825), (772_671, 936_566), (825_921, 944_951), (898_220, 951_513),
        ]),
        from90: nil,
        from140: millionths([
            (33_034, 334_740), (70_347, 600_000), (119_277, 732_771), (172_728, 746_835),
            (221_609, 808_451), (267_829, 831_224), (314_113, 845_288), (356_172, 871_921),
            (396_377, 871_921), (434_812, 907_042), (471_061, 931_083), (505_789, 939_479),
            (542_801, 939_479), (584_486, 947_257), (624_045, 947_257), (663_255, 960_563),
            (705_149, 964_838), (749_939, 964_838), (800_818, 971_147), (875_589, 971_147),
        ]),
        from165: millionths([
            (25_208, 107_843), (39_570, 230_392), (60_399, 323_529), (92_567, 338_235),
            (135_659, 367_647), (181_557, 500_000), (223_155, 500_000), (257_036, 500_000),
            (290_288, 500_000), (323_952, 500_000), (358_273, 519_608), (396_653, 607_843),
            (434_505, 644_608), (473_727, 644_608), (518_908, 671_569), (562_945, 720_588),
            (608_910, 735_294), (668_028, 774_510), (745_682, 872_549), (853_984, 872_549),
        ])
    )

    static let peaks = Mapping(
        all: millionths([
            (49_989, 185_357), (63_145, 222_892), (72_474, 267_501), (82_320, 352_641),
            (93_329, 443_930), (105_524, 544_738), (116_928, 613_531), (130_731, 671_918),
            (145_092, 692_771), (161_133, 753_012), (177_844, 798_795), (195_310, 816_960),
            (214_063, 830_862), (233_928, 855_355), (257_586, 890_176), (283_525, 914_041),
            (315_376, 914_041), (349_677, 923_077), (402_366, 952_028), (460_666, 952_028),
        ]),
        from90: millionths([
            (50_458, 131_043), (62_870, 155_952), (71_476, 210_560), (80_422, 259_707),
            (90_315, 323_791), (102_045, 446_849), (114_534, 545_165), (127_676, 612_985),
            (142_688, 650_763), (159_642, 708_015), (177_820, 786_123), (195_999, 817_430),
            (215_531, 839_593), (236_985, 873_410), (261_563, 900_064), (288_806, 928_731),
            (322_089, 928_731), (357_312, 942_748), (410_527, 952_260), (463_758, 952_290),
        ]),
        from140: millionths([
            (49_556, 370_370), (65_460, 537_118), (78_730, 636_166), (92_901, 775_599),
            (104_952, 801_743), (115_942, 846_783), (129_333, 846_783), (141_899, 846_783),
            (155_540, 846_783), (168_455, 893_636), (183_293, 893_636), (199_214, 893_636),
            (215_719, 893_636), (233_491, 893_636), (253_891, 924_796), (276_331, 924_796),
            (304_078, 924_796), (333_819, 924_796), (380_988, 954_148), (449_856, 980_392),
        ]),
        from165: millionths([
            (46_601, 218_750), (59_947, 275_591), (70_681, 275_591), (80_616, 421_875),
            (91_090, 437_500), (102_163, 468_504), (111_915, 468_504), (122_919, 476_562),
            (134_567, 561_659), (146_673, 561_659), (160_881, 561_659), (173_970, 561_659),
            (189_685, 561_659), (207_642, 561_659), (225_608, 561_659), (247_324, 609_375),
            (277_984, 670_588), (313_866, 670_588), (361_360, 779_528), (439_176, 804_688),
        ])
    )

    /// The reading's own tempo picks the band: up to 140, 140 to 165, 165 and over. A band the engine has no table for
    /// reads its shared one.
    static func table(_ engine: EngineName, bpm: Double) -> Table {
        let mapping = engine == .tempogram ? tempogram : peaks
        let band = bpm < 140 ? mapping.from90 : bpm < 165 ? mapping.from140 : mapping.from165
        return band ?? mapping.all
    }

    /// The table at `raw`, by linear interpolation, flat past either end.
    static func read(_ table: Table, _ raw: Double) -> Double {
        if raw <= table[0].raw { return table[0].calibrated }
        for i in 1..<table.count where raw <= table[i].raw {
            let (x0, y0) = table[i - 1]
            let (x1, y1) = table[i]
            return y0 + ((y1 - y0) * (raw - x0) / (x1 - x0))
        }
        return table[table.count - 1].calibrated
    }

    /// The chance a reading is right, 0 to 1, or `nil` when its tempo or the analysis's range was never measured.
    /// Compared by value, so an explicit 90 to 180 is the default range (RBA-108's DECISION of 2026-11-16).
    static func calibrate(_ engine: EngineName, raw: Double, bpm: Double, range: TempoRange) -> Double? {
        guard range == .default else { return nil }
        // Written so that a bpm that is not a number fails the test and reads as unmeasured
        guard bpm >= TempoRange.default.min, bpm <= TempoRange.default.max else { return nil }
        // A score that is not a number reads as no evidence, not as the top of the table
        let score = raw.isFinite ? Swift.min(1, Swift.max(0, raw)) : 0
        return read(table(engine, bpm: bpm), score)
    }
}
