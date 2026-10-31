# Tempo benchmark

Measures what a user gets from the real-time analyzer: decoded audio goes through the real streaming path (128-sample render quanta, the 4096-sample aggregator, `RealTimeBpmAnalyzer.analyzeChunk`, left channel, as the worklet does), and every event is timed in audio seconds. Results for both detectors are in [`results/`](results), per track.

Evaluation only: nothing here trains anything, and no audio or label file is committed, only track ids and numeric results.

## Metrics

| metric | definition |
|---|---|
| Acc1 | share of tracks whose last reading is within ±4% of the truth |
| Acc2 | the same, also accepting 2, 3, ½ and ⅓ times the truth (Gouyon et al. 2006) |
| median time to first correct | audio seconds until the first reading within ±4%, over tracks that get one |
| false-stable rate | share of all `bpmStable` readings outside ±4% of the truth |
| false first stable | the same, for the first `bpmStable` of each track |
| stable coverage | share of tracks with at least one `bpmStable` |

False-stable alone rewards never firing, so read it with coverage. Acc1 is scored against the single published tempo: a track labelled 170 read as 85 is an Acc1 miss even when a listener could tap either.

## Datasets

| set | tracks used | labels | licence as found | note |
|---|---|---|---|---|
| GiantSteps Tempo | 661 | Knees et al. 2015, git repo | Repo has no licence file. mirdata lists CC BY-SA 4.0. The v2 crowdsourced labels (Zenodo 3553625) are CC BY 4.0. | Audio is Beatport previews, not redistributed, fetched through the published backup at cp.jku.at, md5 checked. Electronic, 2-minute previews. |
| Ballroom | 698 | Gouyon 2006, Krebs et al. 2013 beat annotations | Neither repo has a licence. mirdata's source file says CC BY-NC-SA 4.0, its table says CC0: unresolved. | Audio from ballroomdancers.com. Sturm's replicas are grouped so they cannot straddle the split. |
| GTZAN | 999 | Marchand et al. tempo annotations | None, and no copyright clearance for the audio. | From the Hugging Face marsyas/gtzan mirror, the UVic host timed out. Sturm 2013 documents its faults. `reggae.00086` has no label, hence 999 of 1000. Drop this set if the licence risk matters: per-set numbers stand without it. |
| GuitarSet | 360 | tempo in the file name, from the recording click | CC BY 4.0 (Zenodo 3371780; mirdata says MIT, the Zenodo record wins). | Solo guitar, the hard case for a pulse detector. |

Audio lives outside git in `RBA_TEMPO_ROOT`, with decoded PCM cached under `pcm/`. [`job/`](job/readme.md) rebuilds it from the public sources, hash-checked, and tunes in one container. BRID was considered, not used.

## Splits

`make-splits.ts` wrote `splits/*.json` with the fixed seed `rba-50-2026-10-30`, and they were committed before any result existed. A first version of the shuffle barely reacted to the seed: it was fixed and the commit amended after a dev run on the old split had started decoding, and was killed, with nothing scored or written. That run decoded tracks that are now held-out, audio only.

Groups stay on one side: ballroom by album and replica, GTZAN by blocks of 10, GuitarSet by progression at one tempo, GiantSteps by track.

Two contaminations remain, found by the reviewer before the held-out look. GTZAN repeats recordings across blocks (Sturm 2013): the 19 held-out members of cross-split pairs are listed in `splits/gtzan-excluded.json` with the undecodable `jazz.00054` and left out of held-out, which is why it scores 480 of 500. GuitarSet's 3 tempos of a progression can straddle the split, so most of its held-out tracks share chords and players with dev at another tempo. Its held-out numbers are a little kinder than the others.

Tuning uses dev only. `run.ts` is the only route to held-out: it needs a `--reason` and a committed tree, refuses `--tuning`, and appends to [`heldout-log.md`](heldout-log.md) before reading a label. `tune.ts` filters to dev before reading any audio and never scores held-out.

## Running

```sh
./benchmark/run.sh run --split dev --detector peaks,tempogram --out /tmp/dev.json
./benchmark/run.sh report /tmp/dev.json --genres
./benchmark/run.sh tune --cache /tmp/curves --build              # once, about 6 minutes
./benchmark/run.sh tune --cache /tmp/curves '{"priorBpm":130}'   # replays, about 6 s each
./benchmark/run.sh perf
```

