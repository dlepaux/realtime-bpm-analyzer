# RBA-51: the one look at the held-out free mixes

5.5.0's tempogram as shipped against peaks, on RBA-59's held-out halves of the free mixes, real path, first 60 s of each mix. The pass bar was fixed in ee29bd8 before the route opened in 2765bc4, per the DECISION of 2026-11-03 on RBA-51. Written by `free-verdict.ts` in the batch job (job dispatch-1793710839-dc8b2ae5, image sha-2765bc4, digest sha256:86d704a76c5d6ffc05988c167b92294224da1c2b1b2f46959694f9d84579ec70), from `/data/rba-tempo/_job/free-heldout-2765bc4a0b0d.json`, which holds per-track output and stays where the look ran. Held-out list sha256 b4e6b187df652cc7. Aggregates only; the json beside this file carries the same numbers.

Tracks per set: free-mixes 4436, free-mixes-contested 3427. Skipped as undecodable: free-mixes 0, free-mixes-contested 0.

**Acc1**, value [95% range, resampling artists]

| | tracks | tempogram | peaks | tempogram less peaks |
|---|---:|---:|---:|---:|
| free mixes, strict | 4436 | 88.1 [86.9, 89.4] | 72.9 [71.0, 74.8] | +15.2 [+13.8, +16.7] |
| free mixes, strict, labelled 90 to 180 | 4144 | 93.0 [92.0, 93.8] | 77.6 [75.8, 79.4] | +15.3 [+13.8, +16.9] |
| free mixes, strict, trackers-all | 3543 | 91.3 [90.2, 92.4] | 75.2 [73.1, 77.1] | +16.1 [+14.4, +17.8] |
| free mixes, strict, trackers-two | 893 | 75.7 [72.4, 78.9] | 63.9 [60.2, 67.8] | +11.8 [+9.2, +14.3] |
| free mixes, contested | 3427 | 78.5 [76.5, 80.5] | 64.5 [62.0, 66.8] | +14.0 [+12.5, +15.5] |
| free mixes, contested, labelled 90 to 180 | 2929 | 91.1 [89.8, 92.3] | 75.0 [72.8, 77.0] | +16.1 [+14.4, +17.9] |
| free mixes, contested, trackers-all | 325 | 77.5 [72.8, 82.1] | 53.5 [47.6, 59.6] | +24.0 [+18.8, +29.4] |
| free mixes, contested, trackers-two | 3102 | 78.6 [76.4, 80.7] | 65.6 [63.2, 68.1] | +13.0 [+11.5, +14.5] |
| under 90 (out of range), free mixes, strict | 239 | 24.3 [17.1, 31.5] | 7.1 [3.8, 10.5] | +17.2 [+10.7, +23.7] |
| 90-120, free mixes, strict | 722 | 86.7 [83.7, 89.5] | 70.9 [66.8, 74.9] | +15.8 [+12.9, +18.8] |
| 120-140, free mixes, strict | 2178 | 95.8 [94.8, 96.7] | 85.3 [83.3, 87.0] | +10.6 [+8.9, +12.3] |
| 140-150, free mixes, strict | 555 | 94.2 [91.9, 96.2] | 74.4 [70.0, 78.6] | +19.8 [+15.7, +24.4] |
| 150-156, free mixes, strict | 252 | 93.7 [89.7, 97.0] | 69.0 [62.1, 75.4] | +24.6 [+19.0, +30.8] |
| 156-165, free mixes, strict | 233 | 89.7 [85.5, 93.5] | 62.2 [55.3, 69.1] | +27.5 [+21.1, +34.4] |
| 140-165, free mixes, strict | 1040 | 93.1 [91.1, 94.8] | 70.4 [66.6, 73.9] | +22.7 [+19.3, +26.2] |
| 165-180, free mixes, strict | 204 | 83.8 [77.8, 89.3] | 56.9 [48.7, 64.8] | +27.0 [+20.4, +33.7] |
| over 180 (out of range), free mixes, strict | 53 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | +0.0 [+0.0, +0.0] |
| under 90 (out of range), free mixes, contested | 103 | 17.5 [10.4, 25.8] | 5.8 [1.8, 11.0] | +11.7 [+5.9, +18.7] |
| 90-120, free mixes, contested | 486 | 90.7 [88.0, 93.3] | 74.7 [70.1, 79.2] | +16.0 [+12.0, +20.6] |
| 120-140, free mixes, contested | 1296 | 94.0 [92.5, 95.4] | 82.9 [80.5, 85.1] | +11.1 [+9.1, +13.2] |
| 140-150, free mixes, contested | 568 | 93.5 [91.2, 95.6] | 75.4 [71.5, 79.1] | +18.1 [+14.7, +21.7] |
| 150-156, free mixes, contested | 153 | 81.7 [75.0, 87.9] | 47.7 [38.9, 56.3] | +34.0 [+26.4, +41.7] |
| 156-165, free mixes, contested | 216 | 84.3 [78.8, 89.5] | 62.0 [55.2, 68.8] | +22.2 [+15.9, +28.8] |
| 140-165, free mixes, contested | 937 | 89.4 [87.0, 91.6] | 67.8 [64.2, 71.1] | +21.7 [+18.8, +24.6] |
| 165-180, free mixes, contested | 210 | 81.4 [75.4, 87.0] | 59.0 [51.1, 66.8] | +22.4 [+15.0, +30.4] |
| over 180 (out of range), free mixes, contested | 395 | 1.3 [0.3, 2.5] | 2.0 [0.8, 3.5] | -0.8 [-2.4, +1.0] |

