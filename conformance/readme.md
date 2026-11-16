# Conformance vectors

The readings of the JS library, exported so that an implementation in another language can prove it reads the
same. A port passes when it returns, for every case here, the same reading the JS library returns, within the
tolerances below. That includes `confidence`, so a port's confidence keeps the calibrated meaning the library
documents, `null` included.

This folder is the contract. You can write a port's test harness from this page alone, without reading any
JavaScript.

## Layout

```
conformance/
  vectors.json        the cases, their options and the expected readings
  inputs/*.s16le.gz   the input signals, 16-bit PCM, gzipped
  generator/          JS only: signals.mjs builds the signals, generate.mjs writes the set
  runner/             JS only: the runner for each JS runtime (core.mjs holds the comparison rules)
  tests/              JS only: tests of the rules and of the committed set
```

The folder sits at the repo root, outside the npm workspaces (`packages/*`, `docs`, `examples/*`). A port in
`packages/<port>/` reads it at `../../conformance/`. It reads the files in place, or copies them in at build time,
and never edits them.

## Inputs

Each input is a synthetic signal: drum-like patterns and clicks at known tempos, swing, tempos near and outside 90
to 180 BPM, a quiet mix, a noisy mix, silence, noise, very short input, and sample rates from 8 to 96 kHz. They
contain no recorded music.

An input file is mono PCM, signed 16-bit little-endian, gzipped. To get the samples the library analysed:

1. gunzip the file;
2. read each pair of bytes as a signed 16-bit little-endian integer;
3. divide each integer by 32768 and store it as a 32-bit float.

Each value is then in [-1, 1), and the division is exact in a 32-bit float. So every port holds exactly the samples
the JS reference analysed. `vectors.json` gives each input's sample count and the SHA-256 of its decompressed bytes,
so a harness can check its decoding.

```python
import gzip, array, sys
pcm = array.array('h', gzip.open(path).read())
if sys.byteorder == 'big':
    pcm.byteswap()
samples = [value / 32768 for value in pcm]  # or numpy.asarray(pcm, dtype=numpy.float32) / numpy.float32(32768)
```

```java
byte[] bytes = new GZIPInputStream(Files.newInputStream(path)).readAllBytes();
ShortBuffer pcm = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer();
float[] samples = new float[pcm.remaining()];
for (int i = 0; i < samples.length; i++) samples[i] = pcm.get(i) / 32768f;
```

**Why committed files rather than a generator in each language.** The inputs are produced once, by
`generator/signals.mjs`, and committed. A port reads them with its standard library's gzip, in a few lines, and
holds bit-identical samples. The other option was a generator that each port reimplements from a specified PRNG.
That costs 0 bytes, but every port, C# and Swift later included, would then carry a second piece of code that has
to match JS bit for bit. A wrong sample there would show up as a failed reading, a long way from its cause. The
price of committed files is their size. The inputs total about 4.1 MB, under a budget of 5 MB that
`tests/vectors.test.mjs` enforces. Lengths are kept to what a reading needs, 0.3 to 12 s.

## vectors.json, schema version 1

