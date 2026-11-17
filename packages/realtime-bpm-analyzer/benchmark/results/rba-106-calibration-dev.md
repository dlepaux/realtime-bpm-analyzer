# RBA-106: calibrating `confidence` on dev

Does each engine's `confidence` mean the chance its reading is right, and if not, which mapping makes it so? Measured on the dev half only: the same 9622 tracks as rba-v6-hysteresis-dev.md, same job and image (`sha-006349573d4df509706b4ebd1cc24387e88deedf`, digest `sha256:04285d9bb7e6f292d7077933ca1133a39f082ea0b33aab0ffb66125e0112b1b0`). No held-out track, label or output was read.

Source: the readings the hysteresis job kept, under the shipped `HYSTERESIS` (the contract's values, kept by rba-v6-hysteresis-dev.md). Peaks' readings were taken from its contract row in the dev file (`benchmark/contract_samples.py`), because the job had kept those of its own pick. The tempogram's readings don't depend on the row. Its file only marks whether each reading was shown, under `pulseLostAfterSeconds` 3 rather than 2. That can only differ where a pulse gap of 2 to 3 s covers a sample time, and the tempogram's lock-to-listening rate is 0.000 per minute under both. Made by `python3 -I benchmark/calibration.py <samples.json> <report.json>`. Its rules were committed (fff7dcc, and 00318bb, which fits the band tables the rule names) before it read any sample. Its tests are `benchmark/calibration_test.py`, which CI does not run. Per-track files stay on the box.

## Method

- **What is graded**: the reading shown (status settling or locked) at 10, 15, 20, 30 and 45 s of audio and at the end of each track, so a long track counts no more than a short one, plus the offline reading. Right means Acc1 at 4%. A reading right only at 2, 3, 1/2 or 1/3 of the tempo is an octave error: it counts as wrong, and its share is shown apart.
- **Mapping**: the raw confidences cut in 20 bins of equal count, each bin's Acc1 made monotone by isotonic regression (pool adjacent violators, weighted by count), read by linear interpolation and held flat past either end.
- **Held back**: a third of the artists (by a hash of set and artist) form the check part. Tables are fitted on the other two thirds and graded on the check part only. The tables shipped are then refitted on all dev.
- **Tempo band**: a band of the reading's own tempo gets its own table only if its residual on the check part (Acc1 less the mean calibrated confidence) has a range that excludes zero. Each such table is fitted and graded the same way.
- **Offline**: an offline table only if, on the check part, it beats the realtime table's ECE beyond the noise. Neither engine needs one.
- **"Adds nothing" bar**: on all dev, readings ranked by raw confidence and cut into two halves of equal count. The top half's Acc1 less the bottom half's must have a range above zero.
- ECE uses 10 equal-width bins. Ranges: 95% percentile, 1000 draws resampling artists within each set, with the fitted table held fixed, so they leave out the noise of the fit itself.

## Outcome

- **Confidence adds something, by far**: top half less bottom half, realtime, +27.1 points [+25.5, +28.8] for the tempogram and +41.0 [+39.4, +42.5] for peaks. It ships, calibrated.
- **Raw scores were far from probabilities**: a raw 0.3 from the tempogram was right 76% of the time, and from peaks 92%. Check-part ECE goes from 0.329 to 0.011 for the tempogram and from 0.484 to 0.009 for peaks, with band tables. Brier goes from 0.261 to 0.135, and from 0.418 to 0.150.
- **Bands**: the shared table was off on fast readings. On the tempogram, readings of 140 to 165 BPM were under-confident by 6.4 points, and readings of 165 and over over-confident by 16.9. With their own tables, every band is within the noise on the tempogram. Peaks also needed 90 to 140. Its 140 to 165 band is still 3.0 points over-confident [0.2, 6.1] on the check part.
- **Time**: there is no time rule, so nothing was fitted for it. With band tables, the tempogram's residual at each sample time is within the noise. Peaks' early readings are over-confident: -3.3 points [-5.6, -1.2] at 10 s and -2.2 at 15 s. Later ones are slightly under-confident.
- **Octave errors**: 1 to 13% of readings per raw confidence bin. They are most common in the low and middle bins and rarest in the top ones.

## Proposed held-out check (not run; needs a DECISION on RBA-106)

RBA-106 allows one held-out check of the calibration. Proposed, with its bar fixed in `calibration.py` (`HELDOUT_BAR`, `heldout_report`, `heldout_verdict`) and tested before any held-out data is read:

- **Data**: the held-out halves of the same five sets, under the shipped `HYSTERESIS`, with tempogram readings sampled at the same times. The raw scores must be recorded, so it runs a library without the mapping (the image above, plus a held-out samples mode that logs the look as `heldout` does). The shipped mapping is then applied in Python. `tests/unit/analyzer/calibration.test.ts` checks the library's tables against `apply_mapping` at 144 points, so grading the raw scores this way grades the shipped library.
- **Pass**, on the tempogram's realtime readings, all of: ECE at most 0.05, the upper end of its range at most 0.08, Brier no worse than the raw scores', and the top half less bottom half above zero at the low end of its range. Peaks is reported but is not part of the bar.

Ranges: 95% percentile, 1000 draws resampling artists within each set.

### tempogram

Hysteresis: `{"lockAfterSeconds": 8, "lockBand": 0.02, "pulseLostAfterSeconds": 3, "unlockAfterSeconds": 2, "unlockBand": 0.04}`. Readings: 54863 realtime and 9479 offline, from 3003 artists, 986 of them in the check part.

On the check part (18123 realtime readings), the fit part's table:

| | before | after | after less before |
|---|---|---|---|
| ECE | 0.329 [0.312, 0.345] | 0.013 [0.010, 0.028] | -0.316 [-0.328, -0.287] |
| Brier | 0.261 [0.251, 0.270] | 0.138 [0.128, 0.148] | -0.123 [-0.135, -0.110] |

Reliability before, check part (confidence bin, readings, mean confidence, Acc1, octave errors):

| bin | n | confidence | Acc1 | octave |
|---|---|---|---|---|
| 0.0 to 0.1 | 2379 | 5.1 | 33.7 | 6.0 |
| 0.1 to 0.2 | 1676 | 15.0 | 62.6 | 12.9 |
| 0.2 to 0.3 | 1960 | 25.0 | 72.5 | 10.2 |
| 0.3 to 0.4 | 2082 | 35.0 | 76.3 | 12.2 |
| 0.4 to 0.5 | 2260 | 45.0 | 82.9 | 10.5 |
| 0.5 to 0.6 | 2205 | 55.0 | 89.1 | 6.0 |
| 0.6 to 0.7 | 2089 | 64.9 | 92.1 | 4.4 |
| 0.7 to 0.8 | 1879 | 74.7 | 95.0 | 2.3 |
| 0.8 to 0.9 | 1254 | 84.5 | 94.9 | 2.3 |
| 0.9 to 1.0 | 339 | 92.5 | 94.7 | 2.1 |

Reliability after, check part (confidence bin, readings, mean confidence, Acc1, octave errors):

| bin | n | confidence | Acc1 | octave |
|---|---|---|---|---|
| 0.2 to 0.3 | 1060 | 22.8 | 20.3 | 3.8 |
| 0.3 to 0.4 | 449 | 34.9 | 31.4 | 6.0 |
| 0.4 to 0.5 | 539 | 44.9 | 46.2 | 7.4 |
| 0.5 to 0.6 | 641 | 56.1 | 59.8 | 10.9 |
| 0.6 to 0.7 | 1818 | 66.0 | 65.4 | 12.8 |
| 0.7 to 0.8 | 3129 | 76.3 | 74.1 | 10.8 |
| 0.8 to 0.9 | 5509 | 86.0 | 86.0 | 8.5 |
| 0.9 to 1.0 | 4978 | 92.4 | 94.2 | 2.8 |

Residual after the table (Acc1 less mean mapped confidence, points), check part:

| scope | residual |
|---|---|
| band under 90 | n/a |
| band 90-140 | -0.5 [-2.5, +1.4] |
| band 140-165 | +6.4 [+4.2, +8.7] |
| band 165 and over | -16.9 [-22.5, -10.9] |
| at 10 s | -0.0 [-1.9, +1.9] |
| at 15 s | -1.1 [-2.8, +0.6] |
| at 20 s | -0.8 [-2.4, +0.9] |
| at 30 s | -0.1 [-1.9, +1.7] |
| at 45 s | +0.5 [-1.5, +2.3] |
| at end | +1.4 [-0.3, +3.0] |

Offline readings on the check part (3135): ECE 0.022 [0.017, 0.039] with the realtime table, 0.016 [0.010, 0.033] with their own, difference +0.006 [-0.006, +0.021]. Separate offline table: no. Band tables needed: 140-165, 165 and over.

With the band tables (140-165, 165 and over) fitted on the fit part, on the check part:

| | before | after | after less before |
|---|---|---|---|
| ECE | 0.329 [0.312, 0.345] | 0.011 [0.009, 0.027] | -0.318 [-0.331, -0.288] |
| Brier | 0.261 [0.251, 0.270] | 0.135 [0.125, 0.145] | -0.126 [-0.138, -0.114] |

| scope | residual with band tables |
|---|---|
| band under 90 | n/a |
| band 90-140 | -0.5 [-2.5, +1.4] |
| band 140-165 | -1.2 [-3.6, +1.0] |
| band 165 and over | +1.4 [-4.2, +7.2] |
| at 10 s | -0.6 [-2.2, +1.3] |
| at 15 s | -1.6 [-3.3, +0.0] |
| at 20 s | -1.3 [-3.0, +0.4] |
| at 30 s | -0.6 [-2.3, +1.0] |
| at 45 s | -0.1 [-1.8, +1.6] |
| at end | +1.0 [-0.7, +2.6] |

"Adds nothing" bar, all dev: top half less bottom half by raw confidence, Acc1 points: realtime +27.1 [+25.5, +28.8], offline +20.1 [+18.0, +21.9]. Confidence adds something: it ships calibrated.

Table refitted on all dev (raw, calibrated):

- realtime: `{"all": [[0.028638, 0.20051], [0.055144, 0.372585], [0.097521, 0.575647], [0.149595, 0.635569], [0.20161, 0.690485], [0.249703, 0.72767], [0.295928, 0.762304], [0.341343, 0.765585], [0.385679, 0.799125], [0.429153, 0.835641], [0.470513, 0.845789], [0.511768, 0.869486], [0.553363, 0.884798], [0.595264, 0.895735], [0.638504, 0.910317], [0.681735, 0.915421], [0.725551, 0.919825], [0.772671, 0.936566], [0.825921, 0.944951], [0.89822, 0.951513]], "bands": {"140-165": [[0.033034, 0.33474], [0.070347, 0.6], [0.119277, 0.732771], [0.172728, 0.746835], [0.221609, 0.808451], [0.267829, 0.831224], [0.314113, 0.845288], [0.356172, 0.871921], [0.396377, 0.871921], [0.434812, 0.907042], [0.471061, 0.931083], [0.505789, 0.939479], [0.542801, 0.939479], [0.584486, 0.947257], [0.624045, 0.947257], [0.663255, 0.960563], [0.705149, 0.964838], [0.749939, 0.964838], [0.800818, 0.971147], [0.875589, 0.971147]], "165 and over": [[0.025208, 0.107843], [0.03957, 0.230392], [0.060399, 0.323529], [0.092567, 0.338235], [0.135659, 0.367647], [0.181557, 0.5], [0.223155, 0.5], [0.257036, 0.5], [0.290288, 0.5], [0.323952, 0.5], [0.358273, 0.519608], [0.396653, 0.607843], [0.434505, 0.644608], [0.473727, 0.644608], [0.518908, 0.671569], [0.562945, 0.720588], [0.60891, 0.735294], [0.668028, 0.77451], [0.745682, 0.872549], [0.853984, 0.872549]]}}`

### peaks

Hysteresis: `{"lockAfterSeconds": 8, "lockBand": 0.02, "pulseLostAfterSeconds": 2, "unlockAfterSeconds": 2, "unlockBand": 0.04}`. Readings: 43155 realtime and 8939 offline, from 2905 artists, 959 of them in the check part.

On the check part (14093 realtime readings), the fit part's table:

| | before | after | after less before |
|---|---|---|---|
| ECE | 0.484 [0.464, 0.504] | 0.010 [0.008, 0.025] | -0.474 [-0.487, -0.442] |
| Brier | 0.418 [0.405, 0.430] | 0.157 [0.149, 0.166] | -0.260 [-0.279, -0.241] |

Reliability before, check part (confidence bin, readings, mean confidence, Acc1, octave errors):

| bin | n | confidence | Acc1 | octave |
|---|---|---|---|---|
| 0.0 to 0.1 | 3477 | 7.2 | 29.5 | 5.4 |
| 0.1 to 0.2 | 4923 | 14.5 | 69.0 | 7.0 |
| 0.2 to 0.3 | 3010 | 24.4 | 86.7 | 6.0 |
| 0.3 to 0.4 | 1678 | 34.3 | 92.4 | 3.9 |
| 0.4 to 0.5 | 1005 | 44.5 | 95.8 | 0.9 |

Reliability after, check part (confidence bin, readings, mean confidence, Acc1, octave errors):

| bin | n | confidence | Acc1 | octave |
|---|---|---|---|---|
| 0.1 to 0.2 | 502 | 19.0 | 16.7 | 2.4 |
| 0.2 to 0.3 | 1460 | 23.7 | 24.4 | 5.5 |
| 0.3 to 0.4 | 856 | 35.2 | 34.0 | 6.3 |
| 0.4 to 0.5 | 752 | 44.7 | 46.1 | 6.1 |
| 0.5 to 0.6 | 876 | 54.6 | 57.8 | 6.4 |
| 0.6 to 0.7 | 1607 | 66.2 | 65.8 | 7.3 |
| 0.7 to 0.8 | 1463 | 75.3 | 72.9 | 7.7 |
| 0.8 to 0.9 | 3171 | 84.4 | 83.9 | 6.4 |
| 0.9 to 1.0 | 3406 | 92.9 | 93.3 | 3.1 |

Residual after the table (Acc1 less mean mapped confidence, points), check part:

| scope | residual |
|---|---|
| band under 90 | n/a |
| band 90-140 | -2.5 [-4.5, -0.6] |
| band 140-165 | +11.6 [+8.3, +14.5] |
| band 165 and over | -12.2 [-19.4, -5.4] |
| at 10 s | -3.6 [-5.8, -1.5] |
| at 15 s | -2.3 [-4.3, -0.2] |
| at 20 s | -1.1 [-3.2, +0.9] |
| at 30 s | -0.2 [-2.2, +1.7] |
| at 45 s | +2.2 [+0.1, +4.2] |
| at end | +2.4 [+0.5, +4.5] |

Offline readings on the check part (2941): ECE 0.023 [0.017, 0.040] with the realtime table, 0.017 [0.015, 0.039] with their own, difference +0.006 [-0.010, +0.016]. Separate offline table: no. Band tables needed: 90-140, 140-165, 165 and over.

With the band tables (90-140, 140-165, 165 and over) fitted on the fit part, on the check part:

| | before | after | after less before |
|---|---|---|---|
| ECE | 0.484 [0.464, 0.504] | 0.009 [0.008, 0.025] | -0.475 [-0.490, -0.442] |
| Brier | 0.418 [0.405, 0.430] | 0.150 [0.141, 0.159] | -0.268 [-0.287, -0.249] |

| scope | residual with band tables |
|---|---|
| band under 90 | n/a |
| band 90-140 | +0.3 [-1.6, +2.2] |
| band 140-165 | -3.0 [-6.1, -0.2] |
| band 165 and over | -0.2 [-7.6, +6.5] |
| at 10 s | -3.3 [-5.6, -1.2] |
| at 15 s | -2.2 [-4.3, -0.2] |
| at 20 s | -1.2 [-3.3, +0.8] |
| at 30 s | -0.8 [-2.8, +1.1] |
| at 45 s | +1.7 [-0.3, +3.6] |
| at end | +2.0 [+0.1, +3.9] |

"Adds nothing" bar, all dev: top half less bottom half by raw confidence, Acc1 points: realtime +41.0 [+39.4, +42.5], offline +35.7 [+33.7, +37.7]. Confidence adds something: it ships calibrated.

Table refitted on all dev (raw, calibrated):

- realtime: `{"all": [[0.049989, 0.185357], [0.063145, 0.222892], [0.072474, 0.267501], [0.08232, 0.352641], [0.093329, 0.44393], [0.105524, 0.544738], [0.116928, 0.613531], [0.130731, 0.671918], [0.145092, 0.692771], [0.161133, 0.753012], [0.177844, 0.798795], [0.19531, 0.81696], [0.214063, 0.830862], [0.233928, 0.855355], [0.257586, 0.890176], [0.283525, 0.914041], [0.315376, 0.914041], [0.349677, 0.923077], [0.402366, 0.952028], [0.460666, 0.952028]], "bands": {"140-165": [[0.049556, 0.37037], [0.06546, 0.537118], [0.07873, 0.636166], [0.092901, 0.775599], [0.104952, 0.801743], [0.115942, 0.846783], [0.129333, 0.846783], [0.141899, 0.846783], [0.15554, 0.846783], [0.168455, 0.893636], [0.183293, 0.893636], [0.199214, 0.893636], [0.215719, 0.893636], [0.233491, 0.893636], [0.253891, 0.924796], [0.276331, 0.924796], [0.304078, 0.924796], [0.333819, 0.924796], [0.380988, 0.954148], [0.449856, 0.980392]], "165 and over": [[0.046601, 0.21875], [0.059947, 0.275591], [0.070681, 0.275591], [0.080616, 0.421875], [0.09109, 0.4375], [0.102163, 0.468504], [0.111915, 0.468504], [0.122919, 0.476562], [0.134567, 0.561659], [0.146673, 0.561659], [0.160881, 0.561659], [0.17397, 0.561659], [0.189685, 0.561659], [0.207642, 0.561659], [0.225608, 0.561659], [0.247324, 0.609375], [0.277984, 0.670588], [0.313866, 0.670588], [0.36136, 0.779528], [0.439176, 0.804688]], "90-140": [[0.050458, 0.131043], [0.06287, 0.155952], [0.071476, 0.21056], [0.080422, 0.259707], [0.090315, 0.323791], [0.102045, 0.446849], [0.114534, 0.545165], [0.127676, 0.612985], [0.142688, 0.650763], [0.159642, 0.708015], [0.17782, 0.786123], [0.195999, 0.81743], [0.215531, 0.839593], [0.236985, 0.87341], [0.261563, 0.900064], [0.288806, 0.928731], [0.322089, 0.928731], [0.357312, 0.942748], [0.410527, 0.95226], [0.463758, 0.95229]]}}`
