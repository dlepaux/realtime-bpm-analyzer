# RBA-51: browser cost of the tempogram engine against peaks

Measured on main at 18ecacf (5.x API, both engines picked through the `detector` option), in headless Chromium on GitHub Actions. The tempogram runs with its 5.5.0 shipped settings (range 90 to 180). Peaks runs behind the native lowpass `BiquadFilterNode`, as `createRealtimeBpmAnalyzer` wires it.

- Primary run: [41653918729](https://github.com/dlepaux/realtime-bpm-analyzer/actions/runs/41653918729). The cost job (realtime, replay and offline at throttle 1x, 4x and 6x) ran in one job on an **AMD EPYC 9V74 80-Core, 4 vCPU, 15.6 GiB, Chrome 156.0.8078.47**. The memory and bundle jobs landed on other runner CPUs (listed under Machines below).
- Reproducibility: run [41650651286](https://github.com/dlepaux/realtime-bpm-analyzer/actions/runs/41650651286) ran the same measurements on the same CPU model but uploaded nothing (a harness path bug, since fixed). Its log showed the same shape, with the tempogram somewhat cheaper (replay analysis mean 0.39 ms against 0.49 ms, offline 5.0 against 6.3 ms per audio second). Expect about 20% run-to-run spread.
- Audio: a generated drum-and-bass mix at 128 BPM (`benchmark/browser-cost/signal.ts`), looped. No recorded audio. Chromium runs with `--mute-audio`, and the graph ends in a zero gain.

## Verdict

**The tempogram fits a browser.** Sustained, it uses under 1% of the real-time budget inside the AudioWorklet on CI CPUs, and 4.4 to 4.7% at 6x CPU throttling. Its heap stays flat at about 0.45 MiB over 10 minutes. It adds 2.5 KB gzip to the processor bundle (4.3 KB to the full index bundle).

Its one risk is burstiness, not load. Every 4096 samples it runs one analysis inside a single render quantum: p99 about 0.5 ms at 1x (20% of a 2.9 ms quantum), but about 4 ms at 6x (about 150% of one quantum), with single spikes of 5 to 21 ms (the first reading, when the JIT warms up, and GC). The audio thread rides over a long quantum when the device buffer holds several quanta, which is the usual case (Chrome's `interactive` latency is 256 to 512 frames on most hardware), so this only matters on very small buffers on slow CPUs. Chromium exposes no glitch counter here (`playoutStats` and `renderCapacity` are both absent), so that last point is reasoned, not measured.

Against peaks: in the first minute the tempogram costs about 3x peaks per analysis. Over a long run, peaks' cost rises (see the finding below) and the tempogram becomes the cheaper engine after a few minutes. Offline, the tempogram costs about 6x peaks (6.3 against 1.0 ms per audio second, so a 5 minute track takes about 1.9 s, or 13 s at 6x throttling), which is fine for files.

## Finding: peaks' cost grows for the first 8 to 9 minutes, then plateaus

Peaks' CPU per audio second rises roughly linearly over a 10 minute run (0.55 to 7.75 ms in the worklet, 0.94 to 6.94 ms in the replay, table below), while the tempogram stays flat. It is **not a leak**: heap is flat, and the growth is bounded by `consts.maxKeptPeaks` (256, RBA-107).

Evidence, from a Node probe that feeds the same lowpassed signal straight to `RealTimeBpmAnalyzer.analyzeChunk` in 4096-sample chunks (not committed, it is a one-off): on this signal only the 0.65 threshold keeps peaks, and `validPeaks[0.65]` grows by 30 a minute (30, 60, ..., 241 at minute 8, then 256 from minute 9 on). The cost per audio second tracks it: 0.69, 0.58, 0.81, 1.17, 1.25, 1.47, 1.68, 1.91, 2.20, 2.25 ms, then flat once the cap is reached. Every chunk re-runs the interval and tempo grouping over all kept peaks, so the steady-state cost is set by the cap, not by the first minute. Consequences: a short benchmark understates peaks' cost by 3x (Node) to 14x (worklet, Date.now clock), and any cost comparison between engines must run past the cap. Whether 256 is the right cap for cost is a library question for another card; nothing was changed here.

## Method and caveats

- **Per-quantum time** comes from a subclass of the real `RealTimeBpmProcessor` (`benchmark/browser-cost/timed-processor.ts`) that times `process()` and the async `analyzeChunk` it starts. The analysis settles in the microtask checkpoint right after its quantum, so the harness charges it to that quantum and counts any that spill into the next one (0 in every run).
- **Worklet clock**: Chrome 156 exposes no `performance` in `AudioWorkletGlobalScope`, so in the worklet the harness falls back to `Date.now` (1 ms resolution). Means over 60 s are sound, percentiles are quantised. The **main-thread replay** feeds the same class the same quanta with `performance.now()` (5 µs, the page is cross-origin isolated), and gives the fine-grained numbers.
- **CPU throttling** (`Emulation.setCPUThrottlingRate` 4 and 6) does not reach the audio worklet thread: worklet numbers are flat across levels. The throttled numbers to read are the replay's. Throttling slows the main thread by a factor; it is a proxy for modest hardware, not a real low-end device. Peaks' offline path renders through an `OfflineAudioContext`, which throttling may also not reach fully.
- The native biquad in front of peaks runs outside the processor and is not counted.
- Late or dropped quanta can't be counted (no `playoutStats`); "quanta over budget" and "spilled" stand in.
- Worklet heap is read through the DevTools target of the worklet isolate after a forced GC.
- Runner CPUs vary between jobs, which is why all throttle levels run in one job.

## How to rerun

- On GitHub: once merged, `gh workflow run browser-cost.yml -f seconds=64 -f memory_seconds=600` (workflow_dispatch). Before merge, any PR that touches `benchmark/browser-cost/` or the workflow runs it. The `browser-cost-report` artifact holds `report.md` and the raw JSON.
- Locally (needs Chrome from puppeteer; it is muted): from the repo root, `packages/realtime-bpm-analyzer/benchmark/browser-cost/run.sh run cost --throttle 1,4,6 --seconds 64 --out cost.json`, `run.sh run memory --engine tempogram --seconds 600 --out memory-tempogram.json`, `run.sh run bundle --out bundle.json`, then `run.sh report *.json`.

## Numbers (run 41653918729, generated by `report.ts`)

Machines: AMD EPYC 9V74 80-Core Processor, 4 CPUs, 15.6 GiB; AMD EPYC 7763 64-Core Processor, 4 CPUs, 15.6 GiB, Chrome/156.0.8078.47; AMD EPYC 9V45 96-Core Processor, 4 CPUs, 15.6 GiB, Chrome/156.0.8078.47; Intel(R) Xeon(R) 6975P-C, 4 CPUs, 15.3 GiB, Chrome/156.0.8078.47
Probe: {"userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36","crossOriginIsolated":true,"hardwareConcurrency":4,"hasPlayoutStats":false,"hasRenderCapacity":false}
Worklet clock: Date.now

### Realtime, inside the AudioWorklet

| engine | rate | throttle | quanta | mean ms | p95 ms | p99 ms | max ms | mean share | p99 share | max share | analysis mean ms | analysis p99 ms | analysis max ms | quanta over budget | spilled | fallback events | last BPM |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| peaks | 44.1 kHz | 1x | 22123 | 0.007 | 0.000 | 0.000 | 1.00 | 0.2% | 0.0% | 34.5% | 0.170 | 1.00 | 1.00 | 0 | 0 | n/a | 128.0 |
| tempogram | 44.1 kHz | 1x | 22119 | 0.026 | 0.000 | 1.00 | 6.00 | 0.9% | 34.5% | 206.7% | 0.807 | 1.00 | 6.00 | 2 | 0 | n/a | 128.0 |
| peaks | 48 kHz | 1x | 24080 | 0.013 | 0.000 | 1.00 | 1.00 | 0.5% | 37.5% | 37.5% | 0.348 | 1.00 | 1.00 | 0 | 0 | n/a | 128.0 |
| tempogram | 48 kHz | 1x | 24080 | 0.021 | 0.000 | 1.00 | 5.00 | 0.8% | 37.5% | 187.5% | 0.635 | 1.00 | 5.00 | 2 | 0 | n/a | 128.0 |
| peaks | 44.1 kHz | 4x | 22319 | 0.006 | 0.000 | 0.000 | 1.00 | 0.2% | 0.0% | 34.5% | 0.170 | 1.00 | 1.00 | 0 | 0 | n/a | 128.0 |
| tempogram | 44.1 kHz | 4x | 22316 | 0.026 | 0.000 | 1.00 | 7.00 | 0.9% | 34.5% | 241.2% | 0.823 | 1.00 | 7.00 | 2 | 0 | n/a | 128.0 |
| peaks | 48 kHz | 4x | 24313 | 0.011 | 0.000 | 1.00 | 2.00 | 0.4% | 37.5% | 75.0% | 0.319 | 1.00 | 2.00 | 0 | 0 | n/a | 128.0 |
| tempogram | 48 kHz | 4x | 24309 | 0.020 | 0.000 | 1.00 | 6.00 | 0.8% | 37.5% | 225.0% | 0.613 | 1.00 | 6.00 | 2 | 0 | n/a | 128.0 |
| peaks | 44.1 kHz | 6x | 22449 | 0.022 | 0.000 | 1.00 | 2.00 | 0.7% | 34.5% | 68.9% | 0.499 | 1.00 | 2.00 | 0 | 0 | n/a | 128.0 |
| tempogram | 44.1 kHz | 6x | 22439 | 0.026 | 0.000 | 1.00 | 7.00 | 0.9% | 34.5% | 241.2% | 0.817 | 1.00 | 7.00 | 2 | 0 | n/a | 128.0 |
| peaks | 48 kHz | 6x | 24475 | 0.010 | 0.000 | 1.00 | 1.00 | 0.4% | 37.5% | 37.5% | 0.295 | 1.00 | 1.00 | 0 | 0 | n/a | 128.0 |
| tempogram | 48 kHz | 6x | 24463 | 0.020 | 0.000 | 1.00 | 5.00 | 0.8% | 37.5% | 187.5% | 0.619 | 1.00 | 5.00 | 1 | 0 | n/a | 128.0 |

### Main-thread replay of the same processor class

| engine | rate | throttle | quanta | mean ms | p95 ms | p99 ms | max ms | mean share | p99 share | max share | analysis mean ms | analysis p99 ms | analysis max ms | quanta over budget | spilled | fallback events | last BPM |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| peaks | 44.1 kHz | 1x | 22050 | 0.006 | 0.005 | 0.165 | 2.07 | 0.2% | 5.7% | 71.3% | 0.160 | 0.390 | 1.97 | 0 | 0 | n/a | 128.0 |
| tempogram | 44.1 kHz | 1x | 22050 | 0.016 | 0.005 | 0.455 | 6.50 | 0.5% | 15.7% | 223.9% | 0.493 | 1.06 | 6.47 | 2 | 0 | n/a | 128.0 |
| peaks | 48 kHz | 1x | 24000 | 0.005 | 0.005 | 0.180 | 0.460 | 0.2% | 6.8% | 17.3% | 0.158 | 0.365 | 0.460 | 0 | 0 | n/a | 128.0 |
| tempogram | 48 kHz | 1x | 24000 | 0.018 | 0.005 | 0.535 | 6.80 | 0.7% | 20.1% | 255.2% | 0.576 | 0.925 | 6.78 | 3 | 0 | n/a | 128.0 |
| peaks | 44.1 kHz | 4x | 22050 | 0.027 | 0.005 | 0.985 | 7.20 | 0.9% | 33.9% | 248.2% | 0.826 | 1.98 | 7.20 | 2 | 0 | n/a | 128.0 |
| tempogram | 44.1 kHz | 4x | 22050 | 0.078 | 0.005 | 2.59 | 13.18 | 2.7% | 89.4% | 454.1% | 2.46 | 3.78 | 13.17 | 114 | 0 | n/a | 128.0 |
| peaks | 48 kHz | 4x | 24000 | 0.029 | 0.005 | 1.05 | 2.23 | 1.1% | 39.4% | 83.8% | 0.874 | 1.90 | 2.23 | 0 | 0 | n/a | 128.0 |
| tempogram | 48 kHz | 4x | 24000 | 0.082 | 0.005 | 2.69 | 7.33 | 3.1% | 100.7% | 274.7% | 2.57 | 4.26 | 7.32 | 248 | 0 | n/a | 128.0 |
| peaks | 44.1 kHz | 6x | 22050 | 0.038 | 0.005 | 1.36 | 15.09 | 1.3% | 46.9% | 519.9% | 1.10 | 2.36 | 14.28 | 4 | 0 | n/a | 128.0 |
| tempogram | 44.1 kHz | 6x | 22050 | 0.127 | 0.005 | 4.19 | 21.10 | 4.4% | 144.4% | 727.0% | 3.97 | 6.07 | 21.08 | 653 | 0 | n/a | 128.0 |
| peaks | 48 kHz | 6x | 24000 | 0.041 | 0.005 | 1.49 | 3.27 | 1.5% | 55.9% | 122.8% | 1.24 | 2.65 | 3.27 | 6 | 0 | n/a | 128.0 |
| tempogram | 48 kHz | 6x | 24000 | 0.125 | 0.005 | 4.13 | 12.52 | 4.7% | 154.7% | 469.7% | 3.90 | 6.19 | 12.52 | 725 | 0 | n/a | 128.0 |

### Offline, analyzeFullBuffer at 44.1 kHz

| engine | clip | throttle | first call ms per audio s | median ms per audio s | calls | top tempo |
|---|---:|---|---:|---:|---:|---:|
| peaks | 30 s | 1x | 1.08 | 1.05 | 5 | 128.0 |
| tempogram | 30 s | 1x | 6.37 | 6.26 | 5 | 128.0 |
| peaks | 300 s | 1x | 0.998 | 1.01 | 3 | 128.0 |
| tempogram | 300 s | 1x | 6.28 | 6.27 | 3 | 128.0 |
| peaks | 30 s | 4x | 2.87 | 2.76 | 5 | 128.0 |
| tempogram | 30 s | 4x | 30.71 | 29.59 | 5 | 128.0 |
| peaks | 300 s | 4x | 2.42 | 2.47 | 3 | 128.0 |
| tempogram | 300 s | 4x | 28.79 | 29.23 | 3 | 128.0 |
| peaks | 30 s | 6x | 3.39 | 3.78 | 5 | 128.0 |
| tempogram | 30 s | 6x | 42.71 | 41.84 | 5 | 128.0 |
| peaks | 300 s | 6x | 3.68 | 3.68 | 3 | 128.0 |
| tempogram | 300 s | 6x | 43.53 | 43.53 | 3 | 128.0 |

### Memory, heap after a forced GC, 44.1 kHz

| engine | where | samples | first MiB | last MiB | max MiB |
|---|---|---:|---:|---:|---:|
| peaks | AudioWorklet isolate, realtime 600 s | 19 | 0.40 at 30 s | 0.45 at 570 s | 0.45 |
| peaks | main-thread replay 600 s | 20 | 0.91 at 30 s | 0.99 at 600 s | 0.99 |
| tempogram | AudioWorklet isolate, realtime 600 s | 19 | 0.43 at 30 s | 0.46 at 570 s | 0.46 |
| tempogram | main-thread replay 600 s | 20 | 0.92 at 30 s | 0.98 at 600 s | 0.98 |

### Cost over a long run, ms of CPU per audio second, by audio minute

| engine | where | minute 1 | minute 2 | minute 5 | minute 10 | last / first |
|---|---|---:|---:|---:|---:|---:|
| peaks | AudioWorklet | 0.550 | 2.05 | 4.22 | 7.75 | 14.09 |
| peaks | main-thread replay | 0.944 | 1.49 | 3.73 | 6.94 | 7.35 |
| tempogram | AudioWorklet | 7.10 | 5.00 | 5.10 | 5.07 | 0.71 |
| tempogram | main-thread replay | 3.98 | 3.76 | 3.74 | 3.76 | 0.94 |

### Memory runs, realtime timing over the whole run

| engine | rate | throttle | quanta | mean ms | p95 ms | p99 ms | max ms | mean share | p99 share | max share | analysis mean ms | analysis p99 ms | analysis max ms | quanta over budget | spilled | fallback events | last BPM |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| peaks | 44.1 kHz | 1x | 206767 | 0.003 | 0.000 | 0.000 | 3.00 | 0.5% | 0.0% | 103.4% | 0.422 | 1.00 | 3.00 | 0 | 0 | n/a | 128.0 |
| tempogram | 44.1 kHz | 1x | 206774 | 0.019 | 0.000 | 1.00 | 5.00 | 0.5% | 34.5% | 172.3% | 0.449 | 1.00 | 5.00 | 2 | 0 | n/a | 128.0 |

### Bundle, minified, gzip -9 (bytes)

| bundle | minified | gzip | without tempogram, minified | without, gzip | added, minified | added, gzip | tempogram.ts bytes in output |
|---|---:|---:|---:|---:|---:|---:|---:|
| processor | 14974 | 5965 | 8920 | 3420 | 6054 | 2545 | 6058 |
| index | 32312 | 10414 | 19810 | 6130 | 12502 | 4284 | 6447 |

DevTools targets seen during the memory run: browser ; page about:blank; page http://127.0.0.1:36751/; other http://127.0.0.1:36751/
