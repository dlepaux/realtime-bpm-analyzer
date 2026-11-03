# RBA-109 phase 0: beat ground truth and a dev-only feasibility test

Where the beats fall, for video-editing markers and live visuals. This is phase 0 of RBA-109: what licence-clean beat ground truth exists, a sealed beat split, and whether the 5.5.0 tempogram's onset curve gives usable beat positions. **Dev only.** Nothing here read a beat held-out track, a tempo held-out label, or any `free-heldout-*` output. Aggregates only: per-track rows stay with the data.

## 1. Ground truth audit

Licence checked on the publisher's page on 2026-11-03. Where mirdata's table disagrees, the publisher wins, as in [`../readme.md`](../readme.md).

| set | beat truth | how exact | licence (publisher) | items | genres, tempo | on the compute box |
|---|---|---|---|---|---|---|
| Groove MIDI (Gillick et al. 2019) | derived: the MIDI file's metronome grid, bars from tick 0 and the file's meter | exact for the click the drummer played to. Audio aligned to the MIDI "within 2ms" (publisher). Measured here: the onset curve lines up with the MIDI notes within one frame on 167 of 180 dev tracks (section 3) | CC BY 4.0, https://magenta.tensorflow.org/datasets/groove (mirdata lists CC BY-SA 4.0) | 1,150 MIDI files, 10 drummers. 348 used by the tempo benchmark (`beat`, with audio, 16 s and up) | rock, jazz, funk, hip hop, soul, pop... Dev 50 to 290 BPM, median 102. Dev meters: 175 in 4/4, 4 in 3/4, 1 in 5/4 | yes (audio and MIDI) |
| E-GMD (Callender et al. 2020) | same MIDI grids as Groove, re-recorded on 43 kits (Roland TD-17) | aligned "within 2ms" (publisher) | CC BY 4.0, https://magenta.tensorflow.org/datasets/e-gmd | 444 h, 90 GB zip | Groove's performances, so Groove's drummers: a split must follow the drummer across both sets | **no**, not fetched: same performances, and 90 GB was not needed to answer phase 0 |
| GuitarSet (Xi et al. 2018) | annotated: JAMS `beat_position`, the click the player recorded to, with downbeats | exact grid at the file's tempo, from t = 0 | CC BY 4.0, https://zenodo.org/records/3371780 (mirdata lists MIT) | 360 excerpts, 6 players | bossa nova, jazz, funk, rock, singer-songwriter. Dev 84 to 166 BPM, median 119 | audio was there. **Annotations fetched today** (`annotation.zip`, md5 `b39b78e63d3446f2e54ddb7a54df9b10` as published, sha256 `8daa02e6417ccca1685feb44b135e95928ad7037e5032ecb326b5791856fda99`), next to the RBA-59 free data, with a SOURCE file |
| FSLD loops (Ramires et al. 2020), `fsld` set | derived: a well-cut loop starts on a beat, so beats are k * 60 / bpm, repeated as the benchmark repeats the loop | exact only if the loop holds a whole number of beats. Rule: within 20 ms of a whole count, 2 beats or more. **697 of 791 dev loops pass (88%)** | per loop, Freesound licence: only CC0 1.0 and CC BY 3.0 loops are in `fsld` (dataset CC BY 4.0, https://zenodo.org/records/3967852) | 9,486 loops, 1,509 in `fsld` with an expert tempo (791 dev, 718 held-out) | bass music, live sounds, electronic, cinematic, global, hip hop. Dev 56 to 260 BPM, median 120 | yes |
| RBA-59 free mixes | **none**: tempo labels only, from independent trackers | not beat truth | per track CC BY / CC BY-SA (RBA-59 manifest) | 23,080 | full mixes | yes, unused here |
| GiantSteps tempo | none (tempo only) | | not cleared (see readme) | | | yes, unused |

Out, as not licence-clean for our use: **GTZAN** (no licence, no copyright clearance for the audio), **Ballroom** (licence unresolved: mirdata's table says CC0, its source file CC BY-NC-SA), **SMC** (no licence found), **Harmonix Set** (annotations MIT, but no audio: only YouTube links and spectrograms under their own terms), **Hainsworth** (commercial CD audio), **RWC** (custom licence), **Candombe** and **Saraga** (CC BY-NC-SA), **fsld-nc** (non-commercial loops), and any set built from them. madmom's models (CC BY-NC-SA) are not used.

**The limit that matters.** Every licence-clean beat truth we have is a click track: one constant tempo, a rigid grid. None has the tempo drift of real band music, and none is a full mix. A rigid grid at the right tempo and phase is a perfect answer on these sets, which flatters the grid baseline and can't show a tracker following drift. The free mixes are the full mixes, and they have no beat truth.

## 2. Split and seal

`beats_split.py` wrote [`../splits/beats.json`](../splits/beats.json) from the ids of the committed tempo splits, reading no label. Rules, fixed before any beat was scored:

- **Inside the tempo halves.** Beat dev takes only tempo-dev tracks and beat held-out only tempo held-out tracks, so no tempo held-out label is ever read on dev. Tracks that would cross go to neither side.
- **No source on both sides.** Groove by drummer, each to the side holding more of their tempo-split tracks (a tie to held-out): dev drummers 1, 3, 4, 7, 10, held-out 5, 6, 8, 9. GuitarSet by player, ordered by sha256 of the seed and player: dev players 02, 03, 04, held-out 00, 01, 05. FSLD keeps the tempo split, which already holds each uploader on one side.
- **Counts.** Dev: groove 180, guitarset 90, fsld 791 (697 after the loop rule). Held-out: groove 83, guitarset 90, fsld 718 (the loop rule applies at look time). Left out: 85 groove tracks whose drummer sits on the other side, and GuitarSet's other-player halves (180).
- **Seal.** `heldoutSha256` = `eb7b7cd26eba3fb430698f6a01a177ae1754abe126809f7c5fd461f7b2ecd8c3`, the sha256 of the held-out ids as canonical JSON (sorted keys, no spaces). A test rebuilds it from the rule. Nothing in `beats_*.py` reads `heldout`.
- **Known overlap.** GuitarSet progressions repeat across players at other tempos, as in the tempo split: chords are shared, players are not.

## 3. Method

- **Curve.** The 5.5.0 tempogram's own onset curve (`onsetCurve`, 100 Hz), as cached by RBA-51's third sweep. No audio is decoded here.
- **Tempo.** The engine's offline reading from RBA-51's dev run (`offline`, the 5.5.0 tempogram on the full buffer). 18 dev tracks have none and score 0.
- **Tracker** (`beats_tracker.py`). Fresh code after Ellis 2007: the onset curve, normalised and smoothed by a Gaussian of a 32nd of the period, then dynamic programming where each beat takes the best predecessor 0.5 to 2 periods back, with a log-Gaussian penalty of tightness 100 (the librosa default) on each gap's departure from the engine's period. Weak beats at the edges are trimmed. No trained model.
- **Baseline.** A rigid grid at the engine's tempo, started on the first frame above the curve's 90th percentile.
- **Diagnostic.** The same tracker at the true tempo, to separate tempo errors from phase errors. It is not a product number.
- **Metrics** (`beats_metrics.py`). F-measure at 70 ms, CMLt and AMLt at 17.5%, as defined by mir_eval and Davies et al. 2009, reimplemented on the standard library (the box has no numpy). Beats before 5 s are dropped, as in mir_eval's `evaluate`. Also F at 40 ms, one frame at 25 fps. The estimate is scored over the truth's span plus half a beat.
- **Ranges.** 95% percentile ranges from 1,000 draws resampling whole sources within each set (drummer, player, uploader), paired, so a difference has its own range. Dev has 5 drummers and 3 players, so those sets' ranges are coarse.
- **Timing constant.** Frame i is the raw onset strength of the 1024-sample window that ends after (i + 1) hops, so it describes audio half a window back: (i + 1) / 100 s less 11.6 ms. That is read from `onsetCurve`, which is not smoothed (the 5-tap smoothing is only in `ingest`). Groove's MIDI notes check it without any beat label: the curve's best lag against the notes is 0 frames on 136 of 180 dev tracks and within one frame on 167. Section 5 declares a first run that misread this constant.

## 4. Dev results

**Headline, all 967 scored tracks.** DP tracker at the engine's tempo: F 64.2 [59.8, 68.6], F at 40 ms 58.7 [54.9, 62.6], CMLt 54.8 [49.7, 59.8], AMLt 77.7 [74.3, 80.9]. Against the grid baseline: F +5.5 [+1.6, +9.7], F at 40 ms **+10.9 [+6.1, +16.2]**, CMLt +3.7 [-0.3, +7.8], AMLt +7.2 [+4.2, +10.2].

- **Where the tracker gains.** fsld (F at 40 ms +16.1 [+10.7, +22.0]), fast tempos (140-165: F +11.8 [+2.4, +20.7]; 165 and up: F +16.4 [+5.0, +29.5]), and slow ones (under 90: AMLt +15.8 [+7.5, +24.1]).
- **Where it doesn't.** Groove, the rigid grid the drummer played to: the grid baseline is ahead on CMLt by 7.4 [2.4, 10.0], and the rest is within noise. The DP follows the drummer's playing, and the truth is the click. GuitarSet is within noise on F and CMLt, with 3 players.
- **What limits it.** At the right tempo (732 tracks) the tracker reaches F 71.6 and AMLt 88.3 but CMLt only 71.8: about one beat in six (the 16.5-point gap to AMLt) sits on the off-beat or at another metrical level. The engine's tempo is the other limit: 125 octave tracks reach CMLt 0 by definition, and on 92 wrong-tempo tracks F is 31.1. The true-tempo diagnostic lifts the pooled CMLt from 54.8 to 71.4.
- **Bias** (median signed error of matched beats): groove -21 ms (drummers ahead of the click, or the kit's attack), guitarset +9, fsld 0.


## 5. Declared: a first run with a misread delay

My first run used a delay of 31.6 ms: I read the 5-tap smoothing into `onsetCurve`, and it isn't there. Groove's notes then showed the curve 2 frames early, and I took that for a measured calibration and refitted 11.6 ms. The fresh review traced it to the misreading. The constant is now the one the code gives, with no fit on dev, and every number above comes from it. Pooled, the misread run read:

| method | F (70 ms) | F (40 ms) | CMLt | AMLt |
|---|---|---|---|---|
| DP tracker, engine tempo | 62.9 [58.9, 66.9] | 53.4 [49.1, 58.2] | 54.5 [49.4, 59.6] | 77.3 [73.9, 80.4] |
| grid baseline | 60.0 [55.8, 64.4] | 53.3 [48.9, 58.3] | 52.6 [48.1, 57.7] | 71.7 [67.6, 76.1] |
| tracker minus baseline | +2.9 [-1.2, +7.3] | +0.1 [-6.9, +6.8] | +1.9 [-1.8, +5.7] | +5.6 [+2.6, +8.5] |

What it shows: a 20 ms timing bias alone erases the tracker's lead at 40 ms, so the one-frame numbers are only as good as the timing constant. The CMLt-AMLt gap, the AMLt gain and the realtime p90 hardly moved, so the go or no-go below doesn't rest on it. The same review led to two smaller fixes before the final run: fsld beats now divide the loop's own length rather than the rounded label, and continuity follows mir_eval's handling of the first annotation and of annotations already used.

## 6. Realtime: how far ahead, and how close

Simulated on dev (`beats_realtime.py`, fixed before scoring). Every 0.5 s from 6 s onwards, the listener has the engine's latest realtime tempo reading and only the onset frames computed so far. The tracker runs on the last 8 s, a line is fitted through its beats of the last 4 s, and the beat at or after now + h is predicted and scored against the nearest true beat. The ranges come from 300 draws, which is coarser than the score ranges. The full table, with every lookahead, is at the end.

| tracks | lookahead | median abs error | p90 abs error | within 20 ms | within 40 ms | beyond a quarter beat | near the off-beat |
|---|---:|---|---|---|---|---:|---:|
| all (70,108 predictions) | 0 s | 36 ms [26, 44] | 270 ms [248, 298] | 39.3% | 51.8% | 31.9% | 20.4% |
| all | 1 s | 40 ms [29, 50] | 268 ms | 37.5% | 49.6% | 32.2% | 20.4% |
| all | 4 s | 56 ms [42, 66] | 266 ms | 31.7% | 43.3% | 33.4% | 19.4% |
| engine at the right tempo | 0 s | 24 ms [16, 32] | 236 ms [217, 245] | 45.8% | 59.3% | 25.6% | 16.2% |
| engine at the right tempo | 0.5 s | 26 ms [16, 34] | 234 ms [217, 244] | 44.7% | 57.8% | 25.8% | 16.2% |
| engine at the right tempo | 1 s | 28 ms [16, 36] | 236 ms | 43.5% | 56.5% | 26.2% | 16.3% |
| engine at the right tempo | 4 s | 42 ms [24, 52] | 236 ms | 37.0% | 49.5% | 27.6% | 15.7% |

"Near the off-beat" is 0.4 to 0.6 of a beat from the nearest true beat. 440 instants had no prediction (no engine reading yet, or no beat tracked).

**The answer.**
- **Lookahead is cheap.** From the next beat to 1 s ahead, the median grows 4 ms. At 4 s it grows 18 to 20 ms. Scheduling 0.5 to 1 s ahead, which covers the detection lag (the curve describes audio about 12 ms before its frame is out, plus the 10 ms hop) and output latency, costs little.
- **Phase is the problem, not the horizon.** The p90 sits near half a beat at every lookahead. At the right tempo, a quarter of predictions are more than a quarter beat off, and 16% sit near the off-beat.
- **Lights and visuals (under 20 to 30 ms): not reachable now.** At the right tempo, the median is 24 to 28 ms, but only 44 to 46% of predictions land within 20 ms.
- **Video markers (one frame, 40 ms): not reachable now either.** Offline at the right tempo, F at 40 ms is 66.5 [62.4, 70.6], or 58.7 over all tracks. Live, 57 to 59% of predictions at the right tempo land within 40 ms.
- **Both are within reach of a phase fix.** The right-tempo median shows the timing itself is close: the failures are whole off-beat locks, not jitter.

## 7. Go or no-go

- **Phase 1 (offline tracker): go, with two conditions.** (1) The work is phase selection, on-beat against off-beat, plus the tempo octave. The DP's gain over a grid is real but small, and the 17-point CMLt-AMLt gap at the right tempo is the target. (2) Before its one held-out look, add beat truth that isn't a click track. The cheapest clean routes are E-GMD (CC BY 4.0, Groove's drummers on 43 kits, drummer-split) for kit variety, and tapped or confirmed beats on a sample of the RBA-59 free mixes, in the RBA-67 style, for full mixes with drift. Without the second, phase 1's numbers can't show the case the product is for.
- **Phase 2 (realtime `beat` event): no-go until phase 1 moves CMLt.** The lookahead and latency budget are fine. The phase errors would put every fourth live beat visibly off. Re-run section 6 on phase 1's tracker. A reasonable bar, to be fixed before that run: at the right tempo, p90 under 40 ms at 0.5 s lookahead.

## 8. Not verified

- That the third sweep's cached curves are bit-identical to 5.5.0's `onsetCurve`. The onset knobs weren't in that sweep's plan, which I read as identical.
- Groove's 2 ms audio alignment beyond the note lag above. The truth is the click, not the drummer's notes, and the -21 ms remaining bias isn't split between drummer and kit.
- FSLD's well-cut start on beat 1. It's the annotators' word: the loop rule checks length only. FSLD downbeats aren't derived.
- E-GMD and the free mixes weren't scored. No browser or AudioContext timing was measured: section 6 is offline simulation on the engine's curve and readings.
- The metrics follow mir_eval's code and are checked against hand cases in `beats_test.py`, but they were not run against mir_eval itself, which isn't installed where the data is. One declared departure: the estimate is clipped to the truth's span plus half a beat.
- The timing constant is read from the code and checked on Groove's notes only, not on GuitarSet or fsld audio.

## Reproduce

On the compute box, from a copy of `benchmark/` (the scripts need the standard library only):

```sh
python3 -I beats_split.py                       # rewrites splits/beats.json, prints the seal
python3 -I beats_dev.py run <data root> <curves dir> <dev result json> rows.jsonl 8
python3 -I beats_dev.py report rows.jsonl out.md out.json
python3 -I beats_test.py
```

The curves are `_job/tune-6f83ba9c7df7-fsld+groove+guitarset+free-mixes/curves`, and the result file is `_job/dev-7311b4beee00.json` (split `dev`), both under the data root. A run takes under a minute on 8 workers.

## Generated tables

### Dev data

| set | tracks scored | refused by the truth rule | sources | beats after 5 s |
|---|---:|---:|---:|---:|
| groove | 180 | 0 | 5 | 26162 |
| guitarset | 90 | 0 | 3 | 4452 |
| fsld | 697 | 94 | 233 | 42300 |

### Scores per set, pooled over tracks

| group | tracks | method | F (70 ms) | F (40 ms) | CMLt | AMLt |
|---|---:|---|---|---|---|---|
| all | 967 | DP tracker, engine tempo | 64.2 [59.8, 68.6] | 58.7 [54.9, 62.6] | 54.8 [49.7, 59.8] | 77.7 [74.3, 80.9] |
| all | 967 | grid baseline, engine tempo | 58.6 [54.1, 63.8] | 47.7 [42.9, 52.7] | 51.1 [46.3, 56.1] | 70.6 [66.2, 75.1] |
| all | 967 | tracker minus baseline | 5.5 [1.6, 9.7] | 10.9 [6.1, 16.2] | 3.7 [-0.3, 7.8] | 7.2 [4.2, 10.2] |
| all | 967 | DP tracker, true tempo (diagnostic) | 70.9 [66.9, 74.6] | 64.4 [61.0, 67.9] | 71.4 [67.2, 75.3] | 86.7 [84.5, 88.8] |
| groove | 180 | DP tracker, engine tempo | 71.5 [57.9, 83.0] | 57.6 [46.6, 67.7] | 56.5 [37.1, 73.3] | 84.8 [76.5, 91.0] |
| groove | 180 | grid baseline, engine tempo | 75.0 [58.1, 87.4] | 65.9 [48.5, 76.5] | 63.9 [44.7, 79.2] | 85.4 [73.2, 94.1] |
| groove | 180 | tracker minus baseline | -3.6 [-7.0, 4.2] | -8.2 [-12.2, 4.0] | -7.4 [-10.0, -2.4] | -0.6 [-3.4, 7.0] |
| groove | 180 | DP tracker, true tempo (diagnostic) | 79.4 [68.7, 88.1] | 64.0 [56.1, 71.6] | 79.3 [67.2, 88.1] | 86.7 [80.7, 91.3] |
| guitarset | 90 | DP tracker, engine tempo | 59.1 [47.6, 73.0] | 51.2 [40.9, 63.8] | 50.2 [38.1, 65.6] | 68.2 [60.2, 78.9] |
| guitarset | 90 | grid baseline, engine tempo | 56.9 [44.5, 63.3] | 42.3 [34.4, 53.6] | 50.2 [38.7, 57.2] | 70.5 [63.3, 76.0] |
| guitarset | 90 | tracker minus baseline | 2.1 [-15.4, 12.1] | 8.9 [1.8, 14.6] | 0.0 [-16.5, 8.5] | -2.2 [-6.4, 2.9] |
| guitarset | 90 | DP tracker, true tempo (diagnostic) | 62.7 [51.0, 77.7] | 54.2 [44.6, 67.1] | 63.8 [51.1, 79.4] | 76.4 [69.0, 86.1] |
| fsld | 697 | DP tracker, engine tempo | 62.9 [58.7, 67.8] | 59.9 [55.5, 64.8] | 55.0 [49.8, 60.8] | 77.1 [73.6, 80.7] |
| fsld | 697 | grid baseline, engine tempo | 54.6 [50.8, 58.3] | 43.7 [39.9, 47.2] | 47.9 [43.9, 52.3] | 66.7 [62.8, 70.7] |
| fsld | 697 | tracker minus baseline | 8.3 [3.6, 13.5] | 16.1 [10.7, 22.0] | 7.0 [2.1, 12.1] | 10.4 [6.8, 13.8] |
| fsld | 697 | DP tracker, true tempo (diagnostic) | 69.7 [65.8, 74.1] | 65.8 [61.7, 70.3] | 70.4 [66.5, 74.7] | 88.0 [85.5, 90.5] |

### Scores per tempo band (true tempo)

| group | tracks | method | F (70 ms) | F (40 ms) | CMLt | AMLt |
|---|---:|---|---|---|---|---|
| under 90 | 127 | DP tracker, engine tempo | 55.2 [50.0, 59.1] | 46.5 [41.6, 50.9] | 8.2 [3.6, 14.1] | 74.2 [66.2, 80.6] |
| under 90 | 127 | grid baseline, engine tempo | 46.8 [40.9, 52.6] | 35.6 [27.2, 42.9] | 5.9 [2.1, 11.6] | 58.4 [48.4, 67.4] |
| under 90 | 127 | tracker minus baseline | 8.4 [1.9, 14.1] | 10.9 [2.0, 20.6] | 2.3 [-0.6, 5.6] | 15.8 [7.5, 24.1] |
| under 90 | 127 | DP tracker, true tempo (diagnostic) | 70.7 [60.9, 77.7] | 59.0 [51.2, 65.0] | 74.3 [64.7, 81.5] | 85.2 [79.0, 89.9] |
| 90-140 | 658 | DP tracker, engine tempo | 66.2 [61.0, 71.8] | 61.5 [56.9, 66.4] | 64.5 [58.6, 70.6] | 80.8 [77.0, 84.4] |
| 90-140 | 658 | grid baseline, engine tempo | 63.3 [57.7, 69.0] | 51.9 [46.4, 56.9] | 62.9 [57.0, 68.8] | 74.1 [68.7, 78.8] |
| 90-140 | 658 | tracker minus baseline | 2.8 [-2.2, 8.2] | 9.6 [3.9, 15.9] | 1.6 [-3.4, 7.0] | 6.7 [2.8, 10.9] |
| 90-140 | 658 | DP tracker, true tempo (diagnostic) | 69.5 [64.7, 74.3] | 64.3 [60.0, 68.8] | 70.0 [65.0, 74.7] | 87.4 [84.9, 89.7] |
| 140-165 | 124 | DP tracker, engine tempo | 65.2 [56.1, 74.7] | 59.3 [50.4, 68.3] | 61.1 [51.2, 71.7] | 70.2 [59.5, 80.2] |
| 140-165 | 124 | grid baseline, engine tempo | 53.3 [43.7, 65.1] | 46.9 [37.3, 58.9] | 50.3 [40.0, 63.1] | 65.2 [54.0, 76.5] |
| 140-165 | 124 | tracker minus baseline | 11.8 [2.4, 20.7] | 12.4 [1.5, 22.0] | 10.9 [1.2, 19.5] | 5.1 [-1.3, 11.8] |
| 140-165 | 124 | DP tracker, true tempo (diagnostic) | 74.3 [67.6, 80.2] | 67.1 [59.8, 74.3] | 74.1 [67.7, 79.9] | 84.3 [78.6, 90.0] |
| 165 and up | 58 | DP tracker, engine tempo | 58.8 [48.3, 70.9] | 51.9 [41.7, 64.8] | 33.4 [19.6, 48.6] | 66.9 [54.5, 78.9] |
| 165 and up | 58 | grid baseline, engine tempo | 42.4 [33.0, 53.8] | 29.3 [20.8, 39.9] | 18.7 [9.7, 30.3] | 68.4 [57.8, 77.8] |
| 165 and up | 58 | tracker minus baseline | 16.4 [5.0, 29.5] | 22.6 [10.6, 37.2] | 14.7 [4.5, 26.5] | -1.5 [-12.0, 8.8] |
| 165 and up | 58 | DP tracker, true tempo (diagnostic) | 79.8 [70.1, 89.2] | 70.9 [62.5, 81.7] | 75.7 [66.9, 85.6] | 87.6 [81.5, 94.5] |

### Scores by the engine tempo against the truth

| group | tracks | method | F (70 ms) | F (40 ms) | CMLt | AMLt |
|---|---:|---|---|---|---|---|
| right tempo | 732 | DP tracker, engine tempo | 71.6 [66.8, 76.0] | 66.5 [62.4, 70.6] | 71.8 [67.0, 76.3] | 88.3 [86.0, 90.5] |
| right tempo | 732 | grid baseline, engine tempo | 65.7 [60.6, 71.1] | 54.3 [49.1, 59.5] | 67.2 [62.0, 72.3] | 81.1 [77.3, 84.8] |
| right tempo | 732 | tracker minus baseline | 5.9 [0.6, 11.2] | 12.2 [6.3, 18.6] | 4.6 [-0.6, 9.9] | 7.2 [3.1, 11.5] |
| right tempo | 732 | DP tracker, true tempo (diagnostic) | 71.6 [66.8, 76.0] | 66.5 [62.4, 70.7] | 71.8 [67.0, 76.3] | 88.4 [86.0, 90.5] |
| octave | 125 | DP tracker, engine tempo | 54.2 [48.8, 58.8] | 45.4 [40.2, 49.9] | 0.0 [0.0, 0.0] | 78.8 [70.5, 85.6] |
| octave | 125 | grid baseline, engine tempo | 47.6 [42.2, 52.8] | 35.8 [27.2, 43.1] | 0.0 [0.0, 0.0] | 68.5 [59.5, 76.5] |
| octave | 125 | tracker minus baseline | 6.6 [1.5, 12.1] | 9.5 [2.1, 18.9] | 0.0 [0.0, 0.0] | 10.2 [1.5, 19.7] |
| octave | 125 | DP tracker, true tempo (diagnostic) | 72.0 [63.3, 79.1] | 60.3 [52.6, 67.1] | 73.1 [64.1, 81.0] | 86.4 [80.7, 91.3] |
| other | 92 | DP tracker, engine tempo | 31.1 [29.4, 32.9] | 25.9 [24.2, 27.8] | 4.9 [2.8, 7.4] | 7.2 [4.6, 10.3] |
| other | 92 | grid baseline, engine tempo | 28.9 [27.4, 30.4] | 20.7 [18.7, 22.9] | 2.6 [0.4, 5.2] | 3.0 [0.8, 5.6] |
| other | 92 | tracker minus baseline | 2.2 [0.5, 4.0] | 5.2 [2.2, 8.3] | 2.3 [1.0, 3.8] | 4.3 [2.7, 6.1] |
| other | 92 | DP tracker, true tempo (diagnostic) | 65.2 [54.8, 74.5] | 56.9 [47.3, 66.4] | 67.1 [56.7, 76.5] | 76.3 [67.8, 83.4] |
| no tempo | 18 | DP tracker, engine tempo | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| no tempo | 18 | grid baseline, engine tempo | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| no tempo | 18 | tracker minus baseline | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| no tempo | 18 | DP tracker, true tempo (diagnostic) | 62.8 [45.4, 76.9] | 43.0 [27.0, 58.4] | 65.7 [49.8, 80.3] | 74.8 [61.6, 86.6] |

### Timing bias

Median signed error of tracked beats matched within 70 ms, ms (positive is late): groove -21.2 · guitarset +9.0 · fsld -0.1.

### Realtime prediction

| tracks | lookahead s | predictions | median abs error ms | p90 abs error ms | within 20 ms % | within 40 ms % | beyond a quarter beat % | near the off-beat % |
|---|---:|---:|---|---|---|---|---:|---:|
| all | 0.0 | 70108 | 36 [26, 44] | 270 [248, 298] | 39.3 [34.9, 46.3] | 51.8 [48.2, 56.2] | 31.9 | 20.4 |
| all | 0.5 | 70077 | 38 [28, 46] | 270 [248, 298] | 38.4 [34.0, 45.7] | 50.8 [47.2, 55.2] | 31.9 | 20.4 |
| all | 1.0 | 70030 | 40 [29, 50] | 268 [247, 297] | 37.5 [33.0, 44.9] | 49.6 [45.9, 54.3] | 32.2 | 20.4 |
| all | 2.0 | 69027 | 46 [34, 56] | 270 [248, 296] | 35.6 [31.0, 43.2] | 47.5 [43.8, 52.5] | 32.8 | 20.2 |
| all | 4.0 | 65187 | 56 [42, 66] | 266 [246, 292] | 31.7 [27.0, 39.7] | 43.3 [39.5, 49.4] | 33.4 | 19.4 |
| right tempo | 0.0 | 51262 | 24 [16, 32] | 236 [217, 245] | 45.8 [40.2, 54.6] | 59.3 [54.7, 64.8] | 25.6 | 16.2 |
| right tempo | 0.5 | 51238 | 26 [16, 34] | 234 [217, 244] | 44.7 [39.1, 53.5] | 57.8 [53.2, 63.6] | 25.8 | 16.2 |
| right tempo | 1.0 | 51200 | 28 [16, 36] | 236 [218, 244] | 43.5 [37.8, 52.5] | 56.5 [51.7, 62.4] | 26.2 | 16.3 |
| right tempo | 2.0 | 50463 | 32 [19, 42] | 236 [222, 244] | 41.6 [36.0, 50.8] | 54.1 [49.2, 60.6] | 26.7 | 16.3 |
| right tempo | 4.0 | 47535 | 42 [24, 52] | 236 [224, 242] | 37.0 [31.2, 46.9] | 49.5 [44.2, 57.0] | 27.6 | 15.7 |
| groove | 0.0 | 27282 | 44 [34, 60] | 310 [171, 354] | 27.3 [25.4, 32.1] | 47.5 [42.9, 56.9] | 33.3 | 21.2 |
| groove | 0.5 | 27251 | 46 [36, 62] | 306 [173, 350] | 26.4 [24.6, 31.5] | 45.9 [41.6, 54.7] | 33.3 | 20.9 |
| groove | 1.0 | 27204 | 50 [38, 66] | 306 [177, 348] | 25.1 [23.3, 29.6] | 43.8 [39.7, 51.8] | 33.7 | 20.8 |
| groove | 2.0 | 26986 | 56 [44, 72] | 302 [184, 344] | 22.9 [21.4, 26.0] | 40.5 [36.9, 47.1] | 34.0 | 20.2 |
| groove | 4.0 | 26266 | 70 [54, 82] | 294 [190, 336] | 18.7 [17.5, 20.6] | 34.3 [31.9, 39.2] | 34.7 | 19.0 |
| guitarset | 0.0 | 4338 | 78 [44, 112] | 282 [260, 298] | 23.7 [20.1, 29.8] | 38.2 [32.1, 48.1] | 41.7 | 22.5 |
| guitarset | 0.5 | 4338 | 82 [48, 106] | 282 [264, 296] | 21.9 [17.9, 28.5] | 36.6 [31.1, 46.8] | 41.2 | 21.6 |
| guitarset | 1.0 | 4338 | 86 [52, 112] | 278 [258, 296] | 20.4 [16.1, 26.9] | 34.4 [28.6, 43.8] | 41.2 | 21.6 |
| guitarset | 2.0 | 4236 | 92 [58, 116] | 276 [256, 290] | 18.2 [13.7, 25.5] | 31.7 [25.8, 41.4] | 41.1 | 21.3 |
| guitarset | 4.0 | 3876 | 98 [66, 120] | 272 [266, 282] | 14.2 [10.7, 19.7] | 27.4 [20.8, 36.3] | 40.2 | 18.4 |
| fsld | 0.0 | 38488 | 20 [14, 33] | 248 [232, 270] | 49.5 [44.9, 54.4] | 56.4 [51.7, 61.2] | 29.8 | 19.6 |
| fsld | 0.5 | 38488 | 22 [14, 34] | 248 [232, 270] | 48.8 [44.1, 53.7] | 55.9 [51.3, 60.6] | 29.9 | 19.8 |
| fsld | 1.0 | 38488 | 24 [16, 36] | 248 [234, 268] | 48.1 [43.6, 52.7] | 55.4 [51.0, 60.1] | 30.1 | 19.9 |
| fsld | 2.0 | 37805 | 28 [18, 40] | 248 [238, 271] | 46.6 [42.1, 51.5] | 54.2 [49.9, 58.9] | 31.0 | 20.1 |
| fsld | 4.0 | 35045 | 34 [24, 49] | 248 [238, 270] | 43.3 [39.0, 47.9] | 51.8 [47.6, 56.2] | 31.7 | 19.9 |

Instants with no prediction (no engine reading yet, or no beat tracked): 440.