**Acc2**, value [95% range, resampling artists]

| | tracks | tempogram | peaks | tempogram less peaks |
|---|---:|---:|---:|---:|
| free mixes, strict | 4436 | 92.7 [91.7, 93.6] | 76.7 [74.9, 78.4] | +16.0 [+14.5, +17.5] |
| free mixes, strict, labelled 90 to 180 | 4144 | 93.4 [92.5, 94.3] | 77.8 [76.0, 79.6] | +15.6 [+14.1, +17.2] |
| free mixes, strict, trackers-all | 3543 | 95.7 [94.9, 96.4] | 78.9 [77.0, 80.7] | +16.8 [+15.1, +18.5] |
| free mixes, strict, trackers-two | 893 | 81.0 [78.0, 83.9] | 68.0 [64.4, 71.6] | +13.0 [+10.3, +15.8] |
| free mixes, contested | 3427 | 90.0 [88.6, 91.3] | 72.7 [70.5, 74.8] | +17.3 [+15.6, +19.2] |
| free mixes, contested, labelled 90 to 180 | 2929 | 91.3 [90.1, 92.5] | 75.1 [73.0, 77.2] | +16.2 [+14.5, +17.9] |
| free mixes, contested, trackers-all | 325 | 84.3 [80.0, 88.5] | 58.5 [52.6, 64.1] | +25.8 [+20.7, +31.3] |
| free mixes, contested, trackers-two | 3102 | 90.6 [89.2, 91.9] | 74.2 [72.0, 76.2] | +16.4 [+14.7, +18.2] |
| under 90 (out of range), free mixes, strict | 239 | 84.5 [79.0, 89.3] | 64.9 [58.5, 71.1] | +19.7 [+12.0, +27.3] |
| 90-120, free mixes, strict | 722 | 86.7 [83.7, 89.5] | 71.3 [67.1, 75.2] | +15.4 [+12.5, +18.4] |
| 120-140, free mixes, strict | 2178 | 95.8 [94.9, 96.7] | 85.3 [83.4, 87.1] | +10.6 [+8.9, +12.3] |
| 140-150, free mixes, strict | 555 | 94.2 [92.0, 96.2] | 74.4 [69.9, 78.8] | +19.8 [+15.6, +24.3] |
| 150-156, free mixes, strict | 252 | 93.7 [89.8, 97.0] | 69.0 [61.9, 75.4] | +24.6 [+18.8, +30.8] |
| 156-165, free mixes, strict | 233 | 89.7 [85.2, 93.7] | 62.2 [55.3, 69.3] | +27.5 [+20.8, +33.9] |
| 140-165, free mixes, strict | 1040 | 93.1 [91.2, 94.8] | 70.4 [66.7, 73.9] | +22.7 [+19.2, +26.2] |
| 165-180, free mixes, strict | 204 | 93.1 [89.5, 96.2] | 59.3 [51.3, 66.8] | +33.8 [+26.8, +41.5] |
| over 180 (out of range), free mixes, strict | 53 | 73.6 [60.4, 84.9] | 41.5 [28.0, 54.7] | +32.1 [+17.0, +48.0] |
| under 90 (out of range), free mixes, contested | 103 | 76.7 [66.3, 85.2] | 64.1 [51.7, 74.6] | +12.6 [+3.6, +22.8] |
| 90-120, free mixes, contested | 486 | 90.7 [88.0, 93.4] | 74.9 [70.4, 79.4] | +15.8 [+11.5, +20.5] |
| 120-140, free mixes, contested | 1296 | 94.0 [92.5, 95.3] | 82.9 [80.6, 85.1] | +11.1 [+9.1, +13.3] |
| 140-150, free mixes, contested | 568 | 93.5 [91.2, 95.5] | 75.4 [71.3, 79.0] | +18.1 [+14.8, +21.6] |
| 150-156, free mixes, contested | 153 | 81.7 [75.0, 87.9] | 47.7 [39.2, 56.2] | +34.0 [+26.2, +41.7] |
| 156-165, free mixes, contested | 216 | 84.3 [79.0, 89.3] | 62.0 [55.4, 69.0] | +22.2 [+16.0, +28.8] |
| 140-165, free mixes, contested | 937 | 89.4 [87.0, 91.7] | 67.8 [64.3, 71.1] | +21.7 [+18.6, +24.8] |
| 165-180, free mixes, contested | 210 | 84.3 [78.5, 89.6] | 60.5 [52.5, 68.5] | +23.8 [+16.0, +31.7] |
| over 180 (out of range), free mixes, contested | 395 | 84.1 [79.7, 88.2] | 57.0 [51.1, 62.6] | +27.1 [+21.7, +32.7] |

