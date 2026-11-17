# v6's CPU rule

**A live feature that is on by default adds at most 1% of one core's real-time budget, on CI.**

The rule is the DECISION of 2026-11-16 on RBA-108. 1% of the real-time budget is 10 ms of CPU per second of audio. It is the share the whole tempogram engine takes, sustained, inside the AudioWorklet on CI's CPUs ([`results/rba-51-browser-cost.md`](results/rba-51-browser-cost.md)).

**How a feature is measured.** In a real browser, Chromium and Firefox on GitHub Actions, with the feature on and off, through the library's own processor. Each new entry below gives the CI run it comes from. Chromium runs under coverage in the Build & Test job, which inflates its numbers, so Firefox's are the cleaner reading.

## Entries

### The `kick` event (RBA-243, RBA-246)

Measured by [`tests/integration/kick-cost.test.ts`](../tests/integration/kick-cost.test.ts), logged as `KICK-COST`. It replays 20 s of a generated full mix through the library's processor with the kick detector on and off, three times each, and keeps the fastest run. The detector alone, without the processor around it, is the cleanest reading of what the event adds. The test fails above 10 ms per audio second.

| Version | CI run | Firefox, detector alone | Chromium with coverage, detector alone |
|---|---|---|---|
| RBA-243, as merged at b7d7698 | [43778003915](https://github.com/dlepaux/realtime-bpm-analyzer/actions/runs/43778003915) | 0.165% (1.65 ms per audio second) | 0.659% (6.59 ms) |
| RBA-246, the 3.5 s window and the check for samples that are not finite, at cd63cfa | [43783005421](https://github.com/dlepaux/realtime-bpm-analyzer/actions/runs/43783005421) | 0.150% (1.50 ms) | 0.496% (4.97 ms) |

RBA-243's own runs read 0.18% to 0.27% in Firefox and 0.37% to 0.65% in Chromium with coverage, and about 0.12% in Node on a Mac. Within the rule in every run. RBA-246's change is within run-to-run noise: a window of at most 44 kicks is read once per kick-like jump, not per sample, and the finite check is one test per 2.5 ms hop.
