# RBA-106: peaks and the 5.5.0 tempogram run together, dev only

Can the two engines run side by side and work as one: agreement as a confidence, peaks as a fallback where the tempogram does not lock, a tie-break when they read half or double of each other? Measured on the dev half only, the 9622 tracks of retune2's dev scope (free mixes strict 4804, contested 3626, fsld 791, groove 221, guitarset 180), real path, 90 to 180, free mixes on their first 60 s. No held-out track, label or output was read.

Source: a dev job on image sha-7311b4b (this branch). It is retune2's A2 run (`dev-61446af818ac.json`) again, and the harness now also records each engine's last five candidates with their confidence, plus every change of its top tempo. Its finals match A2's on all 9622 tracks for both engines. The peaks bpmStable timeline differs: #321 (peaks waits 10 s before bpmStable) landed on main after A2. So this run is what ships today. Every number that does not read peaks' locks is identical in the two files. The two outputs differ only in rows that read peaks' locks. The headline ones move by less than one point. One moves more: peaks' lock where the tempogram has none is right 29.8% here, against 24.9% under A2. Per-track output stays on the box. Made by `python3 -I benchmark/ensemble.py <dev.json>`. Ranges: 95% percentile, 4000 draws resampling whole groups (artists for the free mixes) within each set, the method of `lib/pass-bar.ts`, drawn from Python's seeded generator, so they are not draw-for-draw the TypeScript reports'.

Cross-check: the script reproduces rba-51-retune2-dev.md's tempogram numbers from its own counting: free mixes strict Acc1 87.4, Acc2 92.1, lock coverage 89.3; contested Acc1 77.3. Its rules are tested in `benchmark/ensemble_test.py` (`python3 -I benchmark/ensemble_test.py`), which CI does not run.

Two definitions carry the report:

- **Coverage** in the RBA-51 reports (89.2% held-out, 89.3% dev, strict) is the share of tracks with a bpmStable lock. The tempogram gives *some* reading on 99.8% of dev tracks. So the coverage gap is a gap in locks, and the fallback below is peaks' lock.
- **Agreement** compares the two final readings: within 2%, within 4% (2 to 4% shown apart), half or double (ratio 2 within 2%), other, one engine alone.

## Answers

**1. Agreement.** The final readings agree within 2% on 70.4% [69.0, 71.8] of dev tracks and within 4% on 71.6% [70.2, 72.9]. Strict: 74.5 and 75.5. Contested: 70.8 and 72.2. Half or double is rare, 0.4% [0.2, 0.5], because both engines fold into 90 to 180, a single octave: two readings an octave apart must sit at its two edges. Most disagreements are other ratios (20.7%): 3/2 on 354 tracks, 3/4 on 283, 4/3 on 90, no simple ratio on 1226. Agreement within 4%, free mixes, both tiers: 52.6% under 90, 80.6% at 90-140, 69.8% at 140-165, 59.5% at 165-180, 54.4% over 180. The per-tier band rows are in the tables.

**2. Separation.** When the engines agree within 2%, the reading is right (Acc1) 90.0% [89.0, 90.9] of the time (strict 93.4, contested 86.9), and Acc2 97.2. When they disagree otherwise, the tempogram is right 62.8% [60.4, 65.3] and peaks 8.7% [7.4, 10.1]: a disagreement is mostly peaks being wrong. Half or double: tempogram 44.1, peaks 47.1, on 34 tracks. Between 2 and 4% apart: about 58%. Agreement means nothing outside 90 to 180: there both engines fold the same way, so under 90 an agreeing reading is right 15.3% (Acc2 holds). As a ranking of the tempogram's reading, agreement scores AUROC 0.684 [0.668, 0.700]. That beats "the tempogram sent bpmStable" (0.641) by 0.044 [0.028, 0.059]. Lock agreement (both locked within 4%) scores 0.702.

**3. Fallback.** On the 942 dev tracks (9.8%) where peaks locks and the tempogram doesn't, peaks' lock is right 29.8% [26.8, 32.9] (strict 33.8, contested 21.6). The tempogram's own unlocked final reading is right on 50.7% of those same tracks. A plain fallback raises lock coverage from 87.1 to 96.9% (strict 89.3 to 97.6). Lock Acc1 over all tracks gains +2.9 [+2.6, +3.3]. But the right share among shown locks drops from 84.8 to 79.2 (strict 89.0 to 84.3). A **confirmed** fallback shows peaks' lock only once the tempogram's current reading agrees within 4%, measured causally from the reading timeline. It reaches 92.6% coverage (strict 94.2, near peaks' own lock coverage: 93.6 on dev in rba-51-retune2-dev.md, before #321, and 94.7 held-out) and +3.0 [+2.6, +3.3] lock Acc1 over all tracks. The right share among locked tracks costs -1.8 [-2.1, -1.5] (strict -1.2, contested -2.7). The locks it adds are right only about 55% of the time.

