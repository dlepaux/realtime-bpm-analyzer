---
title: BPM Detection in Python
description: Detect the BPM of decoded audio in Python with realtime-bpm-analyzer, the same readings as the JS library, held to them by shared conformance vectors.
---

# BPM Detection in Python

`realtime-bpm-analyzer` for Python is the library's offline analysis,
[`analyzeChannelData`](./node), ported to Python. You pass the decoded samples
of one channel and get a reading back: the tempo, its confidence and the other
candidate tempos, in the same shape the JS library gives. It is on PyPI:

```bash
pip install realtime-bpm-analyzer
```

It needs Python 3.11 or later and NumPy, and has no native code of its own.

```python
import soundfile
from realtime_bpm_analyzer import analyze_channel_data

samples, sample_rate = soundfile.read("song.wav", dtype="float32", always_2d=True)
reading = analyze_channel_data(samples[:, 0], sample_rate)

if reading is not None:
    print(f"{reading.bpm} BPM, confidence {reading.confidence}")
```

Decoding is your job: this example uses
[soundfile](https://pypi.org/project/soundfile/), and any decoder that gives
samples from -1 to 1 works.

## Same readings as the JS library

The repository holds conformance vectors: the JS library's readings of 140
cases, with both engines, several tempo ranges and lowpass settings, and sample
rates from 8 to 96 kHz, plus 8 calls that must fail. The Python tests compare
every reading with them on every change, the confidence included, and CI runs
them on the oldest and newest Python the package supports.

## Options

The options and defaults are the JS library's, in snake case:

```python
from realtime_bpm_analyzer import Lowpass, TempoRange, analyze_channel_data

reading = analyze_channel_data(
    samples,
    44100,
    engine="peaks",
    tempo_range=TempoRange(min=90, max=180),
    lowpass=Lowpass(frequency=200, q=1),
)
```

- `engine`: `"tempogram"` (the default) or `"peaks"`. A `peaks` reading of a
  quiet or bass-light input, found only relative to its own level, has
  `confidence` `None`: such input may hold no beat at all.
- `tempo_range`: 90 to 180 BPM by default. With any other range,
  `confidence` is `None`, since it was calibrated on the default range only.
- `lowpass`: the `peaks` engine's filter only.

The reading is a frozen dataclass: `bpm`, `bpm_exact`, `confidence`,
`candidates`, `audio` and `engine`. The JS `audio.from` and `audio.to` are
`audio.start` and `audio.end`, since `from` is a Python keyword. Errors raise
`InvalidSamplesError` or `OutOfRangeError`, both `ValueError`s, or `TypeError`.
The package's readme lists the whole API.

## Limits

It reads samples you already have, one channel at a time. There is no live or
microphone input: that is the JS library's, in the browser.
