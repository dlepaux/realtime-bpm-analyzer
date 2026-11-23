# Batch job

The tempogram tuning as one container: rebuild the sets from their public sources, check them against the frozen splits, then sweep on dev. It holds code only. Data lands on the volume at `RBA_TEMPO_ROOT` (`/data/rba-tempo` in the image), which must be writable by uid 1000.

```sh
entrypoint [tune]                               # the data, then the dev sweep. The default
entrypoint fetch                                # the data only
entrypoint dev --detector a,b                         # the data, then those detectors on dev through the real path, into `_job/dev-<commit>.json`. No look
entrypoint heldout --reason "why" [--detector a,b]   # the data, a dev scoring, then a logged held-out look
entrypoint free-look --reason "why"                   # the engine study's one look at the held-out free mixes, then its verdict
entrypoint calibration-heldout --reason "why"         # the calibration study's one held-out check of the confidence calibration
```

`free-look` scores peaks and `tempogram` (5.5.0) on `free-mixes` and `free-mixes-contested` held-out, whole, and takes no `--sets` or `--detector`. It has its own log, `_job/free-heldout-log.md`, and one line there spends it. Its files are `_job/free-heldout-<commit>.json` (per track, which stays on the volume), `_job/free-heldout-progress-<commit>.jsonl`, and `_job/free-verdict-<commit>.md` and `.json`, the aggregates `free-verdict.ts` writes. A restart after the look's file only judges it again. The `heldout` mode refuses the free sets.

`calibration-heldout` runs from a built image only, since `RBA_BENCHMARK_SHA` names its files and so the code that judges them. It checks the committed confidence table, `../results/rba-106-calibration-dev.json`, which the image carries, on data it was not fitted on. Its scope is fixed: the `tempogram-hysteresis` detector on `fsld`, `groove`, `guitarset`, `free-mixes` and `free-mixes-contested`, and it takes no `--sets` or `--detector`. It runs in three steps:

1. The tempogram on dev with this image, into `_job/calibration-dev-<commit>.json`, then `calibration.py refit` on its samples, taken at the row the table was fitted at (`pulseLostAfterSeconds` 3). The re-fit must give the committed tables exactly, on as many readings and at the same hysteresis, and every recorded confidence must be the committed table read at its recorded raw score. Otherwise it exits 1 with no look taken. Its report, aggregates only, is `_job/calibration-refit-<commit>.json`.
2. The look, logged before any label is read in its own `_job/calibration-heldout-log.md`, one line of which spends it. It spends nothing of the engine study's looks. Results go into `_job/calibration-heldout-<commit>.json`, with progress in `_job/calibration-heldout-progress-<commit>.jsonl`.
3. `calibration.py heldout` reads the readings shown under the shipped `HYSTERESIS` at 10, 15, 20, 30 and 45 s and at the end, maps the raw scores with the shipped table, and judges them against `HELDOUT_BAR`. The result goes into `_job/calibration-verdict-<commit>.md` and `.json`, and the summary's `verdict.exit` is 0 for a pass and 1 for a fail. Both are a finished check, and the job exits 0. If `calibration.py` refuses its input or breaks, it exits 2 and writes no verdict. The job then fails with no verdict recorded, and a restart judges the same file again.

The per-track files are the run results and `calibration-samples-*`, and they stay on the volume. Only the verdict and the re-fit report leave it. A restart after the look's file only judges it again, until a verdict is recorded. A restart during the look must give the same `--reason`, because the logged line names it, and any other reason is refused as another look.

`--sets a,b` narrows any of them but a look, for a test. A `tune` that narrow says so in `scope`, and proves less. Curves and rows live in `_job/tune-<commit>-<scope>/`, so a test or a new image never mixes with an earlier run. `RBA_JOB_WORKERS` sets the worker count, and a job should set it: a container sees the host's cores, not its own limit. Run one at a time on a volume: two jobs fight over the same part files.

