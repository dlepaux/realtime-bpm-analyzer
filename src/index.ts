import {realtimeBpmProcessorName} from './consts';
import realtimeBpmProcessorContent from './generated-processor';

export * from './realtime-bpm-analyzer';
export {analyzeFullBuffer, getBiquadFilters} from './analyzer';
export * from './types';

/**
 * Create the RealTimeBpmProcessor needed to run the realtime strategy
 * @param {AudioContext} audioContext AudioContext instance
 * @returns {Promise<AudioWorkletNode>}
 * @public
 */
export async function createRealTimeBpmProcessor(audioContext: AudioContext): Promise<AudioWorkletNode> {
  const processorNode = await setupAudioWorkletNode(audioContext, realtimeBpmProcessorName);

  await audioContext.resume();

  return processorNode;
}

/**
 * Creates AudioWorkletNode for the Processor
 * @param {AudioContext} audioContext AudioContext instance
 * @param {string} processorName Name of the audio processor, without the extension
 * @return {Promise<AudioWorkletNode>} Recording node related components for the app.
 * @private
 */
async function setupAudioWorkletNode(audioContext: AudioContext, processorName: string): Promise<AudioWorkletNode> {
  const blob = new Blob([realtimeBpmProcessorContent], {type: 'application/javascript'});

  const objectUrl = URL.createObjectURL(blob);

  await audioContext.audioWorklet.addModule(objectUrl);

  const audioWorkletNode = new AudioWorkletNode(audioContext, processorName);

  return audioWorkletNode;
}
