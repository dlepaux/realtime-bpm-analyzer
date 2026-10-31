## The second sweep: no pick, no second look

**The library defaults in `src/` are still the first pick (110 BPM, 0.7 octaves, third 0.2), which fails the fast-tempo guard, and must not ship.** The first look is spent and the second is unused: the volume's log holds one RBA-51 line.

The guard, written into `lib/sweep.ts` before results, is peaks on clean dev, real path: 140 to 165 BPM at least 92 of 170, 165 and up at least 22 of 90. Its floors are dev only. The rule is `pickWithGuard`. `pick.ts` exits 1 when the pick holds `priorBpm` or `priorOctaves` at the end of what was measured. What stops a look in code is `pickedConfiguration`, still null.

**What the first look shaped, declared:** the rule itself, its two bands, the band edges at 150 and 156, and the choice to evaluate the 90 to 180 range all come from the first look's findings, by way of the brief and my reading of them. No tuned value or floor does. Neither fresh set is fresh any more.

Two sweeps on dev, 2118 rows, two ranges, plans `job/sweep-plan-tune-2.json` and `job/sweep-plan.json`:

```sh
./benchmark/run.sh pick results/rba-51-sweep-2.jsonl,results/rba-51-sweep-3.jsonl   # exits 1
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

The fast material is 170 tracks in 68 groups (largest 7.1%, 92 electronic) and 90 tracks in 38 groups (largest 13.3%, 50 electronic), above the threshold posted on the RBA-51 card before counting. Those are loops, not full mixes. 36 of the 90 fast tracks are labelled 180 and up and cannot read true in 90 to 180. No further tempo-labelled full-mix electronic data with a clean per-item licence was found.

Real path on dev, image `sha256:9b45b33b…`, run `rba-51-dev-ridge`, `results/rba-51-dev-ridge.json`, 90 to 180 for every tempogram. Peaks has its lowpass and folds into 90 to 180. These sets chose these values, so this is not an estimate of unseen music. `ridge-80-reset` has the extension's `continuousAnalysis: true` and `stabilizationTime: 10_000`: **its coverage is 0.0, no track ever gets a stable reading**, and its Acc1 falls 6.2 points. Its false-stable of 100.0 is the convention for a configuration with no stable reading, not a measurement.


**Acc1**

| | tracks | peaks | 285 | first | ridge-50 | ridge-80 | ridge-100 | ridge-80-reset |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| fsld | 791 | 54.7 | 71.0 | 72.9 | 74.3 | 74.3 | 74.5 | 73.1 |
| groove | 221 | 52.9 | 66.1 | 71.9 | 72.4 | 72.4 | 73.3 | 67.4 |
| guitarset | 180 | 14.4 | 67.8 | 72.8 | 77.2 | 76.7 | 76.1 | 64.4 |
| **clean, macro** | 1192 | 40.7 | 68.3 | 72.6 | 74.7 | 74.5 | 74.6 | 68.3 |
| under 120, clean | 542 | 41.5 | 54.6 | 69.7 | 69.4 | 69.4 | 69.4 | 63.8 |
| 120-140, clean | 390 | 60.8 | 87.4 | 88.2 | 86.4 | 86.4 | 86.4 | 84.1 |
| 140-150, clean | 128 | 59.4 | 92.2 | 76.6 | 77.3 | 77.3 | 81.3 | 74.2 |
| 150-156, clean | 22 | 27.3 | 95.5 | 86.4 | 90.9 | 90.9 | 90.9 | 81.8 |
| 156-165, clean | 20 | 50.0 | 75.0 | 60.0 | 75.0 | 75.0 | 70.0 | 75.0 |
| 140-165, clean | 170 | 54.1 | 90.6 | 75.9 | 78.8 | 78.8 | 81.2 | 75.3 |
| 165+, clean | 90 | 24.4 | 43.3 | 17.8 | 44.4 | 43.3 | 41.1 | 45.6 |

**Acc2**

| | tracks | peaks | 285 | first | ridge-50 | ridge-80 | ridge-100 | ridge-80-reset |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| fsld | 791 | 63.8 | 81.3 | 82.3 | 86.0 | 86.0 | 86.2 | 84.8 |
| groove | 221 | 67.0 | 87.3 | 92.3 | 95.0 | 95.0 | 95.5 | 89.1 |
| guitarset | 180 | 16.7 | 84.4 | 81.1 | 87.8 | 87.2 | 86.1 | 72.8 |
| **clean, macro** | 1192 | 49.2 | 84.4 | 85.2 | 89.6 | 89.4 | 89.3 | 82.2 |
| under 120, clean | 542 | 57.6 | 80.4 | 86.9 | 91.5 | 91.5 | 91.1 | 85.2 |
| 120-140, clean | 390 | 60.8 | 87.4 | 88.2 | 86.4 | 86.4 | 86.4 | 84.1 |
| 140-150, clean | 128 | 59.4 | 92.2 | 76.6 | 77.3 | 77.3 | 81.3 | 74.2 |
| 150-156, clean | 22 | 27.3 | 95.5 | 86.4 | 90.9 | 90.9 | 90.9 | 81.8 |
| 156-165, clean | 20 | 50.0 | 75.0 | 60.0 | 75.0 | 75.0 | 70.0 | 75.0 |
| 140-165, clean | 170 | 54.1 | 90.6 | 75.9 | 78.8 | 78.8 | 81.2 | 75.3 |
| 165+, clean | 90 | 46.7 | 63.3 | 63.3 | 90.0 | 88.9 | 87.8 | 90.0 |

**False-stable**

| | tracks | peaks | 285 | first | ridge-50 | ridge-80 | ridge-100 | ridge-80-reset |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| fsld | 791 | 37.9 | 18.2 | 16.1 | 18.8 | 18.2 | 17.0 | – |
| groove | 221 | 38.5 | 31.0 | 28.4 | 26.4 | 26.4 | 26.3 | – |
| guitarset | 180 | 59.0 | 30.6 | 24.8 | 25.7 | 26.2 | 26.8 | – |
| **clean, macro** | 1192 | 45.1 | 26.6 | 23.1 | 23.6 | 23.6 | 23.3 | 100.0 |
| under 120, clean | 542 | 45.9 | 38.2 | 25.7 | 28.5 | 28.2 | 27.4 | – |
| 120-140, clean | 390 | 25.3 | 7.7 | 6.8 | 8.6 | 8.1 | 7.6 | – |
| 140-150, clean | 128 | 38.9 | 1.1 | 7.3 | 6.9 | 6.8 | 7.3 | – |
| 150-156, clean | 22 | 43.2 | 0.0 | 7.1 | 0.0 | 0.0 | 0.0 | – |
| 156-165, clean | 20 | 37.1 | 7.7 | 33.3 | 7.1 | 7.1 | 7.7 | – |
| 140-165, clean | 170 | 39.0 | 1.6 | 10.2 | 6.0 | 5.9 | 6.4 | – |
| 165+, clean | 90 | 65.5 | 56.8 | 84.0 | 56.6 | 57.1 | 61.9 | – |

**Coverage**

| | tracks | peaks | 285 | first | ridge-50 | ridge-80 | ridge-100 | ridge-80-reset |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| fsld | 791 | 72.7 | 69.2 | 73.8 | 79.8 | 80.2 | 75.7 | 0.0 |
| groove | 221 | 68.8 | 91.9 | 97.3 | 96.8 | 96.4 | 95.5 | 0.0 |
| guitarset | 180 | 26.1 | 72.8 | 76.1 | 75.6 | 76.1 | 75.6 | 0.0 |
| **clean, macro** | 1192 | 55.9 | 77.9 | 82.4 | 84.1 | 84.2 | 82.3 | 0.0 |
| under 120, clean | 542 | 60.5 | 72.7 | 82.3 | 86.2 | 85.4 | 83.2 | 0.0 |
| 120-140, clean | 390 | 70.0 | 82.3 | 85.6 | 82.8 | 84.1 | 83.1 | 0.0 |
| 140-150, clean | 128 | 73.4 | 71.9 | 63.3 | 67.2 | 68.0 | 63.3 | 0.0 |
| 150-156, clean | 22 | 36.4 | 77.3 | 63.6 | 72.7 | 72.7 | 63.6 | 0.0 |
| 156-165, clean | 20 | 75.0 | 65.0 | 60.0 | 70.0 | 70.0 | 65.0 | 0.0 |
| 140-165, clean | 170 | 68.8 | 71.8 | 62.9 | 68.2 | 68.8 | 63.5 | 0.0 |
| 165+, clean | 90 | 62.2 | 48.9 | 54.4 | 83.3 | 84.4 | 70.0 | 0.0 |
