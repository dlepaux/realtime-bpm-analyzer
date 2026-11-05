# RBA-106: v6 hysteresis on dev

Do the hysteresis defaults (`HYSTERESIS` in `src/contract/types.ts`, read by `core/tracker.ts` and the tempogram's stable rule) hold up on the benchmark, or should they move? Measured on the dev half only: the 9622 tracks of the ensemble study's scope (free mixes strict 4804, contested 3626, fsld 791, groove 221, guitarset 180), real path, 90 to 180, free mixes on their first 60 s. No held-out track, label or output was read.

Source: one dev job, `hysteresis` mode, on image `sha-006349573d4df509706b4ebd1cc24387e88deedf` (digest `sha256:04285d9bb7e6f292d7077933ca1133a39f082ea0b33aab0ffb66125e0112b1b0`), library at #323's 1c46710 plus a814f87 (debug-only frame tempo). 19,244 runs, none skipped. The tempogram ran once per track with its trace, and each of its 1360 grid rows was replayed through the library's own tracker. The job checks on every track that the replayed stable rule matches the engine's own lock offers. Peaks ran 10 real sessions per track, one field at a time, because its `onReadingLost` feeds the tracker back into the engine. The pick rule is `lib/hysteresis-pick.ts`, committed in 0063495 before the job ran. These tables are its aggregate report, printed by `python3 -I benchmark/hysteresis_table.py <hysteresis-report.json>`. Ranges: 95% percentile, 1000 draws resampling artists within each set. Every row is scored on the same draws, so differences between rows are paired.

## Measures

- **Lock coverage**: the share of tracks that ever lock.
- **Right when locked**: the share of first locks that are right (Acc1, 4%).
- **False-locked**: the share of locked time spent on a wrong reading.
- **Flapping**: moves from locked to settling per minute of audio, on tracks whose label is one steady tempo (fsld's loops and the strict free mixes, 5595 tracks). On those tracks such a move is noise, not a tempo change.
- **Lock to listening**: moves from locked to listening (a lost pulse) per minute, on the same tracks. The pick rule does not read it, but it shows up below.
- **First lock**: the median and the 90th percentile, in seconds of audio, over tracks that lock. Locks land on analysis frames, so the median takes a few discrete values and its range has zero width.

## Rule and grid

The rule, per engine, against the contract's row: a row is eligible when, beyond the noise, it does not flap more, its median first lock is not later, and it locks no fewer tracks. The best row is the eligible one with the lowest false-locked share. The pick is the eligible row within the noise of the best on false-locked that is interior (no field at an edge of its axis), then moves the fewest fields, then has the lowest false-locked share. A pick at an edge means the grid must be extended before it is used.

Tempogram grid, full product with `unlockBand` above `lockBand`: `lockBand` 0.01, 0.015, 0.02, 0.03, 0.04; `lockAfterSeconds` 4, 6, 8, 10, 12; `unlockBand` 0.03, 0.04, 0.06, 0.08; `unlockAfterSeconds` and `pulseLostAfterSeconds` 1, 2, 3, 5. Peaks grid: one field at a time around the contract, on `unlockBand`, `unlockAfterSeconds` and `pulseLostAfterSeconds` with the same values. Peaks keeps its own lock rule, so the lock fields don't reach it.

## Outcome: the contract's values stay

- **Tempogram** (the default engine): the rule picks `pulseLostAfterSeconds` 3, bracketed, every other field at the contract's value. Against the contract it changes no measure at the precision shown: false-locked -0.0002 points [-0.0006, 0]. The contract's own row misses the "within the noise of the best" set by 0.00005 points. Paired draws are almost identical, so even that tiny gap is "beyond the noise". On the tempogram, every `unlockBand` and `pulseLostAfterSeconds` value measures the same. `lockAfterSeconds` is the one real trade. At 4 s the first lock comes 4 s sooner, but flapping goes up by a third and right-when-locked drops 0.9 points. At 12 s it is the reverse. Only 8 is eligible.
- **Peaks**: the rule picks `pulseLostAfterSeconds` 1, at the edge of its axis, so by the rule it can't be used as is. It cuts false-locked by 0.16 points [0.09, 0.23] and flapping by 0.022 per minute. But it raises drops to listening from 0.32 to 1.17 per steady minute (+0.85 [+0.78, +0.92]): about one lost lock every 51 s of steady music. The rule doesn't read that measure. Extending the axis below 1 s would push further the same way.
- **Shared values**: the library has one `HYSTERESIS` for both engines. The tempogram's pick changes nothing measurable, and peaks' pick is unbracketed and costs it far more lost locks. The contract's row is eligible for both by construction. So the defaults are kept as they are, and the grid is not extended for peaks. This is a judgement on top of the committed per-engine rule, stated here and in the PR.
- **A trade the rule can't make**: a longer `unlockAfterSeconds` cuts flapping on both engines for a tiny false-locked cost. Tempogram at 5 s: flapping 0.016 against 0.027 per minute (-0.012 [-0.015, -0.008]), false-locked +0.07 points [+0.05, +0.08]. Peaks at 5 s: 0.26 against 0.55 per minute, false-locked +0.03 points. A rule that minimises false-locked will never pick it. Whether steadier locks are worth slower unlocks after a real tempo change is a product call. This sweep can't measure that, because its steady tracks have no tempo change.

## tempogram

9622 dev tracks, 5595 with a steady label. 1360 rows, 408 eligible, 7 within the noise of the best on false-locked. Pick bracketed: yes. Pick less best on false-locked: +0.00 [-0.00, +0.01] points.

| row | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| contract (base): lock band 0.02, lock after s 8, unlock band 0.04, unlock after s 2, pulse lost after s 2 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| best: lock band 0.02, lock after s 8, unlock band 0.03, unlock after s 2, pulse lost after s 5 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.028 [0.023, 0.033] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| pick: lock band 0.02, lock after s 8, unlock band 0.04, unlock after s 2, pulse lost after s 3 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |

Paired against the contract's row:

| row | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| best | +0.0 [+0.0, +0.0] | +0.0 [+0.0, +0.0] | -0.0 [-0.0, -0.0] | +0.001 [+0.000, +0.001] | +0.000 [+0.000, +0.000] | +0.0 [+0.0, +0.0] | +0.0 [+0.0, +0.0] | |
| pick | +0.0 [+0.0, +0.0] | +0.0 [+0.0, +0.0] | -0.0 [-0.0, +0.0] | +0.000 [+0.000, +0.000] | +0.000 [+0.000, +0.000] | +0.0 [+0.0, +0.0] | +0.0 [+0.0, +0.0] | |

lock band, other fields at the pick:

| lock band | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| 0.01 | 86.9 [85.9, 87.8] | 84.9 [83.8, 86.0] | 13.2 [12.1, 14.3] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [28.0, 30.6] | no |
| 0.015 | 87.1 [86.1, 87.9] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.3] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | no |
| 0.02 (pick) | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 0.03 | 87.1 [86.2, 88.0] | 84.7 [83.6, 85.8] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.033] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |

