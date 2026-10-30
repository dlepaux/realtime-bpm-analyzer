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

Audio lives outside git in `/Volumes/storage/rba-tempo`, with decoded PCM cached under `pcm/`. BRID and the Groove dataset were considered, not used.

## Splits

`make-splits.ts` wrote `splits/*.json` with the fixed seed `rba-50-2026-10-30`, and they were committed before any audio was decoded or any result existed. Groups stay on one side: ballroom by album and replica, GTZAN by blocks of 10, GuitarSet by progression, GiantSteps by track.

Tuning uses dev only. `run.ts` is the only route to held-out: it needs a `--reason` and a committed tree, refuses `--tuning`, and appends to [`heldout-log.md`](heldout-log.md) before reading a label. `tune.ts` never loads held-out ids.

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
- **Tempo prior**: log-Gaussian as in Ellis 2007, on 50 to 240 BPM, instead of folding into 90 to 180. Ellis uses 120 BPM and 1.4 octaves. Dev chose 136 BPM and 0.8 octaves, narrower and faster, so this is a fit to these sets' tempo mix, electronic music included, not a law.
- **Confidence** is the accumulated comb salience, a normalised autocorrelation: how strongly the audio pulses at that tempo.
- **Stable** requires salience of at least 0.15, 80% of the last 8 s of frames agreeing with the reading on their own within 2%, and a lead of 1.25 over the next candidate. It fires once per tempo.

References:

- D. Ellis, "Beat tracking by dynamic programming", Journal of New Music Research 36(1), 2007.
- P. Grosche, M. Müller, "A mid-level representation for capturing dominant tempo and pulse information in music recordings", ISMIR 2009.
- P. Grosche, M. Müller, "Extracting predominant local pulse information from music recordings", IEEE TASLP 19(6), 2011 (read, not used: no PLP here).
- G. Percival, G. Tzanetakis, "Streamlined tempo estimation based on autocorrelation and cross-correlation with pulses", IEEE/ACM TASLP 22(12), 2014.
- F. Gouyon et al., "An experimental comparison of audio tempo induction algorithms", IEEE TASLP 14(5), 2006.

## Limits

- Half-time and ⅔ readings remain the main error, and the prior only moves them around: a wider or slower prior wins some sets and loses others on dev.
- Tuned on a mix dominated by these four sets. The prior centre is the knob most exposed to that.
- The peaks detector is measured wrapped by its lowpass and its existing offline path untouched. `analyzeFullBuffer`, the CLI and the MCP server still use peaks.
- About 8 s of audio is the shortest route to `bpmStable`, and the first reading comes at 4 s.
- GiantSteps previews are 2 minutes and GTZAN clips 30 s, so slow settling is not penalised the way a full DJ set would.
- The worklet reads the left channel only, so a hard-panned track is judged on that channel. This holds for both detectors.
