// The tempogram engine, whole-input path: band-wise onset strength, its autocorrelation read through a comb on a
// tempo grid, a log-Gaussian tempo prior, and every frame's salience accumulated with the same weight.
//
// A port of packages/realtime-bpm-analyzer/src/core/tempogram.ts (`detectTempogram`), in the reference's order of
// operations: the same radix-2 FFT, the same rings, the same sums left to right. The realtime detector's stable rule
// decides only when a live reading is shown, so it has no part here.

import Foundation

enum Tempogram {
    /// Under the frame rate a hop rounds to no samples.
    static let minimumSampleRate: Double = frameRate

    // The tuning the JS library ships (defaultTempogramTuning), with the infinite half-life whole-input analysis sets
    static let frameRate: Double = 100
    static let bands: [Double] = [30, 200, 500, 1500, 4000, 10000]
    static let compression: Double = 1000
    static let localMeanSeconds = 0.5
    static let windowSeconds: Double = 8
    static let warmupSeconds: Double = 4
    static let updateSeconds = 0.5
    static let combBeats = 4
    static let halfLifeSeconds = Double.infinity
    static let halfBeatPenalty: Double = 0
    static let thirdBeatPenalty = 0.3
    static let priorBpm: Double = 80
    static let priorOctaves = 1.7
    static let readingSalience = 0.02

    /// Tempo grid resolution: tempo ratio between neighbours.
    static let gridRatio = 1.01
    /// Fastest the loudness reference falls, per frame.
    static let loudnessDecay = 0.9995
    /// Loudness reference floor: silence stays silence.
    static let minimumLoudness = 0.05
    /// Onset strength smoothing over 50 ms at 100 Hz.
    static let smoothingWeights: [Double] = [1.0 / 9, 2.0 / 9, 3.0 / 9, 2.0 / 9, 1.0 / 9]
    static let maxCandidates = 5
    /// Shorter audio has no two beats to compare at the slowest tempo searched.
    static let shortestRecordingSeconds = 1.5

    /// Up to 5 candidates, best first, empty when no pulse stands out. The rate is at least 100 Hz and the range
    /// checked.
    static func detect(_ samples: UnsafeBufferPointer<Float>, sampleRate: Double, range: TempoRange) -> [Tempo] {
        let seconds = Double(samples.count) / sampleRate
        guard seconds >= shortestRecordingSeconds else { return [] }
        // A frame short of the end: rounding must not ask for more frames than the input holds
        var detector = Detector(sampleRate: sampleRate, range: range, warmupSeconds: Swift.min(warmupSeconds, seconds - (1 / frameRate)))
        for sample in samples { detector.process(sample) }
        // Not the last frame's reading: a silent ending leaves that one empty, and says nothing of the music before it
        return detector.candidates()
    }
}

/// The JS library's in-place radix-2 FFT, with its twiddle tables, so the spectra add up in the same order.
private struct Fft {
    let size: Int
    private let cosines: [Double]
    private let sines: [Double]
    private let reversed: [Int]

    init(size: Int) {
        self.size = size
        cosines = (0..<(size / 2)).map { cos((2 * Double.pi * Double($0)) / Double(size)) }
        sines = (0..<(size / 2)).map { -sin((2 * Double.pi * Double($0)) / Double(size)) }
        let bits = size.trailingZeroBitCount
        reversed = (0..<size).map { i in (0..<bits).reduce(0) { ($0 << 1) | ((i >> $1) & 1) } }
    }

    func transform(_ re: inout [Double], _ im: inout [Double]) {
        for i in 0..<size {
            let j = reversed[i]
            if j > i {
                re.swapAt(i, j)
                im.swapAt(i, j)
            }
        }
        var half = 1
        while half < size {
            let step = size / (2 * half)
            for start in stride(from: 0, to: size, by: 2 * half) {
                for k in 0..<half {
                    let a = start + k
                    let b = a + half
                    let wr = cosines[k * step]
                    let wi = sines[k * step]
                    let tr = (re[b] * wr) - (im[b] * wi)
                    let ti = (re[b] * wi) + (im[b] * wr)
                    re[b] = re[a] - tr
                    im[b] = im[a] - ti
                    re[a] += tr
                    im[a] += ti
                }
            }
            half *= 2
        }
    }
}

