import {Readable} from 'stream';
import {Blob, Buffer} from 'buffer';
import {promises} from 'fs';

/**
 * @param {Buffer} buffer Buffer
 * @returns {Readable} Readable stream
 */
export function bufferToStream(buffer: Buffer): Readable {
    const readableInstanceStream = new Readable({
    read() {
        this.push(buffer);
        this.push(null);
    },
    });

    return readableInstanceStream;
};

/**
 * @param {Readable} stream Readable stream
 * @param {string | null} mimeType MimeType (optional)
 * @returns {Promise<Blob>} Blob
 */
export function streamToBlob(stream: Readable, mimeType: string | null = null): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream
      .on('data', (chunk: unknown) => chunks.push(chunk as never))
      .once('end', () => {
        const blob = mimeType === null
          ? new Blob(chunks)
          : new Blob(chunks, { type: mimeType })
        resolve(blob)
      })
      .once('error', reject)
  })
}

export async function readChannelData() {
    const data: string = await promises.readFile('test/fixtures/bass-test.json', 'utf8');
    const json: Record<string, number> = JSON.parse(data);
    const values: number[] = Object.values(json);
    let channelData = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++) {
        channelData[i] = values[i];
    }

    return channelData;
}

