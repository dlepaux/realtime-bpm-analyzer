// CPU per second of audio, per detector and input shape, on one thread. A chunk is 4096 samples,
// so the worklet sees one about every 93 ms; a render quantum lasts 2.9 ms, and a chunk's work
// happens inside one `process()` call, so the worst chunk is the number that could glitch audio.
import {RealTimeBpmAnalyzer} from '../src/core/realtime-bpm-analyzer';
import {createTempogramDetector} from '../src/core/tempogram';
import {applyLowpass} from '../src/core/lowpass';
import type {RealTimeBpmAnalyzerParameters} from '../src/core/types';

const sampleRate = 44_100;
const seconds = 60;
const chunkSize = 4096;

function noise(length: number): Float32Array {
  let state = 42;

  return Float32Array.from({length}, () => {
    state = ((state * 1_664_525) + 1_013_904_223) >>> 0;

    return (state / 4_294_967_296) - 0.5;
  });
}

function clicks(length: number, bpm: number): Float32Array {
  const pcm = noise(length);
  const period = (60 / bpm) * sampleRate;

  return pcm.map((value, i) => value * Math.exp(-(i % period) / 300));
}

const shapes: Record<string, Float32Array> = {
  silence: new Float32Array(seconds * sampleRate),
  noise: noise(seconds * sampleRate),
  'clicks 128': clicks(seconds * sampleRate, 128),
};

function percentile(sorted: number[], ratio: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function report(label: string, times: number[]): void {
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((sum, time) => sum + time, 0);

  console.log(`| ${label} | ${(total / seconds).toFixed(2)} | ${(total / seconds / 10).toFixed(3)}% | ${percentile(sorted, 0.5).toFixed(3)} | ${percentile(sorted, 0.99).toFixed(3)} | ${sorted.at(-1)!.toFixed(3)} |`);
}

async function timeAnalyzer(pcm: Float32Array, options: RealTimeBpmAnalyzerParameters): Promise<number[]> {
  const analyzer = new RealTimeBpmAnalyzer(options);
  const times: number[] = [];

  for (let start = 0; start + chunkSize <= pcm.length; start += chunkSize) {
    const channelData = pcm.subarray(start, start + chunkSize);
    const before = performance.now();

    await analyzer.analyzeChunk({
      audioSampleRate: sampleRate, channelData, bufferSize: chunkSize, postMessage() {},
    });
    times.push(performance.now() - before);
  }

  return times;
}

function timeOnsetOnly(pcm: Float32Array): number[] {
  // An update period longer than the input leaves only the onset stage
  const detector = createTempogramDetector({sampleRate, tuning: {warmupSeconds: 1e6}});
  const times: number[] = [];

  for (let start = 0; start + chunkSize <= pcm.length; start += chunkSize) {
    const chunk = pcm.subarray(start, start + chunkSize);
    const before = performance.now();

    detector.process(chunk);
    times.push(performance.now() - before);
  }

  return times;
}

console.log('| input, detector | ms per s of audio | CPU | chunk p50 ms | chunk p99 ms | chunk max ms |\n|---|---:|---:|---:|---:|---:|');

async function main(): Promise<void> {
  for (const [name, pcm] of Object.entries(shapes)) {
    // The first pass warms the JIT, the audio thread's steady state is what matters
    await timeAnalyzer(pcm, {detector: 'tempogram'});
    report(`${name}, tempogram`, await timeAnalyzer(pcm, {detector: 'tempogram'}));
    report(`${name}, tempogram onset stage only`, timeOnsetOnly(pcm));

    const lowpassed = applyLowpass(pcm, sampleRate);

    await timeAnalyzer(lowpassed, {});
    report(`${name}, peaks`, await timeAnalyzer(lowpassed, {}));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
