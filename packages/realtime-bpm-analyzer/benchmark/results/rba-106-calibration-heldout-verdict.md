## RBA-106 held-out calibration check: pass

Tempogram realtime readings at `{"lockAfterSeconds": 8, "lockBand": 0.02, "pulseLostAfterSeconds": 2, "unlockAfterSeconds": 2, "unlockBand": 0.04}`, the committed table. Tracks: free-mixes 4436, free-mixes-contested 3427, fsld 718, groove 127, guitarset 180, 1 skipped. Readings: 50615, from 3010 artists. Ranges: 95% percentile, 1000 draws resampling artists within each set.

Bar (HELDOUT_BAR): ECE at most 0.05, its upper range at most 0.08, Brier no worse than raw, and the top half less bottom half's low end above 0.0.

| | raw | shipped table | table less raw |
|---|---|---|---|
| ECE | 0.335 [0.326, 0.344] | 0.007 [0.005, 0.016] | -0.328 [-0.332, -0.316] |
| Brier | 0.263 [0.257, 0.269] | 0.131 [0.126, 0.137] | -0.132 [-0.139, -0.124] |

Top half less bottom half by raw score, Acc1 points: +27.2 [+25.5, +29.0].

Reliability with the shipped table (confidence bin, readings, mean confidence, Acc1, octave errors):

| bin | n | confidence | Acc1 | octave |
|---|---|---|---|---|
| 0.1 to 0.2 | 236 | 13.3 | 19.1 | 5.1 |
| 0.2 to 0.3 | 2305 | 22.9 | 24.1 | 4.3 |
| 0.3 to 0.4 | 1950 | 34.7 | 37.1 | 8.0 |
| 0.4 to 0.5 | 1272 | 44.9 | 44.7 | 8.8 |
| 0.5 to 0.6 | 2529 | 54.2 | 52.4 | 16.3 |
| 0.6 to 0.7 | 4285 | 65.2 | 66.5 | 12.1 |
| 0.7 to 0.8 | 7672 | 75.3 | 76.3 | 11.6 |
| 0.8 to 0.9 | 12014 | 85.8 | 86.4 | 8.3 |
| 0.9 to 1.0 | 18352 | 93.8 | 93.9 | 3.6 |

| scope | residual (Acc1 less mean confidence, points) |
|---|---|
| band under 90 | n/a |
| band 90-140 | +0.2 [-1.1, +1.3] |
| band 140-165 | +0.3 [-1.6, +1.9] |
| band 165 and over | +4.3 [+0.3, +8.1] |
| at 10 s | +0.4 [-0.7, +1.5] |
| at 15 s | -0.9 [-2.0, +0.1] |
| at 20 s | +0.1 [-1.0, +1.0] |
| at 30 s | +0.7 [-0.3, +1.7] |
| at 45 s | +1.6 [+0.7, +2.5] |
| at end | +1.2 [+0.3, +2.2] |
