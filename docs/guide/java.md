---
title: BPM Detection in Java, Kotlin and Android
description: Detect the BPM of PCM samples in Java, Kotlin, Android or a Minecraft mod with the pure-Java port of analyzeChannelData, with no dependencies.
---

# BPM Detection in Java, Kotlin and Android

The Java port runs the library's offline analysis, [`analyzeChannelData`](./node), on the
JVM, with both engines: the tempogram and peaks. It gives the same readings as the JS
library, proven by the shared conformance vectors on every build. It has no runtime
dependencies, and its jar runs on Java 8 and later: Minecraft mods (Fabric and Forge),
Android and Kotlin.

It is on Maven Central as `io.github.dlepaux:realtime-bpm-analyzer`. With Gradle:

<!-- x-release-please-start-version -->

```kotlin
implementation("io.github.dlepaux:realtime-bpm-analyzer:6.2.1")
```

<!-- x-release-please-end -->

Or with Maven:

<!-- x-release-please-start-version -->

```xml
<dependency>
  <groupId>io.github.dlepaux</groupId>
  <artifactId>realtime-bpm-analyzer</artifactId>
  <version>6.2.1</version>
</dependency>
```

<!-- x-release-please-end -->

```java
import io.github.dlepaux.realtimebpmanalyzer.BpmAnalyzer;
import io.github.dlepaux.realtimebpmanalyzer.Reading;

float[] samples = decodeMono(file); // your decoder: one channel, -1 to 1
Reading reading = BpmAnalyzer.analyzeChannelData(samples, 44100);
if (reading != null) {
    System.out.println(reading.bpm() + " BPM");
}
```

The reading is `null` when no tempo was found. Otherwise it has the same fields as the JS
reading: `bpm()`, `bpmExact()`, `confidence()` (`null` off the default 90 to 180 BPM
range, and for a peaks reading of a quiet or bass-light input found only relative to its own
level), `candidates()`, `audioFrom()`, `audioTo()` and `engine()`.

## From Kotlin

The same jar, called from Kotlin or an Android app. Kotlin doesn't widen an `Int` to a
`Double`, so the sample rate is written `44100.0`:

```kotlin
import io.github.dlepaux.realtimebpmanalyzer.BpmAnalyzer

val samples: FloatArray = decodeMono(file) // your decoder: one channel, -1 to 1
val reading = BpmAnalyzer.analyzeChannelData(samples, 44100.0)
if (reading != null) {
    println("${reading.bpm()} BPM")
}
```

## What it doesn't do

- **No decoding.** You supply the samples: one channel of floats from -1 to 1, and their
  sample rate. Mix stereo down first, and divide 16-bit samples by 32768.
- **Offline only.** It analyses a whole buffer. The real-time analyzer isn't ported.
- **It takes a while on a long file.** Call it off a game's or an app's main thread.

## Options

The options and their defaults are the JS ones, in Java casing:

```java
AnalysisOptions options = AnalysisOptions.DEFAULT
    .withEngine(Engine.peaks(Lowpass.DEFAULT.withFrequency(150)))
    .withTempoRange(TempoRange.of(80, 170));
Reading reading = BpmAnalyzer.analyzeChannelData(samples, 44100, options);
```

A JS `RangeError` is an `OutOfRangeException` here, a subclass of
`IllegalArgumentException`, and empty samples throw `IllegalArgumentException`. Invalid
`TempoRange` and `Lowpass` values throw when they are made.
