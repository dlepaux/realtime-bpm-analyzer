// The JS arithmetic the readings depend on, where Swift's defaults differ.

/// JS `Math.round`: halves go towards +infinity, so 2.5 gives 3 and -2.5 gives -2.
///
/// Swift's `.rounded()` sends halves away from zero, and `.toNearestOrEven` to the even neighbour, and either moves a
/// tempo that lands exactly on a half, such as the peaks engine's 122.5 BPM (conformance/readme.md, Rounding).
/// `floor(x + 0.5)` is not used either: the addition itself rounds just under 0.5 and above 2^52. `x - floor(x)` is
/// exact for x >= 0 and x <= -1 (Sterbenz), and between -1 and 0 its rounding can't cross 0.5.
@inline(__always)
func jsRound(_ value: Double) -> Double {
    let floor = value.rounded(.down)
    return value - floor >= 0.5 ? floor + 1 : floor
}

/// `jsRound` as an `Int`, for counts and indices the caller has bounded.
@inline(__always)
func jsRoundToInt(_ value: Double) -> Int {
    let rounded = jsRound(value)
    // Double(Int.max) rounds up to a power of two, so `<` keeps it out; a NaN fails both tests
    precondition(rounded >= -Double(Int.max) && rounded < Double(Int.max), "a count past Int: \(value)")
    return Int(rounded)
}