lock after s, other fields at the pick:

| lock after s | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| 4 | 87.8 [86.9, 88.6] | 83.9 [82.7, 85.0] | 13.6 [12.6, 14.7] | 0.036 [0.030, 0.042] | 0.000 [0.000, 0.001] | 7.5 [7.5, 7.5] | 27.6 [26.6, 29.1] | no |
| 6 | 87.3 [86.4, 88.2] | 84.4 [83.3, 85.5] | 13.5 [12.4, 14.5] | 0.030 [0.025, 0.036] | 0.000 [0.000, 0.001] | 9.6 [9.6, 9.6] | 28.0 [27.0, 29.5] | no |
| 8 (pick) | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 10 | 86.7 [85.8, 87.6] | 85.1 [84.0, 86.2] | 13.1 [12.0, 14.2] | 0.023 [0.019, 0.028] | 0.000 [0.000, 0.001] | 13.6 [13.6, 13.6] | 29.5 [28.5, 31.0] | no |
| 12 | 86.2 [85.2, 87.1] | 85.7 [84.6, 86.8] | 12.9 [11.8, 13.9] | 0.020 [0.017, 0.025] | 0.000 [0.000, 0.001] | 15.5 [15.5, 15.5] | 31.6 [30.0, 32.5] | no |

unlock band, other fields at the pick:

| unlock band | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| 0.03 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.028 [0.023, 0.033] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 0.04 (pick) | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 0.06 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.3, 14.4] | 0.026 [0.021, 0.031] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 0.08 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.4 [12.3, 14.4] | 0.026 [0.021, 0.031] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |

unlock after s, other fields at the pick:

