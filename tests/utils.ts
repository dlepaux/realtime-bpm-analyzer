import {data as channelDataJson} from './fixtures/bass-test-lowpassed-channel-data';

/**
 * Reads the fixtures channelDataJson
 * @returns A Float32Array
 */
export function readChannelData(): Float32Array {
  const channelData = new Float32Array(channelDataJson);
  return channelData;
}

/**
 * Reads the fixtures channelDataJson and returns chunks of it
 * @param bufferSize Size of the buffer
 * @returns A Float32Array representing the PCM Data
 */
export function readChannelDataToChunk(bufferSize: number): Float32Array[] {
  const chunks: Float32Array[] = [];

  let currentChunk: number[] = [];
  for (const value of channelDataJson) {
    currentChunk.push(value);

    if (currentChunk.length === bufferSize) {
      chunks.push(new Float32Array(currentChunk));
      currentChunk = [];
    }
  }

  return chunks;
}
