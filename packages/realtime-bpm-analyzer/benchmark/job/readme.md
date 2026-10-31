# Batch job

The tempogram tuning of RBA-51 as one container: rebuild the sets from their public sources, check them against the frozen splits, then sweep on dev. It holds code only. Data lands on the volume at `RBA_TEMPO_ROOT` (`/data/rba-tempo` in the image), which must be writable by uid 1000.

```sh
entrypoint [tune]                               # the data, then the dev sweep. The default
entrypoint fetch                                # the data only
entrypoint heldout --reason "why" [--detector a,b]   # the data, a dev scoring, then a logged held-out look
```

`--sets a,b` narrows any of them, for a test. A `tune` that narrow says so in `scope`, and proves less. Curves and rows live in `_job/tune-<commit>-<scope>/`, so a test or a new image never mixes with an earlier run. `RBA_JOB_WORKERS` sets the worker count, and a job should set it: a container sees the host's cores, not its own limit. Run one at a time on a volume: two jobs fight over the same part files.

Nothing runs held-out unless asked. Before a look the same detectors are scored on dev through the real path, into `_job/dev-<commit>.json`: the sweep is a replay and holds no peaks. A failure there spends no look. It needs `--reason`, writes its line to `_job/heldout-log.md` before scoring anything, and refuses to start when `_job/heldout.json` exists, unless a kill landed just after that file, when the restart only closes the summary and exits 0. That line belongs in [`../heldout-log.md`](../heldout-log.md): copy it there, since the image cannot commit. The data check before it parses held-out labels to count ids, and prints no tempo, because a look must not be spent on a broken set.

## Exit codes and evidence

Each mode writes `_job/summary-<mode>.json`, with the commit, the stage, and per set the frozen counts, `found`, `missing`, `differs` and `unexpected`.

| exit | means |
|---|---|
| 0 | done, every set whole: `status` is `ok` |
| 1 | failed: `error` and `stage` say where. Restarting continues from there. A held-out run with skipped tracks writes no `heldout.json` |
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
- A held-out look keeps each result in `_job/heldout-progress.jsonl`, whose first line names the look, and is logged once however often it restarts. A restart with another commit, reason, set or detector is another look, and is refused. A kill between the log line and that first line logs the look twice, which overstates and never hides one.

## Building

GitHub builds it: `.github/workflows/benchmark-image.yml`, for linux/amd64, tagged `sha-<commit>`. The build context is the repo root, narrowed to an allowlist by `Dockerfile.dockerignore`, and the workflow refuses an image holding audio.