Nothing runs held-out unless asked. A look scores only `lookDetectors` in `../lib/detectors.ts`. Before a look the same detectors are scored on dev through the real path, into `_job/dev-<commit>.json`: the sweep is a replay and holds no peaks. A failure there spends no look. It needs `--reason`, writes its line to `_job/heldout-log.md` before scoring anything, and refuses to start when `_job/heldout-<commit>.json` exists, unless a kill landed just after that file, when the restart only closes the summary and exits 0. That line belongs in [`../heldout-log.md`](../heldout-log.md): copy it there, since the image cannot commit. The data check before it parses held-out labels to count ids, and prints no tempo, because a look must not be spent on a broken set.

A look scores all of `lookDetectors` on all sets: anything narrower is refused before the log line, as it could get no verdict. The reason of the engine study's second and last look, which `lookRefusal` checks for its declarations:

```text
Second look, prompted by the first: the first look (b1ab9d3) lost fast music, and this one is taken because of that, so it is not clean. Rule amended after two refusals: it now prefers an interior prior within noise, per the DECISION of 2026-10-31 on RBA-51. Sets already seen: all seven by the first look, and giantsteps, ballroom, gtzan, guitarset by RBA-50 as well. The fast-tempo guard, its bands and the evaluation of 90 to 180 originate in the findings of the first look, and no tuned value or floor does. Candidate tempogram-extension, references peaks and tempogram-285-90-180, at 90 to 180.
```

## Exit codes and evidence

Each mode writes `_job/summary-<mode>.json`, with the commit, the stage, and per set the frozen counts, `found`, `missing`, `differs` and `unexpected`.

| exit | means |
|---|---|
| 0 | done, every set whole: `status` is `ok` |
| 1 | failed: `error` and `stage` say where. Restarting continues from there. A held-out run past the skip limit (`undecodableLimit`, 3 tracks whose file cannot decode, or any other failure) writes no `heldout-<commit>.json`. Under the limit it closes with each track named in `skipped` |
| 2 | bad arguments, an unknown set, or that held-out look is spent. Nothing ran |
| 3 | `status` is `incomplete`: an evaluation-only set is not whole. The sweep still ran, since it reads none of them |

A clean set that is not whole stops the job before any tuning, and so does any incomplete set before a held-out look.

`missing` and `differs` are the rebuild check. An id of the frozen split with no audio is missing. `differs` re-deals the split from its seed: if the groups or genres moved, tracks change side. It does not read tempos, and `fsld-nc`, wholly held-out, has no deal to redo. Tempo labels and audio bytes are covered earlier, by each source's pin in [`../lib/sources.ts`](../lib/sources.ts). No digest of the previous copy survives, so this proves the rebuild matches the publishers, not the old disk.

The sweep is [`sweep-plan.json`](sweep-plan.json). In the run's directory, named by `runDir` in the summary, its rows are in `sweep.jsonl` and `sweep-report.json` has the best 20 by the score in `lib/sweep.ts`. It is a replay, within one chunk of the real path: picking the defaults and committing them, then scoring with `run`, stays a human step.

## Resuming

A kill at any moment loses little, and restarting the same command is the only recovery step.

- Downloads resume from their `.part`, and only a file matching its hash takes the final name.
- A source's marker in `_job/state` holds its pin and is written after it is unpacked, so a killed unpack runs again, and so does a source whose pin changed, which also drops its sets' decoded PCM.
- Decoded PCM and curves are renamed into place, so a short file never looks finished.
- `sweep.jsonl` gains a line per tuning, and a finished tuning is never replayed.
- A held-out look keeps each result in `_job/heldout-progress-<commit>.jsonl`, whose first line names the look, and is logged once however often it restarts. A restart with another commit, reason, set or detector is another look, and is refused. A kill between the log line and that first line spends the look unread: a restart is refused at the cap, which costs a look and never hides one.

## Building

GitHub builds it: `.github/workflows/benchmark-image.yml`, for linux/amd64, tagged `sha-<commit>`. The build context is the repo root, narrowed to an allowlist by `Dockerfile.dockerignore`, and the workflow refuses an image holding audio.