**4. Tie-break.** Only 34 dev tracks disagree by half or double, and no rule is reliably right. Always tempogram gets 44.1% [27.5, 62.2], always peaks or always faster 47.1, slower 44.1, the locked engine 41.2. Strict and contested point opposite ways: tempogram 64.3 on strict, peaks 75.0 on contested. The split-half check fits on one half of the artists and scores on the other. It picks a different rule on each half, and both picks score no better than always taking the tempogram on the other half. Any rule fitted here would fit noise. With 34 tracks and five rules, the best-looking rule is chosen mostly by chance. The disagreement that matters is the 20.7% "other" class, and there the tempogram wins 62.8 to 8.7, with no rule needed.

**5. Over time.** The tempogram's first lock is right 84.8% [83.7, 85.8] on all dev (strict 89.0, contested 80.7). The brief's 81% matches the contested tier, not all dev. The two engines' locks ever agree within 4% on 71.9% of tracks. The first agreement is right 89.0% [88.0, 89.9]. On those same tracks the tempogram's first lock is right 87.7%, so the paired gain is +1.2 [+1.0, +1.5]. Most of the headline gap is selection: agreement happens on easier tracks. It also comes later: median 13.7 s against 11.5 s for the tempogram's first lock (its first reading comes at 4.1 s). It comes strictly after that lock on 39.1% of tracks. The first agreement of the readings within 2% comes at 10.4 s median, on 85.4% of tracks, and is right only 82.4%: below the first lock.

**6. Own confidence.** The tempogram's own final confidence ranks its reading at AUROC 0.761 [0.743, 0.778] (strict 0.799, contested 0.766, clean sets 0.606). That beats agreement by 0.077 [0.057, 0.095]. Agreement added on top of it (agreement first, confidence within each class) gives +0.007 [-0.005, 0.020]: nothing measurable. Its fifths are monotone: Acc1 56.8, 78.2, 89.3, 92.2, 94.5 from the lowest fifth to the highest. That is what RBA-106 needs to calibrate. Peaks' own confidence ranks peaks' reading at 0.796. There, agreement does better than peaks' own score, by +0.055 [0.042, 0.067]: the tempogram is a good judge of peaks, but peaks is a poor judge of the tempogram.

## What this says

- Running both does not make a better reading. Where they disagree the tempogram is right seven times as often as peaks, and half or double disagreements are too few to tune a tie-break on.
- Agreement is a real signal, but a weaker one than the tempogram's own confidence, and it adds nothing measurable on top of it. RBA-106 can calibrate the tempogram's own score on its own.
- The coverage gap can be closed only at a price: a confirmed peaks fallback brings strict lock coverage from 89.3 to 94.2%, and costs 1.2 points of right-when-locked there. Is that trade worth running peaks? That is a product call. Peaks' cost grows over the first minutes (rba-51-browser-cost.md).
- Not measured here: whether loosening the tempogram's own lock rule buys the same coverage more cheaply, without running peaks.
- Every rule above is fixed on dev. A held-out check of any of them would be a second look at the free mixes, and needs its own DECISION on RBA-106.

## Tables
Tracks: 9622 per engine, 3003 groups. Ranges: 95% percentile, 4000 draws resampling groups within each set. Confidence values present, reading timeline present.

### Q1. How often the two final readings agree

Share of tracks, % [95% range]. `within 2%` and `within 4%` are cumulative; `half or double` is a ratio of 2 within 2%.