/// One onset strength per hop: the positive band-wise rise of log-compressed spectra, less each band's local mean.
private struct OnsetStage {
    let fftSize: Int
    private let fft: Fft
    private let bins: Int
    private let edges: [Int]
    private let meanStep: Double
    /// The windowed frame in, the power spectrum out
    var re: [Double]
    private var im: [Double]
    private var previousLog: [Double]
    private var localMeans: [Double]
    private var loudness = Tempogram.minimumLoudness
    private var hasPrevious = false

    init(sampleRate: Double, frameRate: Double) {
        fftSize = 1 << jsRoundToInt(log2(0.023 * sampleRate))
        fft = Fft(size: fftSize)
        let binCount = fftSize / 2
        bins = binCount
        let nyquist = sampleRate / 2
        edges = Tempogram.bands.map { hz in Swift.min(binCount, Swift.max(1, jsRoundToInt((hz / nyquist) * Double(binCount)))) }
        meanStep = 1 / (Tempogram.localMeanSeconds * frameRate)
        re = [Double](repeating: 0, count: fftSize)
        im = [Double](repeating: 0, count: fftSize)
        previousLog = [Double](repeating: 0, count: bins)
        localMeans = [Double](repeating: 0, count: edges.count - 1)
    }

    /// The onset strength of the frame held in `re`.
    mutating func frame() -> Double {
        for i in 0..<fftSize { im[i] = 0 }
        fft.transform(&re, &im)
        var peak = 0.0
        var total = 0.0
        for bin in 1..<bins {
            let power = (re[bin] * re[bin]) + (im[bin] * im[bin])
            re[bin] = power
            peak = power > peak ? power : peak
            total += power
        }
        // A NaN or infinite sample is no audio: no onset, and the state is kept. analyzeChannelData refuses such
        // samples first (RBA-260); this mirrors the reference's realtime rule (RBA-246)
        guard total.isFinite else { return 0 }
        // Relative to a slow loudness reference, so the reading does not depend on the volume
        loudness = Swift.max(peak.squareRoot(), loudness * Tempogram.loudnessDecay, Tempogram.minimumLoudness)
        let scale = Tempogram.compression / loudness
        var strength = 0.0
        for band in 0..<(edges.count - 1) {
            let (first, end) = (edges[band], edges[band + 1])
            var flux = 0.0
            for bin in first..<Swift.max(first, end) {
                let logarithm = log(1 + (scale * re[bin].squareRoot()))
                let rise = logarithm - previousLog[bin]
                previousLog[bin] = logarithm
                flux += rise > 0 ? rise : 0
            }
            flux /= Double(Swift.max(1, end - first))
            localMeans[band] += meanStep * (flux - localMeans[band])
            let novelty = flux - localMeans[band]
            strength += novelty > 0 ? novelty : 0
        }
        // The first frame rises from nothing, which is no onset
        guard hasPrevious else {
            hasPrevious = true
            return 0
        }
        return strength
    }
}

/// The tempos searched, one per 1% step from the range's min, with their prior and each beat multiple's lag.
private struct TempoGrid {
    let tempos: [Double]
    let prior: [Double]
    /// For each tempo, each beat multiple: the lag in frames, at `i * combBeats + k`
    let lags: [Double]
    let maxLag: Int

    init(range: TempoRange, frameRate: Double, windowFrames: Int) {
        // checkTempoRange keeps max / min finite, so the size is too: at most 71,333 tempos
        let size = Int((log(range.max / range.min) / log(Tempogram.gridRatio)).rounded(.down)) + 1
        let harmonics = Tempogram.combBeats
        var tempos = [Double](repeating: 0, count: size)
        var prior = [Double](repeating: 0, count: size)
        var lags = [Double](repeating: 0, count: size * harmonics)
        var maxLag = 0.0
        for i in 0..<size {
            let tempo = range.min * pow(Tempogram.gridRatio, Double(i))
            tempos[i] = tempo
            let octaves = log2(tempo / Tempogram.priorBpm) / Tempogram.priorOctaves
            prior[i] = exp(-0.5 * (octaves * octaves))
            for k in 0..<harmonics {
                let lag = (Double(k + 1) * 60 * frameRate) / tempo
                lags[(i * harmonics) + k] = lag
                maxLag = lag < Double(windowFrames - 1) && lag > maxLag ? lag : maxLag
            }
        }
        self.tempos = tempos
        self.prior = prior
        self.lags = lags
        self.maxLag = Int(maxLag.rounded(.up)) + 1
    }
}

