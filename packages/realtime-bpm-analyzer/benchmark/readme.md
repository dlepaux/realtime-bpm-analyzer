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
- **Tempo prior**: log-Gaussian as in Ellis 2007, on 50 to 240 BPM, instead of folding into 90 to 180. Ellis uses 120 BPM and 1.4 octaves. Dev chose 136 BPM and 0.8 octaves, narrower and faster, so this is a fit to these sets' tempo mix, electronic music included, not a law.
- **Confidence** is the accumulated comb salience, a normalised autocorrelation: how strongly the audio pulses at that tempo.
- **Stable** requires salience of at least 0.15, 80% of the last 8 s of frames agreeing with the reading on their own within 2%, and a lead of 1.25 over the next candidate. It fires once per tempo.

References:

- D. Ellis, "Beat tracking by dynamic programming", Journal of New Music Research 36(1), 2007.
- P. Grosche, M. Müller, "A mid-level representation for capturing dominant tempo and pulse information in music recordings", ISMIR 2009.
- P. Grosche, M. Müller, "Extracting predominant local pulse information from music recordings", IEEE TASLP 19(6), 2011 (read, not used: no PLP here).
- G. Percival, G. Tzanetakis, "Streamlined tempo estimation based on autocorrelation and cross-correlation with pulses", IEEE/ACM TASLP 22(12), 2014.
- F. Gouyon et al., "An experimental comparison of audio tempo induction algorithms", IEEE TASLP 14(5), 2006.

## Results

Tuned on dev, then scored once on held-out. Per-genre tables are in [`results/report.md`](results/report.md). `peaks` is the current default, with its lowpass.

| split, set | Acc1 peaks | Acc1 tempogram | Acc2 peaks | Acc2 tempogram | first correct peaks | first correct tempogram | false-stable peaks | false-stable tempogram | coverage peaks | coverage tempogram |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| dev, all (1354) | 49.6 | 73.1 | 59.0 | 91.2 | 11.2 s | 4.1 s | 45.8 | 19.6 | 79.4 | 70.9 |
| held-out, all (1344) | 53.9 | 73.4 | 64.4 | 91.8 | 12.2 s | 4.1 s | 46.1 | 18.7 | 78.9 | 68.3 |
| held-out, GiantSteps | 81.3 | 87.1 | 88.0 | 92.9 | 5.8 s | 4.1 s | 49.1 | 11.5 | 98.8 | 77.3 |
| held-out, Ballroom | 52.2 | 73.7 | 62.8 | 94.4 | 14.2 s | 5.6 s | 39.9 | 21.0 | 87.2 | 64.2 |
| held-out, GTZAN | 48.5 | 67.5 | 64.2 | 91.7 | 10.1 s | 4.1 s | 46.8 | 21.6 | 79.2 | 70.0 |
| held-out, GuitarSet | 21.7 | 63.9 | 25.6 | 85.0 | never | 4.6 s | 45.0 | 22.5 | 25.6 | 55.6 |

The tempogram fires `bpmStable` on about a tenth fewer tracks, and on far fewer times per track (945 events against 7425). That lower coverage is the price of the lower false-stable rate.

CPU, on an M1 Pro in Node with synthetic input (`perf.ts`, 3 input shapes): 3.7 to 4.1 ms per second of audio, 0.37 to 0.41% of a core, against 0.7 ms for peaks on the same input. The longest chunk took 1.9 ms, the first one included, against 2.9 ms for a render quantum. 85% of that is the onset stage. No loop optimisation was warranted.

## Limits

- Half-time and ⅔ readings remain the main error, and the prior only moves them around: a wider or slower prior wins some sets and loses others on dev.
- Tuned on a mix dominated by these four sets. The prior centre is the knob most exposed to that.
- The peaks detector is measured wrapped by its lowpass and its existing offline path untouched. `analyzeFullBuffer`, the CLI and the MCP server still use peaks.
- The first reading comes at 4 s and the earliest `bpmStable` at about 11.5 s: the warm-up, then 8 s of agreeing frames.
- GiantSteps previews are 2 minutes and GTZAN clips 30 s, so slow settling is not penalised the way a full DJ set would.
- The worklet reads the left channel only, so a hard-panned track is judged on that channel. This holds for both detectors.
