# realtime-bpm-analyzer for Swift

The offline BPM analysis of [realtime-bpm-analyzer](https://www.realtime-bpm-analyzer.com), ported to pure Swift. You
pass the decoded samples of one channel and get a reading back: the tempo, its confidence, and the other candidate
tempos.

It gives the same readings as the JS library's `analyzeChannelData`. The repository's
[conformance vectors](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/conformance) hold the JS library's
readings, and the calls that must fail, and the port's tests compare every one of them on every change.

## Install

With Swift Package Manager, from the package's own repository,
[dlepaux/realtime-bpm-analyzer-swift](https://github.com/dlepaux/realtime-bpm-analyzer-swift):

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/dlepaux/realtime-bpm-analyzer-swift", from: "6.2.0"),
],
targets: [
    .target(name: "MyApp", dependencies: [
        .product(name: "RealtimeBpmAnalyzer", package: "realtime-bpm-analyzer-swift"),
    ]),
]
```

In Xcode, **File > Add Package Dependencies…**, then paste the repository's URL.

It needs Swift 5.9 or later (Xcode 15 or later), and runs on iOS 13 and macOS 10.15 or later, and on Linux. It has
no dependency and imports Foundation only: no Accelerate, no AVFoundation.

## Versions

The version is the JS library's major and minor whose conformance vectors the port passes, plus its own patch:
6.2.x reads the same as `realtime-bpm-analyzer` 6.2 on npm. A patch of the port can ship without a JS release.
`from: "6.2.0"` takes any later 6.x.

The code lives in [`packages/swift`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/packages/swift) of
the main repository, where release-please versions it with the other ports. On each Swift release, its pipeline
copies the package to the root of realtime-bpm-analyzer-swift, which SwiftPM needs, and tags it with the bare
version, such as `6.2.0`.

## Example

Decoding is your job. On Apple platforms, `AVAudioFile` decodes to the 32-bit float samples the analysis takes:

```swift
import AVFoundation
import RealtimeBpmAnalyzer

let file = try AVAudioFile(forReading: url)
guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
      let channels = buffer.floatChannelData else { return }
try file.read(into: buffer)
let left = UnsafeBufferPointer(start: channels[0], count: Int(buffer.frameLength))
if let reading = try analyzeChannelData(left, sampleRate: file.processingFormat.sampleRate) {
    print(reading.bpm, reading.confidence.map { "confidence \($0)" } ?? "unmeasured confidence")
}
```

A whole song takes a while, so run it off the main thread, in a `Task.detached` or your own queue. The call holds no
state, so any thread will do.

## API

```swift
func analyzeChannelData(_ samples: [Float], sampleRate: Double,
                        options: AnalysisOptions = AnalysisOptions()) throws -> Reading?
func analyzeChannelData(_ samples: UnsafeBufferPointer<Float>, sampleRate: Double,
                        options: AnalysisOptions = AnalysisOptions()) throws -> Reading?
```

Both read the same; the buffer one saves a copy when the samples are already in memory, such as an
`AVAudioPCMBuffer`'s. The buffer is only read, and only during the call.

- `samples`: one channel, from -1 to 1.
- `sampleRate`: their rate in Hz. The tempogram needs at least 100 Hz; `peaks` at least 2 Hz, and more than twice
  its lowpass cutoff.
- `options`: `AnalysisOptions(engine:tempoRange:)`, every field with the JS library's default.
  - `engine`: `.tempogram`, the default, reads the full band. `.peaks` counts the intervals between bass peaks,
    after a lowpass: `.peaks` is `.peaks(lowpass: Lowpass(frequency: 200, q: 1))`, the cutoff in Hz and Q in dB as a
    Web Audio `BiquadFilterNode` takes them, Q from -758 to 770.
  - `tempoRange`: `TempoRange(min: 90, max: 180)` by default. `max` must be at least twice `min`, and at most
    2,147,483,647. A tempo outside the range reads at its octave inside.

It returns `nil` when no tempo was found: silence, or under 1.5 seconds for the tempogram. Input with no beat, such
as noise, may still return a reading. Otherwise a `Reading`, a value type like every other here, and `Sendable`:

- `bpm`: the tempo, a whole BPM.
- `bpmExact`: the same tempo before rounding.
- `confidence`: how likely the reading is right, from 0 to 1, or `nil` where that was never measured: on any range
  other than 90 to 180 BPM, which the confidence was calibrated on, or when the peaks engine found the beats only
  relative to a quiet or bass-light input's own level, which input may hold no beat at all.
- `candidates`: up to 5 tempos, the reading's first, each with its `relation` to it: `.top`, `.half`, `.double` or
  `.other`. The JS library may add a relation in a minor release, so a `switch` over it should keep a `default`.
- `audio`: the span analysed, `from` 0 `to` the duration in seconds.
- `engine`: `.tempogram` or `.peaks`, the engine that read it.

It throws an `AnalysisError`, and nothing else: `.invalidSamples` when there are no samples or one is NaN or
infinite, `.outOfRange` when the sample rate, the tempo range or a lowpass setting is out of its range. Each carries
a message for people; the case is what to match on.

## Limits

- Offline only: it reads samples you already have, one channel at a time. There is no live or microphone input:
  that is the JS library's, in the browser.
- No decoding: it takes PCM, never a file.
- `peaks` keeps a filtered copy of the samples, 4 bytes per sample, for the length of the call.

<!-- swift-mirror: omit start -->

## Tests

```bash
swift test -c release -Xswiftc -enable-testing
```

`ConformanceTests` runs every case of `../../conformance/vectors.json` and prints the largest deviation from the JS
readings; `CONFORMANCE_DIR` points it elsewhere. `JsSourceTests` reads the defaults and the calibration tables back
from the JS sources, hence `-enable-testing`. XCTest comes with Xcode and with the Swift toolchains for Linux.

<!-- swift-mirror: omit end -->

## License

Apache-2.0, like the library.