| scope | tracks | within 2% | within 4% | half or double | other disagreement | tempogram only | peaks only | neither |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| all dev | 9622 | 70.4 [69.0, 71.8] | 71.6 [70.2, 72.9] | 0.4 [0.2, 0.5] | 20.7 [19.6, 21.9] | 7.1 [6.4, 7.9] | 0.2 [0.1, 0.3] | 0.1 [0.0, 0.1] |
| free mixes, strict | 4804 | 74.5 [72.6, 76.4] | 75.5 [73.6, 77.4] | 0.3 [0.1, 0.5] | 19.9 [18.4, 21.6] | 4.1 [3.4, 5.0] | 0.1 [0.0, 0.2] | 0.0 [0.0, 0.1] |
| free mixes, contested | 3626 | 70.8 [68.5, 73.0] | 72.2 [70.0, 74.3] | 0.4 [0.2, 0.7] | 22.8 [21.0, 24.6] | 4.4 [3.4, 5.5] | 0.1 [0.0, 0.3] | 0.1 [0.0, 0.2] |
| fsld + groove + guitarset | 1192 | 52.9 [48.5, 57.0] | 53.8 [49.5, 57.8] | 0.3 [0.1, 0.7] | 17.5 [14.7, 20.5] | 27.6 [24.1, 31.4] | 0.7 [0.2, 1.2] | 0.1 [0.0, 0.3] |
| under 90, free mixes, strict | 251 | 53.4 [47.0, 59.7] | 55.0 [48.5, 61.2] | 3.2 [1.2, 5.6] | 34.3 [28.3, 40.6] | 7.6 [4.4, 11.1] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| 90-140, free mixes, strict | 3092 | 80.3 [78.4, 82.2] | 81.4 [79.5, 83.2] | 0.1 [0.0, 0.2] | 14.2 [12.7, 15.8] | 4.2 [3.3, 5.2] | 0.1 [0.0, 0.3] | 0.1 [0.0, 0.2] |
| 140-165, free mixes, strict | 1168 | 68.6 [65.0, 72.2] | 69.3 [65.7, 72.9] | 0.0 [0.0, 0.0] | 27.9 [24.6, 31.3] | 2.8 [1.8, 4.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| 165-180, free mixes, strict | 226 | 59.3 [49.5, 69.0] | 61.1 [52.0, 70.2] | 0.9 [0.0, 2.4] | 32.7 [24.7, 41.1] | 5.3 [2.3, 9.1] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| over 180, free mixes, strict | 67 | 40.3 [28.1, 52.5] | 40.3 [28.1, 52.5] | 3.0 [0.0, 7.6] | 49.3 [37.2, 61.5] | 7.5 [1.6, 14.3] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| under 90, free mixes, contested | 97 | 45.4 [34.5, 55.9] | 46.4 [35.6, 57.0] | 1.0 [0.0, 3.5] | 41.2 [31.4, 51.9] | 10.3 [4.5, 16.9] | 0.0 [0.0, 0.0] | 1.0 [0.0, 3.5] |
| 90-140, free mixes, contested | 1942 | 78.1 [75.6, 80.3] | 79.2 [77.0, 81.4] | 0.2 [0.0, 0.4] | 16.5 [14.5, 18.4] | 4.0 [3.0, 5.1] | 0.1 [0.0, 0.3] | 0.0 [0.0, 0.0] |
| 140-165, free mixes, contested | 959 | 69.6 [65.9, 73.1] | 70.4 [66.8, 73.8] | 0.0 [0.0, 0.0] | 26.0 [22.8, 29.2] | 3.4 [2.3, 4.7] | 0.2 [0.0, 0.5] | 0.0 [0.0, 0.0] |
| 165-180, free mixes, contested | 204 | 55.4 [47.2, 63.6] | 57.8 [50.0, 65.9] | 0.5 [0.0, 1.6] | 34.8 [27.6, 42.4] | 6.9 [3.6, 10.5] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| over 180, free mixes, contested | 424 | 53.8 [48.5, 59.2] | 56.6 [51.2, 62.1] | 2.6 [1.2, 4.2] | 34.7 [29.4, 39.8] | 5.4 [2.8, 8.5] | 0.2 [0.0, 0.8] | 0.5 [0.0, 1.6] |
| under 90, free mixes, both tiers | 348 | 51.1 [45.5, 56.5] | 52.6 [46.9, 58.0] | 2.6 [1.1, 4.4] | 36.2 [31.2, 41.5] | 8.3 [5.5, 11.4] | 0.0 [0.0, 0.0] | 0.3 [0.0, 0.9] |
| 90-140, free mixes, both tiers | 5034 | 79.5 [77.9, 80.9] | 80.6 [79.1, 81.9] | 0.1 [0.0, 0.2] | 15.1 [13.9, 16.2] | 4.1 [3.4, 4.9] | 0.1 [0.0, 0.2] | 0.0 [0.0, 0.1] |
| 140-165, free mixes, both tiers | 2127 | 69.0 [66.6, 71.5] | 69.8 [67.3, 72.3] | 0.0 [0.0, 0.0] | 27.0 [24.7, 29.3] | 3.1 [2.3, 4.0] | 0.1 [0.0, 0.2] | 0.0 [0.0, 0.0] |
| 165-180, free mixes, both tiers | 430 | 57.4 [51.3, 63.8] | 59.5 [53.6, 65.6] | 0.7 [0.0, 1.6] | 33.7 [28.2, 39.2] | 6.0 [3.8, 8.7] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| over 180, free mixes, both tiers | 491 | 51.9 [47.0, 56.9] | 54.4 [49.4, 59.4] | 2.6 [1.4, 4.1] | 36.7 [31.8, 41.4] | 5.7 [3.3, 8.5] | 0.2 [0.0, 0.7] | 0.4 [0.0, 1.3] |

The `other` disagreements, by the ratio of tempogram over peaks (all dev):

| ratio | tracks |
|---|---:|
| 3/2 | 354 |
| 2/3 | 40 |
| 4/3 | 90 |
| 3/4 | 283 |
| 3 | 0 |
| 1/3 | 0 |
| none simple | 1226 |

### Q2. Accuracy by agreement class: the reliability table

Acc1 (4%) and Acc2 of each engine within each class, % [95% range]. Tracks are those of the class.


**all dev**

| class | tracks | tempogram Acc1 | tempogram Acc2 | peaks Acc1 | peaks Acc2 |
|---|---:|---:|---:|---:|---:|
| agree2 | 6778 | 90.0 [89.0, 90.9] | 97.2 [96.7, 97.6] | 90.0 [89.0, 90.9] | 97.2 [96.7, 97.6] |
| agree2to4 | 108 | 58.3 [49.5, 68.0] | 67.6 [58.9, 76.6] | 57.4 [48.4, 67.0] | 64.8 [56.1, 74.0] |
| octave | 34 | 44.1 [27.5, 62.2] | 91.2 [80.0, 100.0] | 47.1 [29.4, 64.3] | 91.2 [80.0, 100.0] |
| other | 1993 | 62.8 [60.4, 65.3] | 74.0 [71.6, 76.2] | 8.7 [7.4, 10.1] | 10.3 [8.9, 11.9] |
| tempogram only | 686 | 67.3 [62.2, 72.5] | 78.1 [74.5, 81.9] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| peaks only | 17 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 47.1 [20.8, 72.7] | 52.9 [26.7, 78.6] |
| neither | 6 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |

**free mixes, strict**

| class | tracks | tempogram Acc1 | tempogram Acc2 | peaks Acc1 | peaks Acc2 |
|---|---:|---:|---:|---:|---:|
| agree2 | 3580 | 93.4 [92.4, 94.4] | 97.3 [96.7, 97.8] | 93.4 [92.4, 94.4] | 97.2 [96.6, 97.8] |
| agree2to4 | 48 | 64.6 [51.0, 78.1] | 66.7 [52.8, 80.4] | 66.7 [52.8, 80.4] | 70.8 [57.4, 83.7] |
| octave | 14 | 64.3 [35.7, 92.9] | 92.9 [75.0, 100.0] | 28.6 [0.0, 57.1] | 92.9 [75.0, 100.0] |
| other | 957 | 71.9 [68.7, 75.1] | 79.2 [76.2, 82.1] | 6.8 [5.2, 8.5] | 8.2 [6.4, 10.1] |
| tempogram only | 199 | 64.3 [57.1, 71.6] | 70.4 [63.5, 76.9] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| peaks only | 4 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 75.0 [0.0, 100.0] | 75.0 [0.0, 100.0] |
| neither | 2 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |

**free mixes, contested**

| class | tracks | tempogram Acc1 | tempogram Acc2 | peaks Acc1 | peaks Acc2 |
|---|---:|---:|---:|---:|---:|
| agree2 | 2568 | 86.9 [85.0, 88.7] | 97.0 [96.3, 97.6] | 86.9 [85.0, 88.6] | 96.9 [96.2, 97.6] |
| agree2to4 | 49 | 46.9 [32.6, 61.7] | 65.3 [51.5, 78.4] | 44.9 [30.5, 59.5] | 57.1 [43.5, 71.1] |
| octave | 16 | 12.5 [0.0, 33.3] | 87.5 [68.4, 100.0] | 75.0 [50.0, 94.1] | 87.5 [68.4, 100.0] |
| other | 827 | 55.4 [51.7, 59.1] | 70.4 [66.8, 73.8] | 8.0 [6.1, 9.9] | 9.3 [7.4, 11.4] |
| tempogram only | 158 | 56.3 [47.0, 66.5] | 70.9 [63.0, 78.6] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| peaks only | 5 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 20.0 [0.0, 66.7] | 40.0 [0.0, 100.0] |
| neither | 3 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |

**fsld + groove + guitarset**

| class | tracks | tempogram Acc1 | tempogram Acc2 | peaks Acc1 | peaks Acc2 |
|---|---:|---:|---:|---:|---:|
| agree2 | 630 | 82.9 [78.5, 86.9] | 97.8 [95.7, 99.3] | 82.9 [78.5, 86.9] | 97.8 [95.7, 99.3] |
| agree2to4 | 11 | 81.8 [53.8, 100.0] | 81.8 [53.8, 100.0] | 72.7 [40.0, 100.0] | 72.7 [40.0, 100.0] |
| octave | 4 | 100.0 [100.0, 100.0] | 100.0 [100.0, 100.0] | 0.0 [0.0, 0.0] | 100.0 [100.0, 100.0] |
| other | 209 | 50.7 [42.2, 59.6] | 64.1 [55.7, 72.2] | 20.1 [13.9, 26.9] | 24.4 [17.1, 32.3] |
| tempogram only | 329 | 74.5 [65.8, 82.5] | 86.3 [80.9, 91.4] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| peaks only | 8 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 50.0 [0.0, 87.5] | 50.0 [0.0, 87.5] |
| neither | 1 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |

Per band, tempogram Acc1 when the engines agree within 4% and when they do not (both read), free mixes, both tiers:

| band | agree tracks | Acc1 when agreeing | disagree tracks | Acc1 when disagreeing |
|---|---:|---:|---:|---:|
| under 90 | 183 | 15.3 [10.4, 21.0] | 135 | 34.8 [26.7, 42.9] |
| 90-140 | 4055 | 96.8 [96.2, 97.4] | 763 | 73.1 [69.7, 76.4] |
| 140-165 | 1484 | 97.5 [96.7, 98.3] | 575 | 78.1 [74.4, 81.8] |
| 165-180 | 256 | 88.7 [84.2, 92.7] | 148 | 64.2 [55.6, 72.4] |
| over 180 | 267 | 1.5 [0.3, 3.1] | 193 | 4.1 [1.6, 7.1] |

### Q2 and Q6. How well each signal ranks right readings above wrong ones

AUROC [95% range]: the chance a right reading (Acc1) scores above a wrong one, ties counted half. 0.5 is no information. Each signal is scored against the reading it vouches for, on the tracks where that reading exists. `agreement` is ordinal: within 2%, within 4%, half or double, other, one engine alone. `stable` is whether the engine ever sent bpmStable. Confidence is the final top candidate's, in 20 quantile bins.

| signal | all dev | free mixes, strict | free mixes, contested | fsld + groove + guitarset |
|---|---:|---:|---:|---:|
| agreement for tempogram | 0.684 [0.668, 0.700] | 0.703 [0.680, 0.727] | 0.689 [0.667, 0.711] | 0.585 [0.535, 0.634] |
| agreement for peaks | 0.851 [0.840, 0.861] | 0.886 [0.872, 0.900] | 0.834 [0.817, 0.850] | 0.766 [0.731, 0.804] |
| agreement for combined | 0.685 [0.669, 0.701] | 0.703 [0.680, 0.727] | 0.690 [0.668, 0.712] | 0.587 [0.537, 0.635] |
| tempogram stable | 0.641 [0.627, 0.655] | 0.651 [0.628, 0.673] | 0.642 [0.622, 0.662] | 0.606 [0.571, 0.647] |
| lock agreement for tempogram | 0.702 [0.686, 0.718] | 0.711 [0.687, 0.736] | 0.700 [0.678, 0.722] | 0.646 [0.600, 0.693] |
| peaks stable | 0.516 [0.511, 0.520] | 0.511 [0.505, 0.516] | 0.513 [0.506, 0.521] | 0.539 [0.518, 0.561] |
| tempogram confidence | 0.761 [0.743, 0.778] | 0.799 [0.776, 0.822] | 0.766 [0.742, 0.789] | 0.606 [0.543, 0.667] |
| peaks confidence | 0.796 [0.784, 0.809] | 0.805 [0.788, 0.822] | 0.811 [0.793, 0.828] | 0.722 [0.670, 0.774] |
| agreement then tempogram confidence | 0.768 [0.752, 0.783] | 0.804 [0.782, 0.823] | 0.777 [0.755, 0.798] | 0.605 [0.549, 0.659] |

Tempogram AUROC gain of agreement over its own signal, paired (all dev):

- agreement for tempogram less tempogram stable: 0.044 [0.028, 0.059]
- lock agreement for tempogram less tempogram stable: 0.062 [0.051, 0.072]
- agreement for tempogram less tempogram confidence: -0.077 [-0.095, -0.057]
- agreement then tempogram confidence less tempogram confidence: 0.007 [-0.005, 0.020]
- agreement for peaks less peaks confidence: 0.055 [0.042, 0.067]

Reliability of each engine's own final confidence, in fifths of its dev distribution (all dev): Acc1 of the engine's final reading, % [95% range]. This is the raw scale RBA-106 would calibrate.

| engine | fifth | confidence from | to | tracks | Acc1 |
|---|---:|---:|---:|---:|---:|
| tempogram | 1 | n/a | 0.259 | 1920 | 56.8 [54.0, 59.5] |
| tempogram | 2 | 0.259 | 0.445 | 1920 | 78.2 [76.0, 80.4] |
| tempogram | 3 | 0.445 | 0.587 | 1920 | 89.3 [87.7, 90.8] |
| tempogram | 4 | 0.587 | 0.718 | 1920 | 92.2 [90.8, 93.5] |
| tempogram | 5 | 0.718 | n/a | 1919 | 94.5 [93.0, 95.8] |
| peaks | 1 | n/a | 0.091 | 1794 | 32.2 [29.9, 34.6] |
| peaks | 2 | 0.091 | 0.141 | 1787 | 63.9 [61.2, 66.3] |
| peaks | 3 | 0.141 | 0.200 | 1784 | 79.5 [77.3, 81.6] |
| peaks | 4 | 0.200 | 0.282 | 1780 | 87.4 [85.5, 89.1] |
| peaks | 5 | 0.282 | n/a | 1785 | 93.2 [91.7, 94.6] |

### Q3. Peaks as the fallback when the tempogram does not lock

The reports' coverage is the share of tracks with a bpmStable lock. Here a track's lock is its first bpmStable, and the combined lock is the tempogram's, else peaks'. Acc1 of a lock is over all tracks of the scope, so it counts a track with no lock as wrong. % [95% range]; differences are paired.

| scope | tracks | peaks locks, tempogram not | peaks lock right there | tempogram final right there | coverage tempogram | coverage combined | lock Acc1 tempogram | lock Acc1 combined | combined less tempogram | lock Acc2 tempogram | lock Acc2 combined |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| all dev | 9622 | 942 | 29.8 [26.8, 32.9] | 50.7 [47.1, 54.1] | 87.1 [86.2, 88.0] | 96.9 [96.4, 97.4] | 73.9 [72.5, 75.1] | 76.8 [75.5, 78.0] | +2.9 [+2.6, +3.3] | 80.9 [79.8, 82.0] | 84.2 [83.2, 85.2] |
| free mixes, strict | 4804 | 402 | 33.8 [29.0, 38.5] | 61.2 [56.4, 65.9] | 89.3 [88.1, 90.4] | 97.6 [97.1, 98.1] | 79.4 [77.9, 81.0] | 82.3 [80.8, 83.7] | +2.8 [+2.3, +3.4] | 83.3 [81.9, 84.7] | 86.3 [85.0, 87.6] |
| free mixes, contested | 3626 | 422 | 21.6 [17.7, 25.6] | 43.4 [38.4, 48.3] | 85.8 [84.2, 87.3] | 97.4 [96.7, 98.1] | 69.2 [66.8, 71.5] | 71.7 [69.4, 74.0] | +2.5 [+2.0, +3.0] | 79.0 [76.9, 80.8] | 82.0 [80.2, 83.8] |
| fsld + groove + guitarset | 1192 | 118 | 45.8 [35.8, 56.0] | 41.5 [31.1, 51.8] | 82.6 [79.4, 85.5] | 92.4 [90.2, 94.4] | 65.4 [61.1, 69.8] | 70.0 [65.8, 74.2] | +4.5 [+3.2, +6.0] | 77.0 [73.2, 80.5] | 82.5 [78.9, 85.7] |
| under 90, free mixes, strict | 251 | 42 | 0.0 [0.0, 0.0] | 11.9 [2.7, 22.7] | 76.9 [70.9, 82.6] | 93.6 [90.2, 96.6] | 22.3 [17.2, 27.9] | 22.3 [17.2, 27.9] | +0.0 [+0.0, +0.0] | 68.1 [61.4, 74.5] | 71.3 [64.9, 77.5] |
| 90-140, free mixes, strict | 3092 | 214 | 48.6 [42.2, 55.2] | 69.2 [63.2, 75.1] | 91.0 [89.7, 92.2] | 97.9 [97.3, 98.5] | 84.8 [83.3, 86.5] | 88.2 [86.8, 89.6] | +3.4 [+2.7, +4.1] | 84.8 [83.3, 86.5] | 88.2 [86.8, 89.6] |
| 140-165, free mixes, strict | 1168 | 116 | 21.6 [14.0, 29.8] | 68.1 [59.3, 77.2] | 88.0 [85.7, 90.2] | 97.9 [97.0, 98.8] | 82.7 [80.0, 85.3] | 84.8 [82.3, 87.2] | +2.1 [+1.3, +3.1] | 82.7 [80.0, 85.3] | 84.8 [82.3, 87.2] |
| 165-180, free mixes, strict | 226 | 20 | 35.0 [14.3, 58.8] | 65.0 [43.8, 85.7] | 88.1 [82.1, 92.6] | 96.9 [93.8, 99.1] | 75.7 [67.8, 82.4] | 78.8 [71.6, 84.9] | +3.1 [+1.0, +5.8] | 86.3 [80.0, 91.2] | 89.4 [83.9, 93.8] |
| over 180, free mixes, strict | 67 | 10 | 0.0 [0.0, 0.0] | 10.0 [0.0, 33.3] | 82.1 [72.7, 90.6] | 97.0 [92.2, 100.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | +0.0 [+0.0, +0.0] | 68.7 [55.9, 80.7] | 68.7 [55.9, 80.7] |
| under 90, free mixes, contested | 97 | 28 | 0.0 [0.0, 0.0] | 10.7 [0.0, 24.0] | 58.8 [47.6, 69.1] | 87.6 [80.8, 93.9] | 10.3 [4.7, 16.9] | 10.3 [4.7, 16.9] | +0.0 [+0.0, +0.0] | 49.5 [38.6, 60.0] | 53.6 [42.7, 64.4] |
| 90-140, free mixes, contested | 1942 | 167 | 33.5 [26.5, 40.8] | 57.5 [49.7, 65.1] | 89.1 [87.4, 90.7] | 97.7 [96.9, 98.5] | 82.5 [80.4, 84.5] | 85.4 [83.5, 87.2] | +2.9 [+2.2, +3.6] | 82.5 [80.4, 84.5] | 85.4 [83.5, 87.2] |
| 140-165, free mixes, contested | 959 | 122 | 21.3 [14.2, 28.9] | 52.5 [43.8, 61.3] | 85.6 [82.9, 88.1] | 98.3 [97.5, 99.1] | 79.7 [76.6, 82.7] | 82.4 [79.5, 85.1] | +2.7 [+1.7, +3.9] | 79.7 [76.6, 82.7] | 82.4 [79.5, 85.1] |
| 165-180, free mixes, contested | 204 | 40 | 22.5 [10.3, 36.6] | 45.0 [29.3, 61.1] | 76.0 [69.3, 82.1] | 95.6 [92.6, 98.2] | 61.8 [53.9, 69.5] | 66.2 [58.6, 73.4] | +4.4 [+1.9, +7.5] | 65.7 [57.8, 73.2] | 70.1 [62.7, 77.2] |
| over 180, free mixes, contested | 424 | 65 | 0.0 [0.0, 0.0] | 3.1 [0.0, 8.1] | 81.8 [77.6, 86.0] | 97.2 [95.2, 99.0] | 1.7 [0.5, 2.9] | 1.7 [0.5, 2.9] | +0.0 [+0.0, +0.0] | 74.1 [69.0, 78.9] | 78.1 [73.4, 82.6] |

The shown lock, three ways: the tempogram alone; `combined`, with peaks' lock where the tempogram has none; and `confirmed`, with peaks' lock only once the tempogram's reading at that moment agrees within 4% (causal, from the reading timeline). Coverage, then the right share among locked tracks, % [95% range]:

| scope | coverage tempogram | coverage combined | coverage confirmed | right when locked, tempogram | combined | confirmed | right when locked, confirmed less tempogram | lock Acc1 over all tracks, confirmed less tempogram |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| all dev | 87.1 [86.2, 88.0] | 96.9 [96.4, 97.4] | 92.6 [91.9, 93.2] | 84.8 [83.7, 85.8] | 79.2 [78.0, 80.4] | 83.0 [81.8, 84.1] | -1.8 [-2.1, -1.5] | +3.0 [+2.6, +3.3] |
| free mixes, strict | 89.3 [88.1, 90.4] | 97.6 [97.1, 98.1] | 94.2 [93.3, 95.0] | 89.0 [87.8, 90.1] | 84.3 [82.9, 85.6] | 87.8 [86.5, 88.9] | -1.2 [-1.6, -0.9] | +3.2 [+2.7, +3.8] |
| free mixes, contested | 85.8 [84.2, 87.3] | 97.4 [96.7, 98.1] | 92.2 [91.0, 93.3] | 80.7 [78.6, 82.6] | 73.6 [71.4, 75.7] | 78.0 [75.9, 80.0] | -2.7 [-3.3, -2.1] | +2.7 [+2.1, +3.2] |
| fsld + groove + guitarset | 82.6 [79.4, 85.5] | 92.4 [90.2, 94.4] | 87.2 [84.6, 89.7] | 79.3 [74.8, 83.6] | 75.7 [71.5, 79.8] | 78.4 [74.1, 82.6] | -0.9 [-1.8, -0.1] | +2.9 [+1.8, +4.1] |

For contrast, any final reading (not only a lock): `combined` reads the tempogram, and peaks when the tempogram has nothing.

| scope | peaks Acc1 where only peaks reads | tracks | coverage tempogram | coverage combined | Acc1 tempogram | Acc1 combined | combined less tempogram, Acc1 | Acc2 tempogram | Acc2 combined |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| all dev | 47.1 [20.8, 72.7] | 17 | 99.8 [99.7, 99.9] | 99.9 [99.9, 100.0] | 82.0 [80.8, 83.2] | 82.1 [80.9, 83.2] | +0.1 [+0.0, +0.2] | 90.4 [89.6, 91.2] | 90.5 [89.7, 91.3] |
| free mixes, strict | 75.0 [0.0, 100.0] | 4 | 99.9 [99.8, 100.0] | 100.0 [99.9, 100.0] | 87.4 [86.2, 88.7] | 87.5 [86.2, 88.8] | +0.1 [+0.0, +0.1] | 92.1 [91.1, 93.1] | 92.2 [91.2, 93.1] |
| free mixes, contested | 20.0 [0.0, 66.7] | 5 | 99.8 [99.6, 99.9] | 99.9 [99.8, 100.0] | 77.3 [75.1, 79.4] | 77.4 [75.1, 79.4] | +0.0 [+0.0, +0.1] | 89.1 [87.6, 90.4] | 89.1 [87.7, 90.5] |
| fsld + groove + guitarset | 50.0 [0.0, 87.5] | 8 | 99.2 [98.7, 99.7] | 99.9 [99.7, 100.0] | 74.3 [70.0, 78.6] | 74.7 [70.3, 78.9] | +0.3 [+0.0, +0.8] | 87.8 [84.8, 90.6] | 88.2 [85.2, 90.9] |
| under 90, free mixes, both tiers | n/a | 0 | 99.7 [99.1, 100.0] | 99.7 [99.1, 100.0] | 22.1 [17.7, 26.7] | 22.1 [17.7, 26.7] | +0.0 [+0.0, +0.0] | 80.7 [76.1, 85.1] | 80.7 [76.1, 85.1] |
| 90-140, free mixes, both tiers | 50.0 [0.0, 100.0] | 6 | 99.8 [99.7, 99.9] | 100.0 [99.9, 100.0] | 92.2 [91.3, 93.1] | 92.2 [91.3, 93.1] | +0.1 [+0.0, +0.1] | 92.2 [91.3, 93.1] | 92.2 [91.3, 93.1] |
| 140-165, free mixes, both tiers | 50.0 [0.0, 100.0] | 2 | 99.9 [99.8, 100.0] | 100.0 [100.0, 100.0] | 91.2 [89.8, 92.6] | 91.3 [89.9, 92.6] | +0.0 [+0.0, +0.1] | 91.2 [89.8, 92.6] | 91.3 [89.9, 92.6] |
| 165-180, free mixes, both tiers | n/a | 0 | 100.0 [100.0, 100.0] | 100.0 [100.0, 100.0] | 78.1 [73.2, 82.6] | 78.1 [73.2, 82.6] | +0.0 [+0.0, +0.0] | 86.7 [82.7, 90.4] | 86.7 [82.7, 90.4] |
| over 180, free mixes, both tiers | 0.0 [0.0, 0.0] | 1 | 99.4 [98.3, 100.0] | 99.6 [98.7, 100.0] | 2.4 [1.2, 3.9] | 2.4 [1.2, 3.9] | +0.0 [+0.0, +0.0] | 85.7 [82.2, 89.1] | 85.9 [82.4, 89.3] |

### Q4. Tie-break inside a half or double disagreement

Share of those tracks each rule gets right (Acc1), % [95% range].

| scope | tracks | tempogram | peaks | faster | slower | the locked engine |
|---|---:|---:|---:|---:|---:|---:|
| all dev | 34 | 44.1 [27.5, 62.2] | 47.1 [29.4, 64.3] | 47.1 [29.4, 64.3] | 44.1 [27.5, 62.2] | 41.2 [25.0, 59.1] |
| free mixes, strict | 14 | 64.3 [35.7, 92.9] | 28.6 [0.0, 57.1] | 28.6 [0.0, 57.1] | 64.3 [35.7, 92.9] | 50.0 [22.2, 81.2] |
| free mixes, contested | 16 | 12.5 [0.0, 33.3] | 75.0 [50.0, 94.1] | 75.0 [50.0, 94.1] | 12.5 [0.0, 33.3] | 25.0 [5.6, 50.0] |
| fsld + groove + guitarset | 4 | 100.0 [100.0, 100.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 100.0 [100.0, 100.0] | 75.0 [0.0, 100.0] |

Split-half check, all dev:

- Picked on half 0 (18 tracks): `tempogram`, right on 10. On half 1 (16 tracks) it is right on 5, against 5 for always taking the tempogram
- Picked on half 1 (16 tracks): `peaks`, right on 9. On half 0 (18 tracks) it is right on 7, against 10 for always taking the tempogram

### Q5. When the engines first agree

From each engine's bpmStable timeline: the first moment both are locked within 4% of each other. % [95% range].

| scope | tempogram first lock right | tracks with a tempogram lock | tracks where the locks ever agree | first agreement right | tempogram first lock right, same tracks | agreement less first lock, same tracks | agreement comes after the tempogram's first lock |
|---|---:|---:|---:|---:|---:|---:|---:|
| all dev | 84.8 [83.7, 85.8] | 8383 | 71.9 [70.6, 73.2] | 89.0 [88.0, 89.9] | 87.7 [86.7, 88.7] | +1.2 [+1.0, +1.5] | 39.1 [37.6, 40.5] |
| free mixes, strict | 89.0 [87.8, 90.1] | 4288 | 77.0 [75.3, 78.7] | 92.1 [91.0, 93.1] | 90.9 [89.7, 92.0] | +1.2 [+0.8, +1.5] | 38.5 [36.5, 40.6] |
| free mixes, contested | 80.7 [78.6, 82.6] | 3111 | 72.6 [70.3, 74.6] | 85.8 [83.9, 87.5] | 84.3 [82.4, 86.0] | +1.5 [+1.0, +2.0] | 40.8 [38.5, 43.0] |
| fsld + groove + guitarset | 79.3 [74.8, 83.6] | 984 | 49.0 [44.8, 53.0] | 83.7 [79.6, 87.7] | 83.2 [78.8, 87.4] | +0.5 [+0.0, +1.3] | 34.8 [29.0, 40.0] |

Median seconds, all dev, over the tracks where it happens: tempogram first reading 4.1 s, tempogram first lock 11.5 s, first agreement of the locks 13.7 s.
First agreement of the readings within 2%: 10.4 s.

From the reading timelines (every change of each engine's top candidate), the first moment both read within 2%:

| scope | tracks where readings ever agree | first agreement right |
|---|---:|---:|
| all dev | 85.4 [84.3, 86.3] | 82.4 [81.3, 83.6] |
| free mixes, strict | 89.5 [88.3, 90.7] | 86.4 [85.1, 87.7] |
| free mixes, contested | 87.6 [85.9, 89.0] | 77.6 [75.4, 79.6] |
| fsld + groove + guitarset | 62.1 [57.8, 66.0] | 80.1 [75.7, 84.1] |
