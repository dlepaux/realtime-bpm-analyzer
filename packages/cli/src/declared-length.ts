/// <reference types="node" />

import type {FileHandle} from 'node:fs/promises';

// What a file's own headers say about its length, read before anything is decoded, so a file
// over the limit is refused in milliseconds. Headers are untrusted: a lie here only skips this
// early refusal, because decodeFile counts the real samples as they come out.

/** One read, shorter than `length` at the end of the file */
export async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const {buffer, bytesRead} = await handle.read(Buffer.alloc(length), 0, length, position);
  return buffer.subarray(0, bytesRead);
}

// Enough for the longest bytes read in one header: the MP3 Xing and VBRI tags
const headBytes = 64;
// An Ogg page is at most 65 307 bytes, so the last one starts within this distance of the end
const oggTailBytes = 65_536;
// Files carry a handful of RIFF chunks; the bound only stops a crafted walk
const maxRiffChunks = 1024;

/**
 * @param handle Open WAV file
 * @param size File size
 * @returns Samples per channel, 0 when no audio chunk follows a format chunk
 */
async function wavSamples(handle: FileHandle, size: number): Promise<number> {
  let position = 12;
  let blockBytes = 0;
  for (let chunk = 0; chunk < maxRiffChunks && position + 8 <= size; chunk += 1) {
     
    const header = await readAt(handle, position, 8 + 14);
    const type = header.toString('latin1', 0, 4);
    const chunkBytes = header.readUInt32LE(4);
    if (type === 'data') {
      // 0 and 0xFFFFFFFF are the placeholders of a recorder that never came back to fill them in
      const placeholder = chunkBytes === 0 || chunkBytes === 0xFF_FF_FF_FF;
      const audioBytes = Math.min(placeholder ? Infinity : chunkBytes, size - position - 8);
      return blockBytes === 0 ? 0 : Math.floor(audioBytes / blockBytes);
    }

    if (type === 'fmt ' && header.length >= 22) {
      blockBytes = header.readUInt16LE(8 + 12);
    }

    // RIFF chunks are padded to an even size
    position += 8 + chunkBytes + (chunkBytes % 2);
  }

  return 0;
}

/**
 * @param head Bytes from the fLaC marker on
 * @returns The STREAMINFO sample count, undefined when the encoder left it unknown (0)
 */
function flacSamples(head: Buffer): number | undefined {
  // 'fLaC', the block header, then 10 bytes of sizes and 8 packing rate, channels, depth and
  // the 36-bit total: its top 4 bits are the low nibble of byte 21
  if (head.length < 26) {
    return undefined;
  }

  const total = ((head[21] & 0x0F) * 2 ** 32) + head.readUInt32BE(22);
  return total === 0 ? undefined : total;
}

/**
 * @param handle Open Ogg file
 * @param size File size
 * @returns The last page's granule position, which counts samples per channel at the decoder's rate
 */
async function oggSamples(handle: FileHandle, size: number): Promise<number | undefined> {
  const tail = await readAt(handle, Math.max(0, size - oggTailBytes), oggTailBytes);
  let page = tail.lastIndexOf('OggS');
  while (page >= 0) {
    // Byte 4 is the format version, always 0: it tells most false 'OggS' in audio from a page.
    // A page where no packet ends has granule -1, read here as a huge unsigned number.
    if (page + 14 <= tail.length && tail[page + 4] === 0) {
      const granule = tail.readBigUInt64LE(page + 6);
      if (granule < 2n ** 53n) {
        return Number(granule);
      }
    }

    page = tail.lastIndexOf('OggS', page - 1);
  }

  return undefined;
}

const mp3Bitrates: Record<string, readonly number[] | undefined> = {
  v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  v2l23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const mp3SampleRates = [44_100, 48_000, 32_000];

/**
 * @param head Bytes from the first MPEG audio frame on
 * @param audioBytes Bytes from that frame to the end of the file
 * @returns Samples per channel from the Xing or VBRI frame count, else from the first frame's
 * bitrate. A variable bitrate file with neither tag gets a guess, which is all this needs to be.
 */
function mp3Samples(head: Buffer, audioBytes: number): number | undefined {
  if (head.length < headBytes || head[0] !== 0xFF || (head[1] & 0xE0) !== 0xE0) {
    return undefined;
  }

  const version = (head[1] >> 3) & 0b11; // 3 is MPEG 1, 2 is MPEG 2, 0 is MPEG 2.5
  const layer = 4 - ((head[1] >> 1) & 0b11);
  const baseRate = mp3SampleRates[(head[2] >> 2) & 0b11];
  const mpeg1 = version === 3;
  const table = mpeg1 ? `v1l${layer}` : (layer === 1 ? 'v2l1' : 'v2l23');
  const kilobits = mp3Bitrates[table]?.[head[2] >> 4];
  if (version === 1 || layer === 4 || baseRate === undefined || !kilobits) {
    return undefined;
  }

  const sampleRate = baseRate / (mpeg1 ? 1 : (version === 2 ? 2 : 4));
  const frameSamples = layer === 1 ? 384 : (layer === 3 && !mpeg1 ? 576 : 1152);

  // The Xing tag sits after the side information, whose size depends on version and channels
  const mono = (head[3] >> 6) === 0b11;
  const xing = 4 + (mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
  const marker = head.toString('latin1', xing, xing + 4);
  if ((marker === 'Xing' || marker === 'Info') && (head[xing + 7] & 1) === 1) {
    return head.readUInt32BE(xing + 8) * frameSamples;
  }

  if (head.toString('latin1', 36, 40) === 'VBRI') {
    return head.readUInt32BE(36 + 14) * frameSamples;
  }

  return Math.round(audioBytes * 8 / (kilobits * 1000) * sampleRate);
}

/**
 * @param handle Open audio file
 * @param format Format sniffed from its first bytes
 * @param start Where the format's bytes start, past any ID3 tag
 * @param size File size
 * @returns The samples per channel its headers declare, undefined when they do not say.
 * 0 means a WAV without audio: its decoder would buffer the whole file, waiting for a header.
 */
export async function declaredSamples(
  handle: FileHandle,
  format: 'mp3' | 'wav' | 'flac' | 'vorbis' | 'opus',
  start: number,
  size: number,
): Promise<number | undefined> {
  switch (format) {
    case 'wav': {
      return wavSamples(handle, size);
    }

    case 'flac': {
      return flacSamples(await readAt(handle, start, headBytes));
    }

    case 'mp3': {
      return mp3Samples(await readAt(handle, start, headBytes), size - start);
    }

    default: {
      return oggSamples(handle, size);
    }
  }
}
