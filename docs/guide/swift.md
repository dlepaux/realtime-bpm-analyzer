---
title: BPM Detection in Swift
description: Detect the BPM of decoded audio in Swift on iOS, macOS and Linux with realtime-bpm-analyzer, the same readings as the JS library, held to them by shared conformance vectors.
---

# BPM Detection in Swift

`RealtimeBpmAnalyzer` for Swift is the library's offline analysis,
[`analyzeChannelData`](./node), ported to pure Swift. You pass the decoded
samples of one channel and get a reading back: the tempo, its confidence and the
other candidate tempos, in the same shape the JS library gives.

Add it with Swift Package Manager, from its release repository
[dlepaux/realtime-bpm-analyzer-swift](https://github.com/dlepaux/realtime-bpm-analyzer-swift),
in your `Package.swift`:

```swift
.package(url: "https://github.com/dlepaux/realtime-bpm-analyzer-swift", from: "6.2.0")
```

Then add `.product(name: "RealtimeBpmAnalyzer", package: "realtime-bpm-analyzer-swift")` to
your target's dependencies. In Xcode, paste the same URL in **File › Add Package
Dependencies…**. The release repository is a copy of `packages/swift`, written by the release
pipeline and tagged with each version, so issues and pull requests go to
[dlepaux/realtime-bpm-analyzer](https://github.com/dlepaux/realtime-bpm-analyzer).

It needs Swift 5.9 or later (Xcode 15 or later) and runs on iOS 13 and
macOS 10.15 or later, and on Linux. It has no dependency and imports Foundation
only.

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

Decoding is your job: on Apple platforms `AVAudioFile` gives the 32-bit float
samples the analysis takes, and any decoder that gives samples from -1 to 1
works. A whole song takes a while, so run it off the main thread.

## Same readings as the JS library

The repository holds conformance vectors: the JS library's readings with both
engines, several tempo ranges and lowpass settings, and sample rates from 2 Hz to
96 kHz, plus the calls that must fail. The Swift tests compare every reading
with them on every change, the confidence included, and CI runs them on the
oldest and newest Swift the package supports.

## Options

The options and defaults are the JS library's:

```swift
let options = AnalysisOptions(
    engine: .peaks(lowpass: Lowpass(frequency: 200, q: 1)),
    tempoRange: TempoRange(min: 90, max: 180)
)
let reading = try analyzeChannelData(samples, sampleRate: 44_100, options: options)
```

- `engine`: `.tempogram` (the default) or `.peaks`, which takes the lowpass. A
  `.peaks` reading of a quiet or bass-light input, found only relative to its
  own level, has `confidence` `nil`: such input may hold no beat at all.
- `tempoRange`: 90 to 180 BPM by default. With any other range,
  `confidence` is `nil`, since it was calibrated on the default range only.

The reading is an immutable value: `bpm`, `bpmExact`, `confidence`,
`candidates`, `audio` and `engine`. Errors are an `AnalysisError`:
`.invalidSamples` or `.outOfRange`. The package's readme lists the whole API.

## Limits

It reads samples you already have, one channel at a time. There is no live or
microphone input: that is the JS library's, in the browser.