**False-stable**, value [95% range, resampling artists]

| | tracks | tempogram | peaks | tempogram less peaks |
|---|---:|---:|---:|---:|
| free mixes, strict | 4436 | 10.7 [9.5, 11.9] | 33.3 [31.5, 35.1] | -22.6 [-24.1, -21.0] |
| free mixes, strict, labelled 90 to 180 | 4144 | 6.4 [5.4, 7.3] | 28.6 [26.9, 30.3] | -22.3 [-23.9, -20.6] |
| free mixes, strict, trackers-all | 3543 | 8.4 [7.4, 9.6] | 31.8 [30.0, 33.7] | -23.4 [-25.1, -21.8] |
| free mixes, strict, trackers-two | 893 | 20.9 [17.6, 24.3] | 39.1 [35.5, 42.7] | -18.1 [-21.5, -14.8] |
| free mixes, contested | 3427 | 19.9 [18.0, 21.9] | 39.9 [37.7, 42.0] | -19.9 [-21.8, -18.2] |
| free mixes, contested, labelled 90 to 180 | 2929 | 7.7 [6.5, 9.0] | 30.1 [28.2, 32.0] | -22.4 [-24.3, -20.4] |
| free mixes, contested, trackers-all | 325 | 25.0 [19.0, 30.9] | 49.3 [44.1, 54.4] | -24.3 [-30.3, -18.0] |
| free mixes, contested, trackers-two | 3102 | 19.4 [17.4, 21.5] | 38.9 [36.6, 41.3] | -19.5 [-21.3, -17.8] |
| under 90 (out of range), free mixes, strict | 239 | 73.3 [65.6, 81.1] | 89.8 [85.0, 94.3] | -16.5 [-21.7, -11.4] |
| 90-120, free mixes, strict | 722 | 9.9 [7.4, 12.6] | 32.0 [28.2, 36.2] | -22.1 [-25.6, -18.6] |
| 120-140, free mixes, strict | 2178 | 4.8 [3.8, 5.8] | 18.7 [17.1, 20.4] | -13.9 [-15.6, -12.2] |
| 140-150, free mixes, strict | 555 | 5.9 [4.0, 7.9] | 40.0 [36.2, 43.9] | -34.1 [-38.0, -30.4] |
| 150-156, free mixes, strict | 252 | 4.0 [1.3, 7.5] | 44.7 [39.9, 49.9] | -40.6 [-46.8, -34.8] |
| 156-165, free mixes, strict | 233 | 6.2 [3.2, 9.6] | 47.1 [41.6, 53.0] | -40.9 [-47.4, -34.5] |
| 140-165, free mixes, strict | 1040 | 5.5 [4.0, 7.1] | 42.8 [39.9, 45.8] | -37.3 [-40.3, -34.4] |
| 165-180, free mixes, strict | 204 | 15.8 [10.4, 22.5] | 45.1 [38.8, 51.8] | -29.3 [-36.0, -22.4] |
| over 180 (out of range), free mixes, strict | 53 | 100.0 [100.0, 100.0] | 98.0 [95.7, 99.7] | +2.0 [+0.3, +4.3] |
| under 90 (out of range), free mixes, contested | 103 | 79.5 [68.9, 88.4] | 94.2 [90.0, 97.7] | -14.7 [-23.1, -7.6] |
| 90-120, free mixes, contested | 486 | 6.6 [4.2, 9.4] | 25.7 [22.1, 29.4] | -19.1 [-22.8, -15.3] |
| 120-140, free mixes, contested | 1296 | 5.6 [4.2, 7.2] | 22.4 [20.2, 24.5] | -16.8 [-19.2, -14.4] |
| 140-150, free mixes, contested | 568 | 6.1 [4.0, 8.3] | 32.6 [29.2, 36.1] | -26.5 [-30.4, -22.8] |
| 150-156, free mixes, contested | 153 | 20.5 [12.6, 29.2] | 50.2 [42.9, 57.3] | -29.7 [-38.1, -21.0] |
| 156-165, free mixes, contested | 216 | 12.2 [7.4, 17.4] | 46.4 [40.1, 52.7] | -34.2 [-41.9, -26.2] |
| 140-165, free mixes, contested | 937 | 9.7 [7.3, 12.2] | 38.7 [35.5, 41.9] | -29.0 [-32.5, -25.5] |
| 165-180, free mixes, contested | 210 | 14.8 [9.6, 20.5] | 45.7 [39.4, 52.3] | -30.9 [-38.1, -24.0] |
| over 180 (out of range), free mixes, contested | 395 | 99.4 [98.5, 100.0] | 98.5 [97.6, 99.2] | +0.9 [-0.2, +2.1] |