| unlock after s | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| 1 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.3] | 0.034 [0.028, 0.040] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | no |
| 2 (pick) | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 3 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.4 [12.3, 14.4] | 0.021 [0.016, 0.024] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 5 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.4 [12.3, 14.4] | 0.016 [0.012, 0.019] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |

pulse lost after s, other fields at the pick:

| pulse lost after s | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| 1 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.001 [0.000, 0.002] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 2 (contract) | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 3 (pick) | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |
| 5 | 87.1 [86.2, 88.0] | 84.8 [83.6, 85.9] | 13.3 [12.2, 14.4] | 0.027 [0.022, 0.032] | 0.000 [0.000, 0.001] | 11.5 [11.5, 11.5] | 29.1 [27.6, 30.6] | yes |

## peaks

9622 dev tracks, 5595 with a steady label. 10 rows, 6 eligible, 1 within the noise of the best on false-locked. Pick bracketed: no, at the edge of pulseLostAfterSeconds. Pick less best on false-locked: +0.00 [+0.00, +0.00] points.

| row | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| contract (base): lock band 0.02, lock after s 8, unlock band 0.04, unlock after s 2, pulse lost after s 2 | 91.6 [90.8, 92.4] | 60.4 [58.8, 61.8] | 30.4 [29.0, 31.8] | 0.551 [0.510, 0.592] | 0.323 [0.296, 0.352] | 10.0 [10.0, 10.0] | 32.1 [31.1, 33.2] | yes |
| best: lock band 0.02, lock after s 8, unlock band 0.04, unlock after s 2, pulse lost after s 1 | 92.2 [91.4, 92.9] | 60.2 [58.6, 61.6] | 30.2 [28.8, 31.7] | 0.529 [0.489, 0.570] | 1.174 [1.093, 1.266] | 10.0 [10.0, 10.0] | 31.2 [30.2, 32.4] | yes |
| pick: lock band 0.02, lock after s 8, unlock band 0.04, unlock after s 2, pulse lost after s 1 | 92.2 [91.4, 92.9] | 60.2 [58.6, 61.6] | 30.2 [28.8, 31.7] | 0.529 [0.489, 0.570] | 1.174 [1.093, 1.266] | 10.0 [10.0, 10.0] | 31.2 [30.2, 32.4] | yes |

Paired against the contract's row:

| row | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| best | +0.6 [+0.4, +0.7] | -0.2 [-0.5, +0.0] | -0.2 [-0.2, -0.1] | -0.022 [-0.027, -0.016] | +0.851 [+0.784, +0.923] | +0.0 [+0.0, +0.0] | -0.9 [-1.3, -0.5] | |
| pick | +0.6 [+0.4, +0.7] | -0.2 [-0.5, +0.0] | -0.2 [-0.2, -0.1] | -0.022 [-0.027, -0.016] | +0.851 [+0.784, +0.923] | +0.0 [+0.0, +0.0] | -0.9 [-1.3, -0.5] | |

pulse lost after s, other fields at the pick:

| pulse lost after s | lock coverage % | right when locked % | false-locked % of locked time | flapping /min (steady) | lock to listening /min (steady) | first lock median s | first lock p90 s | eligible |
|---|---|---|---|---|---|---|---|---|
| 1 (pick) | 92.2 [91.4, 92.9] | 60.2 [58.6, 61.6] | 30.2 [28.8, 31.7] | 0.529 [0.489, 0.570] | 1.174 [1.093, 1.266] | 10.0 [10.0, 10.0] | 31.2 [30.2, 32.4] | yes |
| 2 (contract) | 91.6 [90.8, 92.4] | 60.4 [58.8, 61.8] | 30.4 [29.0, 31.8] | 0.551 [0.510, 0.592] | 0.323 [0.296, 0.352] | 10.0 [10.0, 10.0] | 32.1 [31.1, 33.2] | yes |
| 3 | 91.1 [90.3, 91.9] | 60.6 [59.0, 62.0] | 30.4 [29.0, 31.8] | 0.549 [0.507, 0.590] | 0.166 [0.147, 0.185] | 10.0 [10.0, 10.0] | 32.2 [31.4, 33.4] | no |
| 5 | 90.6 [89.7, 91.4] | 60.6 [59.1, 62.1] | 30.3 [28.9, 31.7] | 0.545 [0.503, 0.585] | 0.076 [0.066, 0.087] | 10.0 [10.0, 10.0] | 32.3 [31.4, 33.5] | no |
