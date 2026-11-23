import type {LowpassOption, OfflineOptions, OfflineResult} from '../contract/types';
import {assertOptions, resolveOfflineEngine, toReading} from './engine';
import {resolveTempoRange} from './tempo';
import {detectTempo} from './detect-tempo';
import {detectTempogram} from './tempogram';

/**
 * Whole-buffer analysis, shared by `analyzeFullBuffer` and `analyzeChannelData` so that both, and the realtime
 * readings, go through the same validation and the same `toReading`.
 * @param channelData The samples of one channel
 * @param sampleRate Their rate
 * @param options The caller's options
 * @param lowpass Filters the samples for `peaks`, the way the runtime can
 * @returns The reading, or null when no tempo was found
 * @throws {Error} When a sample is NaN or infinite
 */
export async function analyzeSamples(
  channelData: Float32Array,
  sampleRate: number,
  options: OfflineOptions | undefined,
  lowpass: (settings: LowpassOption) => Promise<Float32Array>,
): Promise<OfflineResult> {
  assertFiniteSamples(channelData);
  // Validated before the costly filtering, so a bad option fails fast on long files
  assertOptions(options, 'offline');
  const engine = resolveOfflineEngine(options?.engine, sampleRate);
  const tempoRange = resolveTempoRange(options?.tempoRange);
  const audio = {from: 0, to: channelData.length / sampleRate, contextTime: null};

  if (engine.name === 'tempogram') {
    return toReading(detectTempogram(channelData, sampleRate, tempoRange), audio, 'tempogram', tempoRange);
  }

  const filtered = await lowpass(engine.lowpass);
  const {tempos, calibrated} = await detectTempo(filtered, sampleRate, tempoRange);
  return toReading(tempos, audio, 'peaks', tempoRange, calibrated);
}

/**
 * Refuses a NaN or infinite sample. A whole buffer comes from a caller who can fix its decoding, and such a
 * sample is no PCM: through the peaks lowpass it turned every later sample into NaN, so 6.1.0 read only the audio
 * before it, without a word. Realtime audio has no caller to tell, so there the tempogram reads such a sample as no
 * audio instead.
 * @param channelData The samples of one channel
 * @throws {Error} At the first sample that is not a finite number, naming its index
 */
function assertFiniteSamples(channelData: Float32Array): void {
  for (let i = 0; i < channelData.length; i += 1) {
    if (!Number.isFinite(channelData[i])) {
      throw new Error(`Invalid channel data: sample ${i} is ${channelData[i]}, and every sample must be a finite number.`);
    }
  }
}
