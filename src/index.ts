import {realtimeBpmProcessorName} from './consts';

export * from './realtime-bpm-analyzer';
export {analyzeFullBuffer, getBiquadFilters} from './analyzer';
export * from './types';

/**
 * Create the RealTimeBpmProcessor needed to run the realtime strategy
 * ENsure that the biquad lowpass filter is done before using this library
 * @param {AudioContext} audioContext AudioContext instance
 * @returns {Promise<AudioWorkletNode>}
 * @public
 */
export async function createRealTimeBpmProcessor(audioContext: AudioContext, realtimeBpmProcessorPath = `/${realtimeBpmProcessorName}.js`): Promise<AudioWorkletNode> {
  const processorNode = await setupAudioWorkletNode(audioContext, realtimeBpmProcessorPath, realtimeBpmProcessorName);

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
async function setupAudioWorkletNode(audioContext: AudioContext, pathToProcessor: string, processorName: string): Promise<AudioWorkletNode> {
  try {
    await audioContext.audioWorklet.addModule(pathToProcessor);

    const audioWorkletNode = new AudioWorkletNode(audioContext, processorName);

    return audioWorkletNode;
  } catch (error: unknown) {
    console.error('setupAudioWorkletNode ERROR', error);
    throw error;
  }
}