**Coverage**, value [95% range, resampling artists]

| | tracks | tempogram | peaks | tempogram less peaks |
|---|---:|---:|---:|---:|
| free mixes, strict | 4436 | 89.2 [87.9, 90.4] | 94.7 [93.8, 95.5] | -5.5 [-6.8, -4.1] |
| free mixes, strict, labelled 90 to 180 | 4144 | 89.7 [88.4, 91.0] | 94.7 [93.8, 95.6] | -5.0 [-6.4, -3.6] |
| free mixes, strict, trackers-all | 3543 | 91.6 [90.4, 92.8] | 95.2 [94.3, 96.0] | -3.6 [-4.9, -2.2] |
| free mixes, strict, trackers-two | 893 | 79.7 [76.6, 82.7] | 92.7 [90.7, 94.6] | -13.0 [-15.9, -10.2] |
| free mixes, contested | 3427 | 86.5 [85.0, 88.0] | 93.4 [92.0, 94.6] | -6.9 [-8.7, -5.0] |
| free mixes, contested, labelled 90 to 180 | 2929 | 87.4 [85.8, 88.8] | 93.5 [92.2, 94.7] | -6.2 [-7.9, -4.4] |
| free mixes, contested, trackers-all | 325 | 81.8 [77.3, 86.3] | 89.8 [85.8, 93.5] | -8.0 [-13.2, -2.8] |
| free mixes, contested, trackers-two | 3102 | 87.0 [85.5, 88.4] | 93.7 [92.2, 95.0] | -6.7 [-8.6, -4.8] |
| under 90 (out of range), free mixes, strict | 239 | 82.0 [76.9, 86.8] | 94.6 [91.6, 97.3] | -12.6 [-18.3, -6.7] |
| 90-120, free mixes, strict | 722 | 87.0 [83.9, 89.7] | 91.1 [88.5, 93.5] | -4.2 [-7.1, -1.5] |
| 120-140, free mixes, strict | 2178 | 91.5 [90.1, 92.9] | 95.5 [94.3, 96.5] | -3.9 [-5.4, -2.5] |
| 140-150, free mixes, strict | 555 | 90.5 [86.1, 94.1] | 97.1 [95.5, 98.4] | -6.7 [-11.3, -2.6] |
| 150-156, free mixes, strict | 252 | 85.7 [80.5, 90.5] | 94.8 [91.5, 97.5] | -9.1 [-14.5, -4.2] |
| 156-165, free mixes, strict | 233 | 88.8 [84.2, 93.0] | 94.4 [90.8, 97.4] | -5.6 [-10.7, -0.4] |
| 140-165, free mixes, strict | 1040 | 88.9 [85.9, 91.6] | 96.0 [94.5, 97.3] | -7.0 [-10.3, -4.0] |
| 165-180, free mixes, strict | 204 | 84.8 [79.1, 89.6] | 93.6 [89.0, 97.3] | -8.8 [-14.8, -3.0] |
| over 180 (out of range), free mixes, strict | 53 | 81.1 [69.8, 91.1] | 90.6 [82.0, 98.0] | -9.4 [-22.0, +1.9] |
| under 90 (out of range), free mixes, contested | 103 | 77.7 [68.0, 85.7] | 94.2 [88.9, 98.2] | -16.5 [-26.0, -8.5] |
| 90-120, free mixes, contested | 486 | 87.7 [84.4, 90.7] | 90.7 [85.8, 94.5] | -3.1 [-7.9, +2.7] |
| 120-140, free mixes, contested | 1296 | 89.2 [87.3, 91.0] | 94.2 [92.7, 95.6] | -5.0 [-7.1, -2.9] |
| 140-150, free mixes, contested | 568 | 89.8 [87.1, 92.3] | 93.7 [91.4, 95.9] | -3.9 [-6.9, -1.0] |
| 150-156, free mixes, contested | 153 | 79.7 [73.6, 86.0] | 93.5 [89.1, 97.0] | -13.7 [-20.5, -7.1] |
| 156-165, free mixes, contested | 216 | 79.6 [73.3, 85.5] | 93.5 [89.7, 96.7] | -13.9 [-21.3, -6.7] |
| 140-165, free mixes, contested | 937 | 85.8 [83.2, 88.4] | 93.6 [91.8, 95.4] | -7.8 [-10.8, -4.8] |
| 165-180, free mixes, contested | 210 | 82.4 [76.6, 87.7] | 95.7 [92.4, 98.5] | -13.3 [-19.3, -7.7] |
| over 180 (out of range), free mixes, contested | 395 | 82.5 [78.1, 86.5] | 91.9 [88.2, 95.1] | -9.4 [-14.5, -4.1] |