/// The JS detector's state, fed one sample at a time as its `process` is.
private struct Detector {
    private var onset: OnsetStage
    private let grid: TempoGrid
    private let hop: Int
    private let hann: [Double]
    private let windowFrames: Int
    private let updateFrames: Int
    private let warmupFrames: Int
    private let memory: Double
    private var samplesRing: [Float]
    /// Written twice, so the latest window is always a contiguous range
    private var ossRing: [Float]
    private var recent: [Double]
    private var centred: [Double]
    /// Kept across frames: a lag past this frame's end reads what an earlier frame left, as in the reference
    private var autocorrelation: [Double]
    private var salience: [Double]
    private var accumulated: [Double]
    private var ranking: [Double]
    private var samplesWritten = 0
    private var sinceHop = 0
    private var frames = 0
    private var accumulatedWeight = 0.0

    init(sampleRate: Double, range: TempoRange, warmupSeconds: Double) {
        hop = jsRoundToInt(sampleRate / Tempogram.frameRate)
        let frameRate = sampleRate / Double(hop)
        onset = OnsetStage(sampleRate: sampleRate, frameRate: frameRate)
        windowFrames = jsRoundToInt(Tempogram.windowSeconds * frameRate)
        grid = TempoGrid(range: range, frameRate: frameRate, windowFrames: windowFrames)
        let fftSize = onset.fftSize
        hann = (0..<fftSize).map { 0.5 - (0.5 * cos((2 * Double.pi * Double($0)) / Double(fftSize))) }
        samplesRing = [Float](repeating: 0, count: fftSize)
        ossRing = [Float](repeating: 0, count: 2 * windowFrames)
        recent = [Double](repeating: 0, count: Tempogram.smoothingWeights.count)
        centred = [Double](repeating: 0, count: windowFrames)
        autocorrelation = [Double](repeating: 0, count: grid.maxLag + 1)
        salience = [Double](repeating: 0, count: grid.tempos.count)
        accumulated = [Double](repeating: 0, count: grid.tempos.count)
        ranking = [Double](repeating: 0, count: grid.tempos.count)
        updateFrames = Swift.max(1, jsRoundToInt(Tempogram.updateSeconds * frameRate))
        warmupFrames = jsRoundToInt(warmupSeconds * frameRate)
        // 1 for whole-input analysis: every frame counts the same
        memory = pow(0.5, Tempogram.updateSeconds / Tempogram.halfLifeSeconds)
    }

    mutating func process(_ sample: Float) {
        let fftSize = onset.fftSize
        samplesRing[samplesWritten % fftSize] = sample
        samplesWritten += 1
        sinceHop += 1
        guard sinceHop == hop else { return }
        sinceHop = 0
        let position = samplesWritten % fftSize
        for i in 0..<fftSize {
            onset.re[i] = Double(samplesRing[(position + i) % fftSize]) * hann[i]
        }
        ingest(onset.frame())
    }

    private mutating func ingest(_ onsetStrength: Double) {
        let weights = Tempogram.smoothingWeights
        recent[frames % recent.count] = onsetStrength
        var strength = 0.0
        for i in 0..<recent.count {
            strength += recent[(frames + recent.count - i) % recent.count] * weights[i]
        }
        let slot = frames % windowFrames
        ossRing[slot] = Float(strength)
        ossRing[slot + windowFrames] = Float(strength)
        frames += 1
        if frames >= warmupFrames, (frames - warmupFrames) % updateFrames == 0, computeSalience() {
            accumulate()
        }
    }

