---
# Unpublished until the C# port is on NuGet (RBA-264): kept out of the local search too.
search: false
title: BPM Detection in C#, Unity and Godot
description: Detect the BPM of PCM samples in C#, Unity, Godot or any .NET app with the C# port of analyzeChannelData, with no dependencies.
---

# BPM Detection in C#, Unity and Godot

The C# port runs the library's offline analysis, [`analyzeChannelData`](./node), on .NET,
with both engines: the tempogram and peaks. It gives the same readings as the JS library,
proven by the shared conformance vectors on every build. It is pure managed code with no
runtime dependencies, and it targets .NET Standard 2.0: Unity, Godot C# and any .NET app.

It will be on NuGet as `RealtimeBpmAnalyzer`. It isn't published yet.

```bash
dotnet add package RealtimeBpmAnalyzer
```

```csharp
using RealtimeBpmAnalyzer;

float[] samples = DecodeMono(file); // your decoder: one channel, -1 to 1
Reading? reading = BpmAnalyzer.AnalyzeChannelData(samples, 44100);
if (reading != null)
{
    Console.WriteLine($"{reading.Bpm} BPM");
}
```

The reading is `null` when no tempo was found. Otherwise it has the same fields as the JS
reading: `Bpm`, `BpmExact`, `Confidence` (`null` off the default 90 to 180 BPM range),
`Candidates`, `AudioFrom`, `AudioTo` and `Engine`.

## What it doesn't do

- **No decoding.** You supply the samples: one channel of floats from -1 to 1, and their
  sample rate. Mix stereo down first, and divide 16-bit samples by 32768. In Unity,
  `AudioClip.GetData` gives the floats and `AudioClip.frequency` the rate.
- **Offline only.** It analyses a whole buffer. The real-time analyzer isn't ported.
- **It takes a while on a long file.** Call it off a game's or an app's main thread.

## Options

The options and their defaults are the JS ones, in C# casing:

```csharp
var options = new AnalysisOptions(
    engine: Engine.PeaksWith(new Lowpass(frequency: 150)),
    tempoRange: new TempoRange(80, 170));
Reading? reading = BpmAnalyzer.AnalyzeChannelData(samples, 44100, options);
```

A JS `RangeError` is an `ArgumentOutOfRangeException` here, and empty samples or a NaN
sample throw `ArgumentException`. Invalid `TempoRange` and `Lowpass` values throw when they
are made.