**The pass bar**, tempogram (5.5.0) less peaks, points [95% range]. The last column applies the same test at one standard error, and decides nothing

| gate | condition | difference | rule | met | at one SE |
|---|---|---:|---|---|---|
| 1 | acc1, free mixes, strict | +15.2 [+13.8, +16.7] | above peaks: range wholly above zero | yes | yes |
| 1 | acc2, free mixes, strict | +16.0 [+14.5, +17.5] | above peaks: range wholly above zero | yes | yes |
| 2 | acc1, 140-165, free mixes, strict | +22.7 [+19.3, +26.2] | not below peaks beyond noise: range reaches zero or above | yes | yes |
| 2 | acc2, 140-165, free mixes, strict | +22.7 [+19.2, +26.2] | not below peaks beyond noise: range reaches zero or above | yes | yes |
| 2 | acc1, 165-180, free mixes, strict | +27.0 [+20.4, +33.7] | not below peaks beyond noise: range reaches zero or above | yes | yes |
| 2 | acc2, 165-180, free mixes, strict | +33.8 [+26.8, +41.5] | not below peaks beyond noise: range reaches zero or above | yes | yes |
| 4 | falseStable, free mixes, strict | -22.6 [-24.1, -21.0] | not above peaks, point estimate | yes | yes |
| 5 | acc1, fsld + groove + guitarset held-out halves, clean macro, candidate less 5.5.0 | – | not below 5.5.0 beyond noise. The candidate is 5.5.0: zero by construction, no data read | yes | yes |

- Gate 2 against 5.5.0: void, the candidate is 5.5.0
- Gate 3 (Acc1 over 90 to 180 against 5.5.0): void, the candidate is 5.5.0

**Is the tempogram eligible for David's ruling on the default? YES**, 8 of 8 gates met. At one standard error, which decides nothing, it would read yes.
