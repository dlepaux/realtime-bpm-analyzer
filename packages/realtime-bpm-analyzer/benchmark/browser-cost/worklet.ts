// Worklet entry: the library's processor, timed. Its own module also registers the untimed processor,
// which nothing instantiates here.
import {RealTimeBpmProcessor} from '../../src/processor/realtime-bpm-processor';
import {timedProcessor, timedProcessorName} from './timed-processor';

declare function registerProcessor(name: string, processorCtor: unknown): void;

// Chromium may not expose `performance` in an AudioWorkletGlobalScope: the report names the clock used
const performanceClock = (globalThis as {performance?: {now?: () => number}}).performance;
const hasPerformance = typeof performanceClock?.now === 'function';
const now = hasPerformance ? () => performanceClock!.now!() : () => Date.now();

registerProcessor(timedProcessorName, timedProcessor(RealTimeBpmProcessor, now, hasPerformance ? 'performance.now' : 'Date.now'));
