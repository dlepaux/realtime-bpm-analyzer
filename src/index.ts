import {realtimeBpmProcessorName} from './core/consts';
import realtimeBpmProcessorContent from './generated-processor';
import {type RealTimeBpmAnalyzerParameters} from './core/types';

export * from './core/realtime-bpm-analyzer';
export {analyzeFullBuffer, getBiquadFilter} from './core/analyzer';
export * from './core/types';

/**
 * Create the RealTimeBpmProcessor needed to run the realtime strategy
 * @param audioContext AudioContext instance
 * @param processorOptions RealTimeBpmAnalyzerParameters
 * @returns An AudioWorkletNode instance
 */
export async function createRealTimeBpmProcessor(audioContext: AudioContext, processorOptions?: RealTimeBpmAnalyzerParameters): Promise<AudioWorkletNode> {
  const processorNode = await setupAudioWorkletNode(audioContext, realtimeBpmProcessorName, processorOptions);

  await audioContext.resume();

  return processorNode;
}

/**
 * Creates AudioWorkletNode for the Processor
 * @param audioContext AudioContext instance
 * @param processorName Name of the audio processor, without the extension
 * @param processorOptions RealTimeBpmAnalyzerParameters
 * @returns Recording node related components for the app.
 */
async function setupAudioWorkletNode(audioContext: AudioContext, processorName: string, processorOptions?: RealTimeBpmAnalyzerParameters): Promise<AudioWorkletNode> {
  const blob = new Blob([realtimeBpmProcessorContent], {type: 'application/javascript'});

  const objectUrl = URL.createObjectURL(blob);

  await audioContext.audioWorklet.addModule(objectUrl);

  const audioWorkletNode = new AudioWorkletNode(audioContext, processorName, {
    processorOptions,
  });

  return audioWorkletNode;
}
