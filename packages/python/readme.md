# realtime-bpm-analyzer for Python

The offline BPM analysis of [realtime-bpm-analyzer](https://www.realtime-bpm-analyzer.com), ported to Python. You
pass the decoded samples of one channel and get a reading back: the tempo, its confidence, and the other candidate
tempos.

It gives the same readings as the JS library's `analyzeChannelData`. The repository's
[conformance vectors](https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/conformance) hold the JS library's
readings of 140 cases, plus 8 that must fail, and the port's tests compare every one of them.

## Install

```bash
pip install realtime-bpm-analyzer
```

It needs Python 3.11 or later and NumPy 1.26 or later, and has no native code of its own.

## Versions

The version is the JS library's major and minor whose conformance vectors the port passes, plus its own patch:
6.2.x reads the same as `realtime-bpm-analyzer` 6.2 on npm. A patch of the port can ship without a JS release.

## Example

Decoding a file is your job. This example uses [soundfile](https://pypi.org/project/soundfile/), but any decoder
that gives you samples from -1 to 1 works.

```python
import soundfile
from realtime_bpm_analyzer import analyze_channel_data

samples, sample_rate = soundfile.read("song.wav", dtype="float32", always_2d=True)
reading = analyze_channel_data(samples[:, 0], sample_rate)

if reading is None:
    print("No tempo found")
else:
    print(f"{reading.bpm} BPM, confidence {reading.confidence}")
    print("Candidates:", [candidate.bpm for candidate in reading.candidates])
```

## API

```python
def analyze_channel_data(
    samples: Samples,
    sample_rate: float,
    *,
    engine: Literal["tempogram", "peaks"] = "tempogram",
    tempo_range: TempoRange | None = None,
    lowpass: Lowpass | None = None,
) -> Reading | None
```

- `samples`: one channel of numbers from -1 to 1, as a list, a float `array.array` or a 1-D float NumPy array.
  They are analysed as 32-bit floats, as the JS library holds them, so a float64 array reads like its float32 copy.
  Integers are refused, whatever holds them: scale integer PCM first, for 16-bit samples `pcm / 32768`.
- `sample_rate`: their rate in Hz. The tempogram needs at least 100 Hz, and `peaks` at least 2 Hz.
- `engine`: `"tempogram"`, the default, reads the full band. `"peaks"` counts the intervals between bass peaks.
- `tempo_range`: `TempoRange(min=90, max=180)` by default. A reading is folded into this range by octaves, so `max`
  must be at least twice `min`.
- `lowpass`: the peaks engine's filter, `Lowpass(frequency=200, q=1)` by default, with Q in dB. Only `peaks` takes
  one.

It returns `None` when it finds no tempo: silence, noise, or under 1.5 seconds of audio for the tempogram. Otherwise
it returns a frozen `Reading`:

| Field | Type | |
|-------|------|-|
| `bpm` | `int` | The tempo, rounded |
| `bpm_exact` | `float` | The tempo before rounding |
| `confidence` | `float \| None` | From 0 to 1, calibrated on the default 90 to 180 BPM range. `None` with any other range |
| `candidates` | `tuple[Candidate, ...]` | Up to 5 tempos, best first. Each has a `bpm` and a `relation` to the top one: `"top"`, `"half"`, `"double"` or `"other"` |
| `audio` | `AudioSpan` | The span read, in seconds: `start` and `end` |
| `engine` | `str` | The engine that read it |

The options and defaults are the JS library's, in snake case. Two names differ from the JS reading: the JS
`audio.from` and `audio.to` are `audio.start` and `audio.end` here, since `from` is a Python keyword, and the JS
`audio.contextTime` is left out, since it is always `null` in an offline reading.

### Errors

| Exception | When |
|-----------|------|
| `InvalidSamplesError` (a `ValueError`) | The samples are empty, not one channel, or hold a NaN or infinite sample (a float64 past float32's range included, which becomes infinite) |
| `OutOfRangeError` (a `ValueError`) | A value is out of range: the sample rate, the engine, the tempo range (its `max` must be at least twice its `min` and at most 2^31 - 1, and `max / min` must be finite), or the lowpass settings |
| `TypeError` | An argument has the wrong type, or the samples are integers |

## Limits

- Offline only: it reads samples you already have. There is no live or microphone input, which the JS library does
  in the browser.
- It reads one channel. To read a stereo file, pass one channel, or your own mix of both.
- It doesn't decode audio files.

## License

Apache-2.0, like the JS library.
