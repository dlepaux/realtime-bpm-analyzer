import { realtimeBpmProcessorName } from './consts';
export * from './realtime-bpm-analyzer';
export * from './types';

/**
 * Create the RealTimeBpmProcessor needed to run the library trough AudioWorklet
 * This Processor must be AFTER the biquad filter (lowpass)
 * @param audioContext 
 * @returns {Promise<AudioWorkletNode>} 
 * @public
 */
export async function createRealTimeBpmProcessor(audioContext: AudioContext): Promise<AudioWorkletNode> {
    const processorNode = await setupAudioWorkletNode(audioContext, realtimeBpmProcessorName);

    await audioContext.resume();

    return processorNode;
};

/**
 * Creates AudioWorkletNode for the Processor
 * @param {AudioContext} audioContext AudioContext instance
 * @param {string} processorName Name of the audio processor, without the extension
 * @return {Promise<AudioWorkletNode>} Recording node related components for the app.
 * @private
 */
async function setupAudioWorkletNode(audioContext: AudioContext, processorName: string): Promise<AudioWorkletNode> {
  await audioContext.audioWorklet.addModule(`./${processorName}.js`);

  const audioWorkletNode = new AudioWorkletNode(audioContext, processorName);

  return audioWorkletNode;
};
