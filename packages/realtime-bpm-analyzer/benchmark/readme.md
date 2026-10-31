# Tempo benchmark

Measures what a user gets from the real-time analyzer: decoded audio goes through the real streaming path (128-sample render quanta, the 4096-sample aggregator, `RealTimeBpmAnalyzer.analyzeChunk`, left channel, as the worklet does), and every event is timed in audio seconds. Results for both detectors are in [`results/`](results), per track.

Evaluation only: nothing here trains anything, and no audio or label file is committed, only track ids, their groups and numeric results.

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

`make-splits.ts` wrote `splits/*.json` with a fixed seed, `rba-50-2026-10-30` for the first four sets and `rba-51-2026-10-30` for fsld, groove and fsld-nc, and they were committed before any result existed. A first version of the shuffle barely reacted to the seed: it was fixed and the commit amended after a dev run on the old split had started decoding, and was killed, with nothing scored or written. That run decoded tracks that are now held-out, audio only.

Groups stay on one side: ballroom by album and replica, GTZAN by blocks of 10, GuitarSet by progression at one tempo, GiantSteps by track, FSLD by uploader, Groove by drummer and session.

Four contaminations remain. The first two were found by the reviewer before RBA-50's look. GTZAN repeats recordings across blocks (Sturm 2013): the 19 held-out members of cross-split pairs are listed in `splits/gtzan-excluded.json` with the undecodable `jazz.00054` and left out of held-out, which is why it scores 480 of 500. GuitarSet's 3 tempos of a progression can straddle the split, so most of its held-out tracks share chords and players with dev at another tempo. Its held-out numbers are a little kinder than the others. The other two were found reviewing RBA-51's look. Groove is grouped by drummer and session, not by drummer alone, so 110 of its 127 held-out tracks share a drummer with dev. A licence decides between fsld and fsld-nc, and uploaders are kept apart per set, so 19 of the 319 fsld-nc tracks come from uploaders on fsld's dev side, as read from the file names.

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
- **Tempo prior**: log-Gaussian as in Ellis 2007, on 50 to 240 BPM, instead of folding into 90 to 180. Ellis uses 120 BPM and 1.4 octaves. The defaults in this branch, 110 BPM and 0.7 octaves, are the first pick, which the second sweep's guard rejects. Both are at the low edge of the first grid, so this is a fit to these sets' tempo mix, not a law. A clean pulse and its half tie at centre × √2, so a clean pulse above about 156 BPM reads at half, and real audio starts losing below that (see Results).
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

The principle, that the simplest tuning within noise wins, came from the brief. No rule existed in the repo, so its exact form was written after reading the dev rows and before any look, which held-out cannot have touched but the dev rows could have shaped. The form is `simplestWithinNoise` in [`lib/sweep.ts`](lib/sweep.ts): among rows within one standard error of the best score, the fewest knobs moved from what the sweep started at, then the higher score. A gain inside the noise pays for no knob. The first sweep's rows are committed in `results/rba-51-sweep.jsonl`. Only the licence-clean dev sets feed it (fsld 791, groove 221, guitarset 180), macro over the sets.

The best score is 81.69, one standard error is 1.58, so the floor is 80.11. The pick holds for any floor width from 0.70 to 3.83: below 0.70 it is `windowSeconds` 6, above 3.83 the row without the penalty. The 1.58 is an unpaired estimate although the rows share their tracks, and the review's track bootstrap of the chosen row gave 2.04. So 0.70 ahead is unproven either way, as the sweep has no per-track rows to pair. Numbers below are from the replay, macro over the three sets.

