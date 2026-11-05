import type {OfflineOptions, OfflineResult} from '../contract/types';
import {assertNoRemovedOptions, resolveOfflineEngine, toReading} from './engine';
import {resolveTempoRange} from './tempo';
import {detectTempo} from './detect-tempo';
import {detectTempogram} from './tempogram';
import type {BiquadFilterOptions} from './types';

/**
 * Whole-buffer analysis, shared by `analyzeFullBuffer` and `analyzeChannelData` so that both, and the realtime
 * readings, go through the same validation and the same `toReading`.
 * @param channelData The samples of one channel
 * @param sampleRate Their rate
 * @param options The caller's options
 * @param lowpass Filters the samples for `peaks`, the way the runtime can
 * @returns The reading, or null when no tempo was found
 */
export async function analyzeSamples(
  channelData: Float32Array,
  sampleRate: number,
  options: OfflineOptions | undefined,
  lowpass: (settings: BiquadFilterOptions) => Promise<Float32Array>,
): Promise<OfflineResult> {
  // Validated before the costly filtering, so a bad option fails fast on long files
  assertNoRemovedOptions(options);
  const engine = resolveOfflineEngine(options?.engine);
  const tempoRange = resolveTempoRange(options?.tempoRange);
  const audio = {from: 0, to: channelData.length / sampleRate, contextTime: null};

  if (engine.name === 'tempogram') {
    return toReading(detectTempogram(channelData, sampleRate, tempoRange), audio, 'tempogram');
  }

  const filtered = await lowpass(engine.lowpass);
  return toReading(await detectTempo(filtered, sampleRate, tempoRange), audio, 'peaks');
}
