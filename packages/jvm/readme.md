# Realtime BPM Analyzer for Java

A pure-Java port of the library's offline analysis, `analyzeChannelData`, with both engines: the tempogram and
peaks. It gives the same readings as the JS library, proven by the shared conformance vectors
([`conformance/`](../../conformance/readme.md)) on every build. It has no runtime dependencies and runs on Java 8
and later, so it fits Minecraft mods (Fabric and Forge), Android and Kotlin.

## Install

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

The jar runs on Java 8 and later. Building it from this folder (`./mvnw install`) needs JDK 11 or later.

## Versions

The version is the JS library's major and minor whose conformance vectors the port passes, plus its own patch:
6.2.x reads the same as `realtime-bpm-analyzer` 6.2 on npm. A patch of the port can ship without a JS release.

## Example

```java
import io.github.dlepaux.realtimebpmanalyzer.BpmAnalyzer;
import io.github.dlepaux.realtimebpmanalyzer.Reading;

float[] samples = decodeMono(file); // your decoder: one channel, -1 to 1
Reading reading = BpmAnalyzer.analyzeChannelData(samples, 44100);
if (reading != null) {
    System.out.println(reading.bpm() + " BPM, candidates " + reading.candidates());
}
```

## Limits

- **Offline only.** It analyses a whole buffer at once, like the JS `analyzeChannelData`. The real-time analyzer,
  which reads a live stream and locks onto a tempo, is not ported.
- **No decoding.** You supply the PCM: one channel of floats from -1 to 1, and its sample rate. Mix stereo down
  first, and divide 16-bit samples by 32768. On Android, `MediaExtractor` and `MediaCodec` decode; on the desktop,
  `javax.sound.sampled` reads WAV; on Minecraft, LWJGL's STBVorbis, which the game ships, reads OGG.
- **It takes a while on a long file.** It holds no state and starts no thread, so call it from any thread, but keep
  it off a game's or an app's main thread.

## API

Everything is in the package `io.github.dlepaux.realtimebpmanalyzer`, and every value is immutable.

### `BpmAnalyzer.analyzeChannelData(float[] samples, double sampleRate[, AnalysisOptions options])`

Returns a `Reading`, or `null` when no tempo was found (silence, or audio under 1.5 s for the tempogram). It never
writes to `samples`.

### `AnalysisOptions`

The same options as the JS `analyzeChannelData`, with the same defaults. Start from `AnalysisOptions.DEFAULT`:

```java
AnalysisOptions options = AnalysisOptions.DEFAULT
    .withEngine(Engine.peaks(Lowpass.DEFAULT.withFrequency(150)))
    .withTempoRange(TempoRange.of(80, 170));
```

| JS option | Java | Default |
| --- | --- | --- |
| `engine: 'tempogram'` | `Engine.TEMPOGRAM` | the default engine |
| `engine: 'peaks'` | `Engine.PEAKS` | lowpass 200 Hz, q 1 |
| `engine: {name: 'peaks', lowpass: {frequency, q}}` | `Engine.peaks(Lowpass.of(frequency, q))` | `Lowpass.DEFAULT` |
| `tempoRange: {min, max}` | `TempoRange.of(min, max)` | `TempoRange.DEFAULT`, 90 to 180 BPM |

### `Reading`

| Method | JS field | Meaning |
| --- | --- | --- |
| `int bpm()` | `bpm` | The tempo, a whole BPM inside the tempo range |
| `double bpmExact()` | `bpmExact` | The same tempo, unrounded |
| `Double confidence()` | `confidence` | The chance the reading is right, 0 to 1. `null` when the range is not the default 90 to 180, or the tempo is outside it, or the peaks engine found the beats only relative to a quiet or bass-light input's own level, which input may hold no beat at all: unmeasured, never a small number |
| `List<Candidate> candidates()` | `candidates` | Up to 5 tempos, best first, each with its `bpm()` and `relation()` to the top one: `TOP`, `HALF`, `DOUBLE` or `OTHER` |
| `double audioFrom()`, `double audioTo()` | `audio.from`, `audio.to` | The span analysed, in seconds: 0 to the buffer's length |
| `EngineName engine()` | `engine` | `TEMPOGRAM` or `PEAKS` |

### Errors

| JS | Java | When |
| --- | --- | --- |
| `Error` | `IllegalArgumentException` | `samples` is empty, or holds a NaN or infinite sample |
| `RangeError` | `OutOfRangeException`, a subclass of `IllegalArgumentException` | The sample rate is not finite, under 100 Hz for the tempogram, or under 2 Hz or not above twice the lowpass cutoff for peaks; or `TempoRange.of` and `Lowpass.of` get a value out of range, such as a `max` above `Integer.MAX_VALUE` or a `max / min` past the largest double |
| `TypeError` | none | Java's types rule these out |

A `null` argument throws `NullPointerException`. `TempoRange.of` and `Lowpass.of` check their values when they are
made, where the JS library checks them when it analyses.

## Differences from the JS library

The readings match the JS library's within the conformance vectors' tolerances. Java's `StrictMath` and V8 can
differ in the last bit of a `cos`, `log`, `exp` or `pow`, as two JS runtimes can, so on an input whose tempo sits
right at a rounding or tie boundary, an exact field such as `bpm()` or the candidates' order can still differ. The
vectors leave out such fragile inputs on purpose. Beyond that:

- Java has no `Math.log2`, so the tempogram's FFT size can round the other way at a contrived sample rate such as
  122.97509238026912 Hz, where 0.023 times the rate lies within a bit of 2^(n + 0.5). No whole rate from 100 Hz to
  2 MHz does.

## How it stays the same as JS

`ConformanceTest` runs every case of `conformance/vectors.json`, the readings the JS library gives on the shared
inputs, and fails on any difference beyond the file's tolerances, on any key it doesn't map, and on any error case
that throws another exception. It prints the largest difference from the reference per field. The math keeps the
JS order of operations, `StrictMath` makes `cos`, `sin`, `exp`, `log` and `pow` the same on every JVM, and the
buffers the JS library keeps in 32-bit floats are `float[]` here. `JsSourceTest` reads the calibration tables and the defaults
back from the JS sources.

```bash
./mvnw verify
```

CI runs it on Java 21, then the same classes on Java 8 (`Conformance (JVM)` in `.github/workflows/main.yml`).

## Build choices

- **Maven**, through the Maven Wrapper (script only, Maven's version and checksum pinned in
  `.mvn/wrapper/maven-wrapper.properties`): a declarative build with no build code to run, publishing to Maven
  Central without a plugin from outside Apache or Sonatype, and coordinates Gradle reads the same way.
- **Java 8 bytecode** (`--release 8`): Minecraft runs Java 21, older Forge modpacks still run Java 8, and Android
  reads Java 8 bytecode with any Android Gradle Plugin from 3.0, AGP 8 included. The main code uses only Java APIs
  Android has had since API 21, with no streams, `Optional` or `java.util.function`.
- **JUnit 5**, the only dependency, in test scope. JUnit 6 needs Java 17 to run, which the Java 8 test run rules out.

## License

Apache-2.0, as the rest of the repository.