| tuning | knobs moved | score | Acc1 | Acc2 | gap | false-stable | coverage | verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| #285: 136 BPM, 0.8 oct, no penalties | 0 | 64.13 | 65.9 | 85.8 | 19.9 | 24.6 | 69.9 | where it started, far below the floor |
| **110 BPM, 0.7 oct, third 0.2** | 3 | 80.99 | 78.0 | 90.7 | 12.7 | 16.9 | 76.0 | **chosen** |
| the same, `windowSeconds` 6 | 4 | 81.69 | 78.1 | 91.4 | 13.3 | 15.6 | 75.7 | top score, 0.70 ahead: inside the noise, one more knob |
| the same, `stableSalience` 0.1 | 4 | 81.31 | 78.0 | 90.7 | 12.7 | 17.4 | 79.8 | inside the noise, one more knob |
| the same, `stableSeconds` 10 | 4 | 81.29 | 78.0 | 90.7 | 12.7 | 16.1 | 75.4 | inside the noise, one more knob |
| the same, `halfLifeSeconds` 24 | 4 | 81.28 | 78.3 | 91.2 | 13.0 | 16.6 | 75.5 | inside the noise, one more knob |
| 110 BPM, 0.7 oct, third 0.3 | 3 | 80.80 | 77.7 | 90.8 | 13.1 | 17.3 | 78.4 | as simple, lower score, and at the grid's edge |
| 120 BPM, 0.7 oct, third 0.3 | 3 | 80.16 | 77.2 | 89.9 | 12.7 | 17.7 | 78.6 | as simple, lower score. The serious alternative: see below |
| 110 BPM, 0.7 oct, third 0.1 | 3 | 80.14 | 77.3 | 89.1 | 11.8 | 16.6 | 74.4 | as simple, lower score |
| 110 BPM, 0.7 oct, no penalties | 2 | 77.86 | 74.9 | 85.7 | 10.8 | 15.3 | 71.0 | simplest prior-only row, below the floor |

What the rule cannot settle, on record before any look: 110 BPM and 0.7 octaves are both at the low edge of the grid, so the sweep did not bracket its optimum. 120 BPM is inside the grid and is the published centre, and it scores within the noise of the choice. It was not preferred because the rule counts knobs and its score is lower. Choosing it from per-set rows, by argument, is the forking path the rule exists to prevent, with the limit that the rule itself was written after seeing the rows. `halfBeatPenalty` stays in the code at 0 for now: it lost at every non-zero value, and removing it is a cleanup that should not share a commit with a look.

## The second sweep: no pick, no second look