    /// The autocorrelation at a fractional lag, linearly interpolated. Past the buffer the reference reads
    /// `undefined`, which is NaN: checked before the floor, since a tempo near 0 BPM gives an infinite lag.
    private func correlationAt(_ lag: Double) -> Double {
        guard lag < Double(autocorrelation.count - 1) else { return .nan }
        let low = lag.rounded(.down)
        let index = Int(low)
        return autocorrelation[index] + ((lag - low) * (autocorrelation[index + 1] - autocorrelation[index]))
    }

    /// Fills `salience` from the latest window; false when nothing pulses in it.
    private mutating func computeSalience() -> Bool {
        let length = Swift.min(frames, windowFrames)
        let first = frames <= windowFrames ? 0 : frames % windowFrames
        var mean = 0.0
        for i in 0..<length { mean += Double(ossRing[first + i]) }
        mean /= Double(length)
        for i in 0..<length { centred[i] = Double(ossRing[first + i]) - mean }

        let lagEnd = Swift.min(grid.maxLag, length - 1)
        for lag in 0...lagEnd {
            var sum = 0.0
            for i in lag..<length { sum += centred[i] * centred[i - lag] }
            // Unbiased: a long lag overlaps less, which must not read as less periodic
            autocorrelation[lag] = (sum * Double(length)) / Double(length - lag)
        }
        let energy = autocorrelation[0]
        guard energy >= 1e-12 else { return false }

        let harmonics = Tempogram.combBeats
        for i in 0..<salience.count {
            var sum = 0.0
            var weight = 0.0
            for k in 0..<harmonics {
                let lag = grid.lags[(i * harmonics) + k]
                if lag >= Double(lagEnd) { break }
                sum += correlationAt(lag)
                weight += 1
            }
            let comb = weight > 0 ? sum / (weight * energy) : 0
            let beat = grid.lags[i * harmonics]
            // A NaN penalty, past the buffer, counts as none, as `between > 0` fails for it in JS too
            let between = (Tempogram.halfBeatPenalty * correlationAt(beat / 2)) + (Tempogram.thirdBeatPenalty * correlationAt(beat / 3))
            salience[i] = comb - ((between > 0 ? between : 0) / energy)
        }
        return true
    }

    private mutating func accumulate() {
        accumulatedWeight = (accumulatedWeight * memory) + 1
        for i in 0..<accumulated.count {
            let positive = salience[i] > 0 ? salience[i] : 0
            accumulated[i] = (accumulated[i] * memory) + positive
            ranking[i] = (accumulated[i] / accumulatedWeight) * grid.prior[i]
        }
    }

    /// The grid tempo moved to the vertex of the parabola through its ranking and its neighbours'.
    private func refinedTempo(_ i: Int) -> Double {
        guard i > 0, i < ranking.count - 1 else { return grid.tempos[i] }
        let denominator = ranking[i - 1] - (2 * ranking[i]) + ranking[i + 1]
        let offset = denominator == 0 ? 0 : (0.5 * (ranking[i - 1] - ranking[i + 1])) / denominator
        return grid.tempos[i] * pow(Tempogram.gridRatio, offset)
    }

    /// Whether a positive ranking is at least both of its neighbours.
    private func isLocalPeak(_ i: Int) -> Bool {
        let left = i > 0 ? ranking[i - 1] : -Double.infinity
        let right = i < ranking.count - 1 ? ranking[i + 1] : -Double.infinity
        return ranking[i] > 0 && ranking[i] >= left && ranking[i] >= right
    }

    /// Candidates from everything heard: the local peaks by ranking, the first five, those salient enough.
    func candidates() -> [Tempo] {
        let peaks = ranking.indices.filter(isLocalPeak)
        // Equal rankings keep grid order, as Array.prototype.sort keeps them; Swift's sort does not promise to
        let ranked = peaks.sorted { ranking[$0] != ranking[$1] ? ranking[$0] > ranking[$1] : $0 < $1 }
        return ranked.prefix(Tempogram.maxCandidates).compactMap { i in
            let exact = refinedTempo(i)
            let salience = Swift.min(1, accumulated[i] / accumulatedWeight)
            return salience >= Tempogram.readingSalience ? Tempo(tempo: jsRound(exact), exact: exact, score: salience) : nil
        }
    }
}