`run` needs `ffmpeg`. `tune` caches onset strength curves, so replays cover every knob after the onset stage. Its numbers are within one chunk of the real path: only `run` produces reported numbers.

The peaks baseline is measured as it is wired in every guide, with the 200 Hz lowpass in front. The tempogram gets the full band.

## The detector

`src/core/tempogram.ts`, opted into with `detector: 'tempogram'`.

- **Onset strength**: log-compressed spectral flux in 5 bands, minus a local mean, half-wave rectified, summed at 100 Hz (Grosche & Müller 2009 for the compression and bands). A short smoothing stands in for the 7 Hz lowpass of Percival & Tzanetakis 2014.
- **Tempogram**: normalised autocorrelation of the latest 8 s, every 0.5 s, read by a comb over the first 4 beat multiples (a window and hop in the region of Percival & Tzanetakis' 5.9 s and 0.37 s; their stretched-ACF sum is the same idea as the comb), with salience accumulated over a 16 s half-life.
- **Tempo prior**: log-Gaussian as in Ellis 2007, on 50 to 240 BPM, instead of folding into 90 to 180. Ellis uses 120 BPM and 1.4 octaves. Licence-clean dev chose 110 BPM and 0.7 octaves, both at the low edge of the grid swept, so this is a fit to these sets' tempo mix, not a law. A clean pulse and its half tie at centre × √2, so a pulse above about 156 BPM reads at half.
- **Beats penalty**: pulses a third of the way through a beat count against that tempo, at 0.2.
- **Confidence** is the accumulated comb salience, a normalised autocorrelation: how strongly the audio pulses at that tempo.
- **Stable** requires salience of at least 0.15, 80% of the last 8 s of frames agreeing with the reading on their own within 2%, and a lead of 1.25 over the next candidate. It fires once per tempo.

References:

- D. Ellis, "Beat tracking by dynamic programming", Journal of New Music Research 36(1), 2007.
- P. Grosche, M. Müller, "A mid-level representation for capturing dominant tempo and pulse information in music recordings", ISMIR 2009.
- P. Grosche, M. Müller, "Extracting predominant local pulse information from music recordings", IEEE TASLP 19(6), 2011 (read, not used: no PLP here).
- G. Percival, G. Tzanetakis, "Streamlined tempo estimation based on autocorrelation and cross-correlation with pulses", IEEE/ACM TASLP 22(12), 2014.
- F. Gouyon et al., "An experimental comparison of audio tempo induction algorithms", IEEE TASLP 14(5), 2006.

## Choosing the defaults

The rule is `simplestWithinNoise` in [`lib/sweep.ts`](lib/sweep.ts): among rows within one standard error of the best score, the fewest knobs moved from what the sweep started at, then the higher score. A gain inside the noise pays for no knob. `./benchmark/run.sh pick results/rba-51-sweep.jsonl` applies it to the sweep's rows, which are committed. Only the licence-clean dev sets feed it (fsld 791, groove 221, guitarset 180), macro over the sets.

The best score is 81.69, one standard error is 1.58, so the floor is 80.11. Numbers below are from the replay, macro over the three sets.

| tuning | knobs moved | score | Acc1 | Acc2 | gap | false-stable | coverage | verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| #285: 136 BPM, 0.8 oct, no penalties | 0 | 64.13 | 65.9 | 85.8 | 19.9 | 24.6 | 69.9 | where it started, far below the floor |
| **110 BPM, 0.7 oct, third 0.2** | 3 | 80.99 | 78.0 | 90.7 | 12.7 | 16.9 | 76.0 | **chosen** |
| the same, `windowSeconds` 6 | 4 | 81.69 | 78.1 | 91.4 | 13.3 | 15.6 | 75.7 | top score, 0.70 ahead: inside the noise, one more knob |
| the same, `stableSalience` 0.1 | 4 | 81.31 | 78.0 | 90.7 | 12.7 | 17.4 | 79.8 | inside the noise, one more knob |
| the same, `stableSeconds` 10 | 4 | 81.29 | 78.0 | 90.7 | 12.7 | 16.1 | 75.4 | inside the noise, one more knob |
| the same, `halfLifeSeconds` 24 | 4 | 81.28 | 78.3 | 91.2 | 12.9 | 16.6 | 75.5 | inside the noise, one more knob |
| 110 BPM, 0.7 oct, third 0.3 | 3 | 80.80 | 77.7 | 90.8 | 13.1 | 17.3 | 78.4 | as simple, lower score, and at the grid's edge |
| 120 BPM, 0.7 oct, third 0.3 | 3 | 80.16 | 77.2 | 89.9 | 12.7 | 17.7 | 78.6 | as simple, lower score. The serious alternative: see below |
| 110 BPM, 0.7 oct, third 0.1 | 3 | 80.14 | 77.3 | 89.1 | 11.8 | 16.6 | 74.4 | as simple, lower score |
| 110 BPM, 0.7 oct, no penalties | 2 | 77.86 | 74.9 | 85.7 | 10.8 | 15.3 | 71.0 | simplest prior-only row, below the floor |

What the rule cannot settle, on record before any look: 110 BPM and 0.7 octaves are both at the low edge of the grid, so the sweep did not bracket its optimum. 120 BPM is inside the grid and is the published centre, and it scores within the noise of the choice. It was not preferred because the rule was fixed first and counts knobs. Choosing it from per-set rows, by argument, would be the forking path the rule exists to prevent. `halfBeatPenalty` stays in the code at 0 for now: it lost at every non-zero value, and removing it is a cleanup that should not share a commit with a look.

## Results

The licence-clean defaults, fixed in `b1ab9d3` before one logged look with image `sha256:140ca595…`. **Old** is #285's tuning, kept as the `tempogram-285` detector. Peaks has its lowpass. Licence: **clean** sets could tune, **evaluation-only** sets never did. Per-genre tables are in [`results/rba-51-report.md`](results/rba-51-report.md). The RBA-50 numbers on the old mixed tuning are in [`results/report.md`](results/report.md).

### Dev (real path, licence-clean sets only: `run.ts` refuses the others on dev)

| set | licence | tracks | Acc1 peaks | Acc1 old | Acc1 new | Acc2 peaks | Acc2 old | Acc2 new | false-stable peaks | old | new | coverage peaks | old | new |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| fsld | clean | 791 | 54.7 | 70.0 | 71.4 | 63.8 | 82.4 | 87.4 | 37.9 | 17.1 | 19.5 | 72.7 | 59.9 | 69.5 |
| groove | clean | 221 | 52.9 | 61.1 | 81.0 | 67.0 | 87.8 | 95.9 | 38.5 | 32.4 | 19.3 | 68.8 | 81.4 | 92.8 |
| guitarset | clean | 180 | 14.4 | 66.7 | 81.7 | 16.7 | 87.2 | 88.9 | 59.0 | 24.2 | 11.7 | 26.1 | 68.3 | 65.6 |
| **clean, macro** | clean | 1192 | 40.7 | 65.9 | 78.0 | 49.2 | 85.8 | 90.7 | 45.1 | 24.6 | 16.8 | 55.9 | 69.9 | 75.9 |

### Held-out (the one look)

| set | licence | tracks | Acc1 peaks | Acc1 old | Acc1 new | Acc2 peaks | Acc2 old | Acc2 new | false-stable peaks | old | new | coverage peaks | old | new |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| fsld | clean | 717 | 57.2 | 65.8 | 70.0 | 68.5 | 82.8 | 89.0 | 37.1 | 22.3 | 18.7 | 74.1 | 64.4 | 68.6 |
| groove | clean | 127 | 36.2 | 60.6 | 88.2 | 45.7 | 91.3 | 96.9 | 40.1 | 33.6 | 8.7 | 61.4 | 77.2 | 89.8 |
| guitarset | clean | 180 | 21.7 | 63.9 | 66.1 | 25.6 | 85.0 | 85.0 | 45.0 | 22.5 | 25.7 | 25.6 | 55.6 | 61.7 |
| fsld-nc | evaluation-only | 319 | 65.2 | 69.6 | 75.5 | 75.2 | 84.3 | 92.5 | 32.9 | 17.8 | 19.3 | 76.5 | 59.9 | 71.5 |
| giantsteps | evaluation-only | 326 | 81.3 | 87.1 | 65.0 | 88.0 | 92.9 | 94.8 | 49.1 | 11.5 | 37.3 | 98.8 | 77.3 | 78.8 |
| ballroom | evaluation-only | 358 | 52.2 | 73.7 | 67.3 | 62.8 | 94.4 | 95.3 | 39.9 | 21.0 | 29.7 | 87.2 | 64.2 | 86.3 |
| gtzan | evaluation-only | 480 | 48.5 | 67.5 | 71.0 | 64.2 | 91.7 | 91.5 | 46.8 | 21.6 | 20.7 | 79.2 | 70.0 | 78.3 |
| **clean, macro** | clean | 1024 | 38.4 | 63.4 | 74.8 | 46.6 | 86.4 | 90.3 | 40.8 | 26.2 | 17.7 | 53.7 | 65.7 | 73.3 |
| all, pooled | mixed | 2507 | 55.4 | 70.1 | 70.5 | 66.0 | 88.3 | 91.7 | 42.8 | 20.5 | 23.5 | 76.3 | 66.6 | 75.3 |

The look is fresh for fsld, groove and fsld-nc, and the second one for the other four. The old row reproduces RBA-50's numbers on those four to the decimal, on data rebuilt from the publishers.

**The look ended incomplete.** `fsld/395035` cannot be decoded in the image, so 3 of 7524 runs never finished, the job exited 1, a restart with the same command failed on the same file, and no `heldout.json` was written. The table comes from the same look's progress file, 2507 tracks per detector, one fsld track short of its 718. A fix needs a new image, which is a new look, so that was not done. It is now in `splits/fsld-excluded.json`.

**Half-time.** The gap between Acc2 and Acc1 narrowed on clean sets, from 19.9 to 12.7 points on dev and from 23.0 to 15.5 on held-out. Over all seven sets it widened, from 18.2 to 21.2: the prior did not remove octave errors, it turned doubles into halves. Doubles fell and halves rose in all seven held-out sets, for example fsld halves 7.0 to 16.0 and doubles 9.9 to 2.9.

**The cost is in fast music.** Tracks labelled above 156 BPM lost almost all their Acc1: GiantSteps 90.1 to 0.0 (81 tracks), ballroom 55.6 to 2.0 (99), GTZAN 64.8 to 11.3 (71), and on clean sets fsld 37.7 to 1.3 (77). GiantSteps went from 87.1 to 65.0 overall, below peaks' 81.3, with half-time readings up from 0.9 to 29.1 of its tracks.

**False-stable.** On clean sets it fell with coverage rising: 24.6 to 16.8 on dev, 26.2 to 17.7 on held-out, with coverage 65.7 to 73.3. Over all seven sets it rose from 20.5 to 23.5, because a confident half-time reading counts as false: GiantSteps 11.5 to 37.3, ballroom 21.0 to 29.7. GuitarSet also went the wrong way on held-out, 22.5 to 25.7, against 24.2 to 11.7 on dev, and its Acc1 gain shrank from 15.0 points on dev to 2.2.

CPU, on an M1 Pro in Node with synthetic input (`perf.ts`, 3 input shapes, two runs on a busy machine): 3.7 to 5.3 ms per second of audio, up to 0.53% of a core, against 0.7 ms for peaks. Two runs saw one chunk over the 2.9 ms of a render quantum, 14.2 ms on noise and 9.7 ms on clicks, each on a different shape and not repeated in the other run, so this is scheduling noise until shown otherwise. Not compared on an idle machine.

## Limits

- Half-time readings are now the main error, and the prior only moves octave errors around: a slower prior traded doubles for halves.
- A pulse above about 156 BPM reads at half: clicks at 174 BPM read 87, where the #285 prior read 174. The dev sets have few such tracks (7 to 10%), so the macro score barely felt it. A narrower `tempoRange` that excludes the half stops it, unmeasured on real audio. A test pins the behaviour.
- Tuned on loops, drums and solo guitar, with no full vocal mixes among the clean sets. The prior centre is the knob most exposed to that, and it sits on the edge of the grid swept.
- The peaks detector is measured wrapped by its lowpass. `analyzeFullBuffer`, the CLI and the MCP server take the tempogram as an option, and peaks stays the default everywhere. Offline numbers are in the report, and the sweep did not tune for them.
- The first reading comes at 4 s and the earliest `bpmStable` at about 11.5 s: the warm-up, then 8 s of agreeing frames.
- GiantSteps previews are 2 minutes and GTZAN clips 30 s, so slow settling is not penalised the way a full DJ set would.
- The worklet reads the left channel only, so a hard-panned track is judged on that channel. This holds for both detectors.
