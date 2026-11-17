# Realtime BPM Analyzer for C#

A C# port of the library's offline analysis, `analyzeChannelData`, with both engines: the tempogram and peaks. It
gives the same readings as the JS library, proven by the shared conformance vectors
([`conformance/`](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/conformance#readme)) on every build.
It is pure managed code with no runtime dependencies, and it targets .NET Standard 2.0, so it fits Unity, Godot C#
and any .NET app.

## Install

The package is [`RealtimeBpmAnalyzer`](https://www.nuget.org/packages/RealtimeBpmAnalyzer) on NuGet:

```bash
dotnet add package RealtimeBpmAnalyzer
```

A Godot 4 C# project takes it the same way. Unity has no NuGet client of its own: download the `.nupkg` from
nuget.org (it is a zip), and copy `lib/netstandard2.0/RealtimeBpmAnalyzer.dll` into the project's `Assets` folder as
a plugin. The package has no dependencies, so that one file is all of it.

To build it from source instead, use the .NET SDK that `global.json` pins: `dotnet pack -c Release
src/RealtimeBpmAnalyzer` makes the package, and `dotnet build -c Release src/RealtimeBpmAnalyzer` the DLL.

## Versions

The version is the JS library's major and minor whose conformance vectors the port passes, plus its own patch:
6.2.x reads the same as `realtime-bpm-analyzer` 6.2 on npm. A patch of the port can ship without a JS release.

## Example

```csharp
using System;
using RealtimeBpmAnalyzer;

float[] samples = DecodeMono(file); // your decoder: one channel, -1 to 1
Reading? reading = BpmAnalyzer.AnalyzeChannelData(samples, 44100);
if (reading != null)
{
    Console.WriteLine($"{reading.Bpm} BPM, candidates {string.Join(", ", reading.Candidates)}");
}
```

## Limits

- **Offline only.** It analyses a whole buffer at once, like the JS `analyzeChannelData`. The real-time analyzer,
  which reads a live stream and locks onto a tempo, is not ported.
- **No decoding.** You supply the PCM: one channel of floats from -1 to 1, and its sample rate. Mix stereo down
  first, and divide 16-bit samples by 32768. In Unity, `AudioClip.GetData` gives interleaved floats and
  `AudioClip.frequency` the rate.
- **It takes a while on a long file.** It holds no state and starts no thread, so call it from any thread, but keep
  it off the game's or the app's main thread, with `Task.Run` for example.

## API

Everything is in the namespace `RealtimeBpmAnalyzer`, and every value is immutable.

### `BpmAnalyzer.AnalyzeChannelData(float[] samples, double sampleRate, AnalysisOptions? options = null)`

Returns a `Reading`, or `null` when no tempo was found (silence, or audio under 1.5 s for the tempogram). It never
writes to `samples`. A `null` `options` is `AnalysisOptions.Default`.

### `AnalysisOptions`

The same options as the JS `analyzeChannelData`, with the same defaults:

```csharp
var options = new AnalysisOptions(
    engine: Engine.PeaksWith(new Lowpass(frequency: 150)),
    tempoRange: new TempoRange(80, 170));
```

`WithEngine` and `WithTempoRange` return a copy with one option changed.

| JS option | C# | Default |
| --- | --- | --- |
| `engine: 'tempogram'` | `Engine.Tempogram` | the default engine |
| `engine: 'peaks'` | `Engine.Peaks` | lowpass 200 Hz, q 1 |
| `engine: {name: 'peaks', lowpass: {frequency, q}}` | `Engine.PeaksWith(new Lowpass(frequency, q))` | `Lowpass.Default` |
| `tempoRange: {min, max}` | `new TempoRange(min, max)` | `TempoRange.Default`, 90 to 180 BPM |

### `Reading`

| Property | JS field | Meaning |
| --- | --- | --- |
| `int Bpm` | `bpm` | The tempo, a whole BPM inside the tempo range |
| `double BpmExact` | `bpmExact` | The same tempo, unrounded |
| `double? Confidence` | `confidence` | The chance the reading is right, 0 to 1. `null` when the range is not the default 90 to 180, or the tempo is outside it: unmeasured, never a small number |
| `IReadOnlyList<Candidate> Candidates` | `candidates` | Up to 5 tempos, best first, each with its `Bpm` and `Relation` to the top one: `Top`, `Half`, `Double` or `Other` |
| `double AudioFrom`, `double AudioTo` | `audio.from`, `audio.to` | The span analysed, in seconds: 0 to the buffer's length |
| `EngineName Engine` | `engine` | `Tempogram` or `Peaks` |

### Errors

| JS | C# | When |
| --- | --- | --- |
| `Error` | `ArgumentException`, exactly that type | `samples` is empty, or holds a NaN or infinite sample |
| `RangeError` | `ArgumentOutOfRangeException` | The sample rate is not finite, under 100 Hz for the tempogram, or under 2 Hz or not above twice the lowpass cutoff for peaks; or `TempoRange` and `Lowpass` get a value out of range, such as a `max` above `int.MaxValue` or a `max / min` past the largest double |
| `TypeError` | none | C#'s types rule these out |

A `null` argument throws `ArgumentNullException`. `TempoRange` and `Lowpass` check their values when they are made,
where the JS library checks them when it analyses.

## Differences from the JS library

The readings match the JS library's within the conformance vectors' tolerances. .NET's `Math.Cos`, `Math.Log` and
the rest come from the platform's C runtime, and those can differ from V8 in the last bit, as two JS runtimes can,
so on an input whose tempo sits right at a rounding or tie boundary, an exact field such as `Bpm` or the candidates'
order can still differ. The vectors leave out such fragile inputs on purpose. Beyond that:

- .NET Standard 2.0 has no `Math.Log2`, so the tempogram's FFT size can round the other way at a contrived sample
  rate such as 122.97509238026912 Hz, where 0.023 times the rate lies within a bit of 2^(n + 0.5). No whole rate
  from 100 Hz to 2 MHz does.
- CI runs the vectors on .NET 10 on Linux x64. Unity's Mono and IL2CPP, Godot and .NET Framework run the same code
  but aren't run against the vectors, and a 32-bit .NET Framework JIT may keep `float` intermediates at a higher
  precision, which can move a reading near a boundary.

## How it stays the same as JS

`ConformanceTests` runs every case of `conformance/vectors.json`, the readings the JS library gives on the shared
inputs, and fails on any difference beyond the file's tolerances, on any key it doesn't map, and on any error case
that throws another exception type. It prints the largest difference from the reference per field. The math keeps
the JS order of operations, JS's `Math.round` (half up, where `Math.Round` rounds half to even) is `JsMath.Round`,
ties keep the JS insertion order through stable sorts and an insertion-ordered map, and the buffers the JS library
keeps in 32-bit floats are `float[]` here. `JsSourceTests` reads the calibration tables and the defaults back from
the JS sources.

```bash
dotnet test tests/RealtimeBpmAnalyzer.Tests
```

CI runs it as `Conformance (.NET)` in `.github/workflows/main.yml`.

## Build choices

- **The .NET SDK** with SDK-style projects, the version pinned in `global.json`, and the NuGet packages pinned by
  `packages.lock.json`, which CI restores in locked mode.
- **.NET Standard 2.0**, the one target that Unity's .NET Standard API level, Godot 4, .NET Framework 4.6.1 and
  later, and every .NET from Core 2.0 all read. The library uses only the BCL and no unsafe code, so the package has no
  dependencies. `ReadOnlySpan<float>` would need the `System.Memory` package on .NET Standard 2.0, so the entry point
  takes a `float[]`.
- **The tests on .NET 10**, the current LTS: .NET 8 left support on 2026-11-10. xUnit, the only package, is in
  test scope.
- Nullable reference types are on, warnings are errors, and the build is deterministic.

## License

Apache-2.0, as the rest of the repository.
