/**
 * Reads the fixtures channelDataJson
 * @param audioContext AudioContext instance
 * @returns A Float32Array
 */
export async function readChannelData(audioContext: AudioContext): Promise<Float32Array> {
  const response = await fetch('/tests/fixtures/bass-test.wav');
  const buffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(buffer);
  return audioBuffer.getChannelData(0);
}

/**
 * Reads the fixtures channelDataJson and returns chunks of it
 * @param audioContext AudioContext instance
 * @param bufferSize Size of the buffer
 * @returns A Float32Array representing the PCM Data
 */
export async function readChannelDataToChunk(audioContext: AudioContext, bufferSize: number): Promise<Float32Array[]> {
  const channelData = await readChannelData(audioContext);
  const chunks: Float32Array[] = [];

  let currentChunk: number[] = [];
  for (const value of channelData) {
    currentChunk.push(value);

    if (currentChunk.length === bufferSize) {
      chunks.push(new Float32Array(currentChunk));
      currentChunk = [];
    }
  }

  return chunks;
}