| Key | What |
|---|---|
| `schemaVersion` | `1`. A harness refuses any other value. It changes only when a field is renamed or removed, or changes meaning. New cases or inputs don't change it. |
| `pcm` | The input encoding described above: `{"encoding": "signed 16-bit little-endian", "channels": 1, "compression": "gzip", "divisor": 32768}`. |
| `tolerances` | `bpmExact` and `confidence`, each `{"absolute": <number>, "referenceSpread": <number>}`. See Tolerances. |
| `inputs` | One entry per input: `id`, `file` (relative to this folder), `sampleRate` (Hz), `samples` (count), `sha256` (of the decompressed bytes), `description`. |
| `cases` | One entry per analysis: `id`, `input` (an input's `id`), `sampleRate`, `options`, `expected`. |
| `errorCases` | One entry per call that must fail: `id`, `input`, `sampleRate`, `options`, `expectedError`, `why`. |

`vectors.json` holds one case per line, so a regeneration's diff shows which cases moved.

### options

`options` holds the options the JS reference was called with. A missing key means the library's default.

| Key | Meaning |
|---|---|
| `engine` | `"tempogram"` (the default) or `"peaks"`, or `{"name": "peaks", "lowpass": {"frequency": <Hz>, "q": <dB>}}`, which sets the peaks engine's lowpass (defaults `frequency` 200, `q` 1). |
| `tempoRange` | `{"min": <bpm>, "max": <bpm>}`, the range the tempo is reported in. Default 90 to 180. An explicit `{"min": 90, "max": 180}` is the default range: its confidences are numbers. |

Each input runs under the same seven option sets, named after the `/` in the case's `id`:

- `default` and `tempogram-90-180` (the default engine, on the default range left implicit and then given
  explicitly);
- `range-60-140` (the default engine on a custom range);
- `peaks`, `peaks-90-180` and `peaks-60-140` (the same three for peaks);
- `peaks-lowpass-150-q3` (peaks with its own lowpass settings).

### expected

`expected` is `null` when the library found no tempo. Otherwise it is the reading:

| Field | Type | Meaning |
|---|---|---|
| `bpm` | integer | The tempo, inside the tempo range. Equal to `candidates[0].bpm`. |
| `bpmExact` | float | The same tempo, unrounded. |
| `confidence` | float or `null` | The chance, 0 to 1, that `bpm` is right. `null` means unmeasured: the reading's `bpm` is outside 90 to 180, or the analysis ran on any range other than 90 to 180. |
| `candidates` | array, 1 to 5 entries | `{"bpm": integer, "relation": "top" \| "half" \| "double" \| "other"}`, in the engine's rank order. `candidates[0]` has relation `top`. |
| `audio` | object | `{"from": 0, "to": <samples / sampleRate>, "contextTime": null}`: the span analysed, in seconds. |
| `engine` | string | `"tempogram"` or `"peaks"`, the engine that ran. |

### errorCases

These calls must fail. `expectedError` is the JS error's name, which gives the category: `Error` for unusable input
samples (none at all), and `RangeError` for a value outside its valid range (the sample rate, the tempo range or a
lowpass setting). A port raises its language's idiomatic exception, such as Java's `IllegalArgumentException` or
Python's `ValueError`, and the harness checks that the call failed. Messages are not part of the contract. Only value
errors are listed. Type errors, such as an unknown option key, belong to JS's untyped options and have no equivalent
in a typed API.

## Tolerances

Every field is compared exactly, except `bpmExact` and a numeric `confidence`:

| Field | Rule | Why |
|---|---|---|
| `bpm`, `candidates[].bpm` | exact | Whole numbers: a vote count's winner, or a rounded tempo. Rounding differences can change them only at a tie or a rounding boundary, and the generator refuses any case that sits near one (below). So a mismatch is a bug. |
| `candidates` length, order, `relation` | exact | The same reasoning: a rank order and a label. |
| `confidence` null or number | exact | `null` means unmeasured. It is never a number near 0, and never equal to one. |
| `confidence` value | ±1e-6 absolute | It is a calibration table read at the engine's raw score, so it carries that score's float error, multiplied by the table's slope. |
| `bpmExact` | ±1e-6 BPM absolute | It is an interpolated peak or a weighted mean of float tempos, so a different order of float operations, or a different `exp` or `log`, moves its last digits. |
| `audio.from`, `audio.contextTime` | exact | Always `0` and `null`. |
| `audio.to` | exact | One IEEE 754 double division, `samples / sampleRate`, which is correctly rounded in every language. |
| `engine` | exact | A name. |
| a `null` reading | exact | No tempo found is a different answer from any reading. |

**How the generator checks the cases are robust.** It runs every case three more times, each time with every
input sample moved by about one 32-bit float step (multiplied by 1 ± 2^-22, either way at random, rounded to
float32). That is the scale at which a port's arithmetic and a runtime's `Math` functions differ from the reference.
If any exact field changes under that perturbation, the generator refuses to write the set, because a correct port
could then fail on rounding alone. The largest change it sees in the two float fields is recorded as
`referenceSpread`. When this was written, that spread was 5.5e-8 BPM for `bpmExact` and 1.4e-8 for `confidence`. The
generator also refuses to write a set whose spread comes within 10 times of its tolerance, so a correct port has at
least that much margin.

**What the tolerance catches.** This was measured on 2026-11-16 by running the vectors against altered copies of
the built library:

- A port that stores the tempogram's onset ring, or the peaks lowpass output, as 64-bit floats, where the reference
  rounds them to 32 bits, passes. It deviates by at most 1.7e-8 BPM, so the 32-bit storage is not something a port
  must copy.
- A symmetric Hann window (dividing by `N - 1`) in place of the reference's periodic one (dividing by `N`) fails 44
  cases, with `bpmExact` off by up to 2.5e-3 BPM and `confidence` off by up to 6.7e-5. Both are well over the
  tolerance.

## Writing a port's harness

1. Parse `vectors.json`, and fail if `schemaVersion` is not `1`.
2. Decode each input (see Inputs). Optionally, check its sample count and SHA-256.
3. For each case, call your analysis with the input's samples, the case's `sampleRate` and its `options`, mapped
   to your API. Compare the result with `expected` under the rules above. Report each failing case by its `id`,
   with the field that differs.
4. For each error case, check that the call fails.
5. Pass only when every case and every error case passes. Skipping a case is a failure: the set is the contract.

A few behaviours of the reference that a port must reproduce, and that each language's defaults get wrong in
different ways:

- **Rounding.** JS `Math.round` rounds half up, towards +infinity, so `-2.5` gives `-2` and `2.5` gives `3`.
  Java's `Math.round` does the same. Python's `round` and NumPy's `round` round half to even.
- **Sorting.** JS `Array.prototype.sort` is stable: equal keys keep their earlier order. Python's `sorted` and
  Java's `List.sort` are stable too. A hand-written sort, or one on primitive arrays, may not be.
- **Arithmetic.** All of it is IEEE 754 double, except the input samples, which are 32-bit floats. The lowpass
  output and the tempogram's onset ring are also stored as 32-bit floats, but, as measured above, a port may keep
  them as doubles.

## Regenerating

```sh
npm run build -w realtime-bpm-analyzer   # the generator runs the built realtime-bpm-analyzer/node entry
npm run conformance:generate             # rewrites vectors.json, and any input whose samples changed
```

Commit the result. CI's `Conformance` job runs `npm run conformance:check`, which fails when the committed set
differs from a fresh generation, so the vectors can't drift from the library. A change to the library that moves a
reading shows up as a diff in `vectors.json`: it is a behaviour change for every port, and belongs in the release
notes. An input file is rewritten only when its decoded samples change, so a different zlib build doesn't churn the
files.

To add a signal, add it to `generator/signals.mjs` and regenerate. Keep the inputs under 5 MB. If the generator
reports a case as fragile, change the signal so that its reading has a margin: longer, louder, or further from a
range edge.

## The JS runtimes

The same vectors run in CI against the built library in each runtime the docs name:

| Runtime | Version | Runner |
|---|---|---|
| Node | 22.12.0, the CLI's floor, and 26.12.1, through `conformance:check` | `node conformance/runner/node.mjs` |
| Deno | 2.9.8 | `deno run --allow-read=. conformance/runner/deno.mjs` |
| Bun | 1.4.4 | `bun conformance/runner/bun.mjs` |
| Hermes | the tag React Native 0.88 ships (`hermes-v260318099.0.5`), built from source and cached | `node conformance/runner/hermes/build.mjs out.js`, then `hermes out.js` |

Each runner prints `conformance: PASS` or `FAIL`, with the largest float difference it saw from the reference.
Hermes's shell has no file system, so its runner bundles the vectors and the PCM into one script. Only the analysis
of samples you already hold is proven this way. Live microphone input in React Native needs a native audio module,
and stays browser-only.