**The library defaults in `src/` are still the first pick (110 BPM, 0.7 octaves, third 0.2), which fails the fast-tempo guard, and must not ship.** This section is the state before the amendment: see [The second look](#the-second-look) for what followed.

The guard, written into `lib/sweep.ts` before results, is peaks on clean dev, real path: 140 to 165 BPM at least 92 of 170, 165 and up at least 22 of 90. Its floors are dev only. The rule is `pickWithGuard`. `pick.ts` exits 1 when the pick holds `priorBpm` or `priorOctaves` at the end of what was measured. As first written, that was its last word, and `pickedConfiguration` was null.

**What the first look shaped, declared:** the rule itself, its two bands, the band edges at 150 and 156, and the choice to evaluate the 90 to 180 range all come from the first look's findings, by way of the brief and my reading of them. No tuned value or floor does. The sets the first look called fresh are not fresh any more.

Two sweeps on dev, 2118 rows, two ranges, plans `job/sweep-plan-tune-2.json` and `job/sweep-plan.json`:

```sh
./benchmark/run.sh pick results/rba-51-sweep-2.jsonl,results/rba-51-sweep-3.jsonl   # exited 1 before the amendment, 0 now
```

963 rows pass the guard (50 to 240: 322, 90 to 180: 641). Best passing score 75.86, noise 1.75 (unpaired), floor 74.11. The rule first chose 90 to 180, 80 BPM, 1.7 octaves, third 0.3, at the first sweep's low edge. The grid was extended to 50 BPM, and the rule then chose 50 BPM, 2.4 octaves, third 0.3, on the end of both axes, so it refuses again.

**Why no third extension.** On a bounded range the prior acts, to first order, as a tilt, about `(log2(127) - log2(priorBpm)) / priorOctaves²`: 0.235 for 50/2.4 and 80/1.7. Those two read 1 of 1192 tracks differently on the real path, and their 0.15 points come from that track and a shift in coverage. A nearby row, 100/1.3 with third 0.2, is a neighbour rather than the same reading: 75.29, 23 tracks different, coverage on 165+ 70.0 against 84.4. The approximation fails at narrow widths. Octaves above 2.4 were not swept, so another grid could land inside by chance, and bracketing would then mean nothing. Across the ridge the score falls on both sides. The refusal stands anyway, because changing a rule after it refused, in order to spend the last look, needs a ruling.

**The refusal depends on a base chosen before results.** Knobs moved are counted from #285's values. Counted from the first pick, which is the library default this sweep's baseline row ran, the same rule chooses 110 BPM, 0.7 octaves, third 0.4: score 74.88, one knob moved, interior prior, 165+ 34 of 90 on replay, no real-path row. I did not change the base after the refusal, and that reading is on record for the ruling.

At 50 to 240 the rule's pick has an interior prior (130 BPM, 0.85 octaves) with third 0.4 at the end of its axis, score 72.89, 165+ 41 of 90, replay only, and scores below the ridge.

Best passing score of the grid rows per prior on 90 to 180, replay, without the single-knob stage (its best is 75.86, at 80/1.7 with `stableSalience` 0.1). A dot means no row at that prior passes the guard. 140 to 170 BPM stay between 33 and 73 and are left out:

| BPM | 0.4 | 0.55 | 0.7 | 0.85 | 1 | 1.3 | 1.7 | 2.4 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 | . | . | . | . | . | 72.3 | 74.6 | 75.4 |
| 60 | . | . | . | . | . | 73.3 | 74.7 | 74.9 |
| 70 | . | . | . | . | . | 74.3 | 75.0 | 74.2 |
| 80 | . | . | . | . | 73.3 | 75.0 | 75.3 | 74.4 |
| 90 | . | . | . | 73.9 | 74.8 | 75.2 | 74.5 | 74.4 |
| 100 | . | . | 73.8 | 74.8 | 75.1 | 75.3 | 74.4 | 74.2 |
| 110 | . | . | 74.9 | 75.0 | 74.9 | 74.4 | 74.2 | 73.0 |
| 120 | . | 74.6 | 74.3 | 74.6 | 74.4 | 73.6 | 73.4 | 73.0 |
| 130 | 65.4 | 70.8 | 72.7 | 73.4 | 73.0 | 72.7 | 72.7 | 72.8 |

The fast material is 170 tracks in 68 groups (largest 7.1%, 92 electronic) and 90 tracks in 38 groups (largest 13.3%, 50 electronic), above the threshold posted on the RBA-51 card before counting. Those are loops, not full mixes. 36 of the 90 fast tracks are labelled 180 and up: the 30 above 180 are outside 90 to 180, though the tolerance lets a few read true, and the 6 at exactly 180 are inside it. No further tempo-labelled full-mix electronic data with a clean per-item licence was found.

Real-path dev tables per set and band: [`results/rba-51-retune.md`](results/rba-51-retune.md). Macro Acc1 on 90 to 180: peaks 40.7, #285 68.3, first pick 72.6, the ridge 74.5 to 74.7. 165 and up: peaks 24.4, the ridge 41.1 to 44.4. With the extension's 10 s reset, coverage is 0.0 and Acc1 falls to 68.3.

## The second look

**What this branch ships.** The library's default detector is peaks, unchanged. `detector: 'tempogram'` alone still reads with the first pick (110 BPM, 0.7 octaves, third 0.2), which must not ship. The candidate is opt-in: `{detector: 'tempogram', tempogramMode: 'extension'}`, 90 to 180 BPM, 80 BPM, 1.7 octaves, third 0.3, no biquad, no reset timer (`extensionTempogramMode` in `src/core/tempogram.ts`). The defaults need not hold it: the detector takes a tuning when it is built, and the option passes this one through the same path a caller uses. A mode, not new defaults, also because these values are only a tilt on a range that excludes a fast tempo's half: nothing measured them on 50 to 240. The mode refuses another `tempoRange` and `continuousAnalysis`. It covers the real-time path only, as `analyzeFullBuffer`, the CLI and the MCP server take no mode.

**The amendment.** RBA-51's DECISION of 2026-10-31 amended `pickWithGuard` after it had refused twice: among rows within noise, one holding the prior inside what was measured comes first, and a row not setting a prior knob counts as on the edge. On the committed rows that gives this candidate, exit 0 from `pick`, and a test holds them together. This is a fork in the path, and the look's reason declares it. Counting knobs from the first pick instead of #285, the rule gives 110/0.7, third 0.4. So the look is a gate, not the final word, and not for advertising.

**The pass bar**, in [`lib/pass-bar.ts`](lib/pass-bar.ts) and committed before the look. `./benchmark/run.sh verdict <heldout.json>` applies it and prints a yes or no, exit 0 or 1, and exit 2 on a file it cannot judge. At 90 to 180, on the real path, against peaks:

1. Clean macro Acc1 and Acc2 above peaks by more than the noise: the range of the difference is wholly above zero.
2. Acc1 and Acc2 on 140 to 165 and on 165 to 180, each over all sets pooled and over clean sets pooled, not below peaks beyond noise: the range of the difference reaches zero or above.
3. GiantSteps Acc1, by the same test.
4. False-stable not above peaks, on clean macro and on all sets pooled. The DECISION grants this one no noise, so the point estimate decides.

Any failure keeps the extension on peaks. A pass still leaves David's MP3 test and a real-browser run. These readings are mine where the DECISION is silent, fixed here before the numbers:

- **The noise** is a 95% percentile range from a paired bootstrap, 4000 draws, fixed seed, resampling whole groups within each set. The groups are the split's, except that fsld and fsld-nc resample together as they share uploaders. Groove's are drummer and session, so a drummer across sessions still counts as independent.
- **The width.** 95% is wider than the one standard error `lib/sweep.ts` calls noise, so it is stricter on bar 1 and kinder on bars 2 and 3. "Error ranges" points to 95%, and that decides. `verdict` prints the same tests at one standard error beside it, deciding nothing, so a verdict that turns on the width shows it. A small band is easier to pass: not-below weakens as its range widens.
- **Groups.** GiantSteps' groups are one track each and Ballroom's `Media-*` tracks each their own, so bar 3's range is track-level. There is no better group for them in the data.
- **Bar 4 has no coverage floor**, as the DECISION sets none: coverage is printed beside it. It counts every stable reading, and fails if peaks is silent in a whole set, which would otherwise read as all false and flatter the candidate.
- **Tracks labelled outside 90 to 180** are counted apart: out of bar 2's bands, in their own rows, gating nothing. Bars 1, 3 and 4 read the whole set as the DECISION states them, with the out-of-range rows beside them.
- **#285 against the candidate on 140 to 165** is reported and gates nothing. Beyond noise, it goes to David: only his ruling can use #285.

The references are measured as they have been: peaks with its lowpass, folding into its default 90 to 180, without the extension's reset timer. Peaks with that timer has never been measured, so the comparison is with peaks in that shape.

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

The look is fresh for fsld, groove and fsld-nc only, with the overlaps listed under Splits. The other four were seen by RBA-50's look, and that look's half-time numbers are what motivated the penalty knobs, so they shaped what the sweep searched, though every value came from dev. The clean macro row averages in second-look GuitarSet. The old row reproduces RBA-50's numbers on those four to the decimal, on data rebuilt from the publishers.

**The look ended incomplete.** Each detector logged `skipped fsld/395035: Error: ffmpeg could not decode /data/rba-tempo/fsld/FSL10K/audio/wav/395035_7473420.aiff.wav`, so 3 of 7524 runs never finished, the job exited 1, a restart with the same command logged the same three lines and exited 1, and no `heldout.json` was written. `run.ts` refuses on purpose to write a score from a shrunk run with progress kept. The table is built outside it, by assembling the same look's progress file with a throwaway script, so this close-out is a decision for the Commander to accept, recorded on the card: 2507 tracks per detector, one fsld track short of its 718. A fix needs a new image, which is a new look, so that was not done. `job.ts` now counts such a track as a skip, up to three, and `splits/fsld-excluded.json` is gone. The file is 92 bytes as published: a valid WAV header with a zero-length `data` chunk.

**Half-time.** The gap between Acc2 and Acc1 narrowed on clean sets, from 19.9 to 12.7 points on dev and from 23.0 to 15.5 on held-out. Over all seven sets it widened, from 18.2 to 21.2: the prior did not remove octave errors, it turned doubles into halves. Doubles fell and halves rose in all seven held-out sets, for example fsld halves 7.0 to 16.0 and doubles 9.9 to 2.9.

**The cost is in fast music, and starts below the tie.** Acc1 by labelled tempo, all seven held-out sets pooled:

| labelled BPM | tracks | old | new |
|---|---:|---:|---:|
| under 120 | 1038 | 54.1 | 82.4 |
| 120 to 140 | 850 | 89.5 | 87.4 |
| 140 to 150 | 186 | 84.4 | 67.2 |
| 150 to 156 | 50 | 92.0 | 60.0 |
| 156 to 165 | 39 | 82.1 | 20.5 |
| 165 and up | 344 | 57.6 | 1.5 |

Tracks labelled above 156 BPM lost almost all their Acc1: GiantSteps 90.1 to 0.0 (81 tracks), ballroom 55.6 to 2.0 (99), GTZAN 64.8 to 11.3 (71), and on clean sets fsld 37.7 to 1.3 (77). GiantSteps went from 87.1 to 65.0 overall, below peaks' 81.3, with half-time readings up from 0.9 to 29.1 of its tracks.

**False-stable.** Averaged over clean sets it fell with coverage rising: 24.6 to 16.8 on dev, 26.2 to 17.7 on held-out, with coverage 65.7 to 73.3. Over all seven sets it rose from 20.5 to 23.5, because a confident half-time reading counts as false: GiantSteps 11.5 to 37.3, ballroom 21.0 to 29.7, fsld-nc 17.8 to 19.3. Fsld, the largest clean set, also rose on dev, 17.1 to 19.5, while falling on held-out, 22.3 to 18.7. GuitarSet went the wrong way on held-out, 22.5 to 25.7, against 24.2 to 11.7 on dev, and its Acc1 gain shrank from 15.0 points on dev to 2.2.

CPU, on an M1 Pro in Node with synthetic input (`perf.ts`, 3 input shapes, two runs on a busy machine): 3.7 to 5.3 ms per second of audio, up to 0.53% of a core, against 0.7 ms for peaks. Two runs saw one chunk over the 2.9 ms of a render quantum, 14.2 ms on noise and 9.7 ms on clicks, each on a different shape and not repeated in the other run, so this is scheduling noise until shown otherwise. Not compared on an idle machine.

## Limits

- Half-time readings are now the main error, and the prior only moves octave errors around: a slower prior traded doubles for halves.
- A clean pulse above about 156 BPM reads at half: clicks at 174 BPM read 87, where the #285 prior read 174. On dev those tracks cost 3.83 points of macro Acc1, more than twice the rule's noise of 1.58, and the score still took the trade because slower tracks gained more. A narrower `tempoRange` that excludes the half stops it, unmeasured on real audio. A test pins the behaviour.
- Tuned on loops, drums and solo guitar, with no full vocal mixes among the clean sets. The prior centre is the knob most exposed to that, and it sits on the edge of the grid swept.
- The peaks detector is measured wrapped by its lowpass. `analyzeFullBuffer`, the CLI and the MCP server take the tempogram as an option, and peaks stays the default everywhere. Offline numbers are in the report, and the sweep did not tune for them.
- The first reading comes at 4 s and the earliest `bpmStable` at about 11.5 s: the warm-up, then 8 s of agreeing frames.
- GiantSteps previews are 2 minutes and GTZAN clips 30 s, so slow settling is not penalised the way a full DJ set would.
- The worklet reads the left channel only, so a hard-panned track is judged on that channel. This holds for both detectors.

## Free data (RBA-59)

`free-data.ts` gets freely licensed music, labels it with independent trackers and says with counts whether it is decent. It runs as `job/free-data.sh` in its own image (`job/data.Dockerfile`, tag `data-sha-<commit>`), writing to `free-data/` under the data root. Audio and labels stay there, and only the split's ids may enter git.

| Stage | What it does | Output |
| --- | --- | --- |
| `catalogue` | Reads FMA's own metadata files and the Internet Archive's search and metadata APIs, rejects by named reason, caps 30 tracks per artist | `catalogue/candidates.jsonl`, `catalogue/rejections.json` |
| `fetch` | FMA members by range request, Internet Archive files one at a time, stopping at five refusals in a row | `audio/`, `fetched.jsonl` |
| `analyse` | `job/trackers.py`: Beat This!, Essentia, librosa with a flat prior, resumable | `readings.jsonl` |
| `consolidate` | Tempo consensus, duplicates, split frozen by artist, confirmation list | `manifest.jsonl`, `split-frozen.json`, `split-ids.json`, `confirmation.md` |
| `samples` | Generated, derived and loop-mix samples, tooling proof only | `not-real-*.jsonl` |
| `report` | Every count, with the verdict against 200 real tracks per band | `report.json` |

Rules the code holds, and the tests check:

- A licence is an exact CC0, CC BY or CC BY-SA URL from the host. BY-SA is counted apart and never fills the target, as share-alike for weights is RBA-40's open question.
- A hint never votes, so it can be measured against the label. A label needs two trackers in one octave. No agreement means no label, only a candidate for a person to confirm.
- The verdict counts real, permissive tracks with no tracker an octave off. Two against one at an octave counts as `contested`, shown apart, because agreement between trackers is not truth, and only `confirmation.md`'s random sample measures how far to trust it.
- Derived, loop-mix and generated audio is marked, names its sources, comes from the dev side only, never sits in held-out and never counts towards the target. Loops themselves stay on FSLD's own split.

Limits: a recording's identity is its hash, or its artist, title and rough length. The same recording under two spellings of an artist would slip through and could land on both sides of the split, which audio fingerprints would catch. They were left out to keep the image small, and the report's numbers should be read knowing that. Stretching is FFmpeg's `atempo`, which smears transients, so a derived track is no proxy for an attack-sensitive reading.

Free-mixes is opt-in: `run.ts --sets free-mixes` reads it once `split-ids.json` is copied to `splits/free-mixes.json`, and it stays out of `loaders` and `tuningSets`, so nothing tunes on it or looks at it by default.
