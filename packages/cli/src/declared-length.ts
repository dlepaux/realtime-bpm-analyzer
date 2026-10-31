/// <reference types="node" />

import type {FileHandle} from 'node:fs/promises';

// What a file's own headers say, read before anything is decoded: its length, so a file over the
// limit is refused in milliseconds, and where its audio starts, so a decoder never has to buffer
// cover art or other metadata. Headers are untrusted. One that understates or omits the length
// only skips the early refusal, because decodeFile also counts the samples that come out. One
// that overstates it refuses the file, which is why the guesses stay out: no length from a
// bitrate, since the first frame of a variable bitrate MP3 says nothing about the others.

export type AudioLayout = {
  /** Samples per channel the headers declare, undefined when they do not say */
  readonly samples: number | undefined;
  /** Headers the decoder needs, fed before the file's bytes from `from` on */
  readonly prefix: Uint8Array;
  readonly from: number;
};

/** One read, shorter than `length` at the end of the file */
export async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const {buffer, bytesRead} = await handle.read(Buffer.alloc(length), 0, length, position);
  return buffer.subarray(0, bytesRead);
}

// Enough for the longest bytes read in one header: the MP3 Xing and VBRI tags
const headBytes = 64;
// An Ogg page is at most 65 307 bytes, so the last one starts within this distance of the end
const oggTailBytes = 65_536;
const oggPageHeaderBytes = 27 + 255;
// Real files have a handful of chunks or blocks and a few hundred header pages (cover art);
// these only stop a crafted walk
const maxWalkSteps = 1024;
const maxFmtBytes = 65_536;
// A decoder allocates every channel of every step, and the limit only counts the first
const maxWavChannels = 64;
const noPrefix = new Uint8Array(0);

/**
 * @param handle Open WAV file
 * @param start Where the RIFF header starts
 * @param size File size
 * @returns The layout. Samples are 0 when no audio chunk follows a format chunk: the decoder
 * would buffer the whole file, waiting for one.
 * @throws {Error} When the format chunk declares more channels than a decode can afford
 */
async function wavLayout(handle: FileHandle, start: number, size: number): Promise<AudioLayout> {
  let position = start + 12;
  let fmt: Buffer | undefined;
  for (let step = 0; step < maxWalkSteps && position + 8 <= size; step += 1) {
     
    const header = await readAt(handle, position, 8);
    const type = header.toString('latin1', 0, 4);
    const chunkBytes = header.readUInt32LE(4);
    if (type === 'data') {
      if (fmt === undefined) {
        break;
      }

      const from = position + 8;
      // 0 and 0xFFFFFFFF are the placeholders of a recorder that never came back to fill them in
      const placeholder = chunkBytes === 0 || chunkBytes === 0xFF_FF_FF_FF;
      const audioBytes = Math.min(placeholder ? Infinity : chunkBytes, size - from);
      const blockBytes = fmt.readUInt16LE(8 + 12);
      const samples = blockBytes === 0 ? 0 : Math.floor(audioBytes / blockBytes);
       
      const riff = await readAt(handle, start, 12);
      return {samples, prefix: Buffer.concat([riff, fmt, header]), from};
    }

    if (type === 'fmt ' && chunkBytes >= 16 && chunkBytes <= maxFmtBytes) {
       
      fmt = await readAt(handle, position, 8 + chunkBytes);
      const channels = fmt.readUInt16LE(8 + 2);
      if (channels > maxWavChannels) {
        throw new Error(`This WAV declares ${channels} channels, over the limit of ${maxWavChannels}.`);
      }
    }

    // RIFF chunks are padded to an even size
    position += 8 + chunkBytes + (chunkBytes % 2);
  }

  return {samples: 0, prefix: noPrefix, from: start};
}

/**
 * @param handle Open FLAC file
 * @param start Where the fLaC marker starts
 * @param size File size
 * @returns The layout: STREAMINFO alone, then the frames
 */
async function flacLayout(handle: FileHandle, start: number, size: number): Promise<AudioLayout> {
  // 'fLaC', the block header, then 10 bytes of sizes and 8 packing rate, channels, depth and
  // the 36-bit total: its top 4 bits are the low nibble of byte 21
  const head = await readAt(handle, start, 42);
  if (head.length < 42) {
    return {samples: undefined, prefix: noPrefix, from: start};
  }

  const total = ((head[21] & 0x0F) * 2 ** 32) + head.readUInt32BE(22);
  const samples = total === 0 ? undefined : total;

  let position = start + 4;
  for (let step = 0; step < maxWalkSteps && position + 4 <= size; step += 1) {
     
    const block = await readAt(handle, position, 4);
    position += 4 + block.readUIntBE(1, 3);
    if ((block[0] & 0x80) !== 0) {
      const prefix = Buffer.from(head);
      // STREAMINFO becomes the last metadata block
      prefix[4] |= 0x80;
      return {samples, prefix, from: position};
    }
  }

  return {samples, prefix: noPrefix, from: start};
}

/**
 * @param head Bytes from an Ogg page on
 * @returns The page's granule position, undefined when it is not a page or no packet ends in it
 * (granule -1, a huge unsigned number here)
 */
function oggGranule(head: Buffer): number | undefined {
  // Byte 4 is the format version, always 0: it tells most false 'OggS' in audio from a page
  if (head.length < 14 || head.toString('latin1', 0, 4) !== 'OggS' || head[4] !== 0) {
    return undefined;
  }

  const granule = head.readBigUInt64LE(6);
  return granule < 2n ** 53n ? Number(granule) : undefined;
}

/**
 * @param handle Open Ogg file
 * @param start Where the first page starts
 * @param size File size
 * @returns The first non-zero granule position, undefined when the walk finds none: a stream
 * joined partway starts counting at any value, so only the distance from it means anything
 */
async function oggFirstGranule(handle: FileHandle, start: number, size: number): Promise<number | undefined> {
  let position = start;
  for (let step = 0; step < maxWalkSteps && position < size; step += 1) {
     
    const head = await readAt(handle, position, oggPageHeaderBytes);
    const granule = oggGranule(head);
    if (head.length < 27 || head.toString('latin1', 0, 4) !== 'OggS') {
      return undefined;
    }

    if (granule !== undefined && granule > 0) {
      return granule;
    }

    const segments = head[26];
    let body = 0;
    for (let i = 0; i < segments; i += 1) {
      body += head[27 + i] ?? 0;
    }

    position += 27 + segments + body;
  }

  return undefined;
}

/**
 * @param handle Open Ogg file
 * @param start Where the first page starts
 * @param size File size
 * @returns Samples per channel at the decoder's rate between the first audio page and the last
 * page, a shade under the real count, or undefined when they do not say
 */
async function oggSamples(handle: FileHandle, start: number, size: number): Promise<number | undefined> {
  const tail = await readAt(handle, Math.max(start, size - oggTailBytes), oggTailBytes);
  let page = tail.lastIndexOf('OggS');
  let last: number | undefined;
  for (let step = 0; step < maxWalkSteps && page >= 0 && last === undefined; step += 1) {
    last = oggGranule(tail.subarray(page, page + 14));
    page = page === 0 ? -1 : tail.lastIndexOf('OggS', page - 1);
  }

  const first = await oggFirstGranule(handle, start, size);
  return last === undefined || first === undefined ? undefined : Math.max(0, last - first);
}

/**
 * @param head Bytes from the first MPEG audio frame on
 * @returns Samples per channel from the Xing or VBRI frame count. An encoder that was
 * interrupted leaves a count of 0, and that file still decodes, so 0 says nothing.
 */
function mp3Samples(head: Buffer): number | undefined {
  if (head.length < headBytes || head[0] !== 0xFF || (head[1] & 0xE0) !== 0xE0) {
    return undefined;
  }

  const version = (head[1] >> 3) & 0b11; // 3 is MPEG 1, 2 is MPEG 2, 0 is MPEG 2.5
  const layer = 4 - ((head[1] >> 1) & 0b11);
  if (version === 1 || layer === 4) {
    return undefined;
  }

  const mpeg1 = version === 3;
  const frameSamples = layer === 1 ? 384 : (layer === 3 && !mpeg1 ? 576 : 1152);

  // The Xing tag sits after the side information, whose size depends on version and channels
  const mono = (head[3] >> 6) === 0b11;
  const xing = 4 + (mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
  const marker = head.toString('latin1', xing, xing + 4);
  let frames = 0;
  if ((marker === 'Xing' || marker === 'Info') && (head[xing + 7] & 1) === 1) {
    frames = head.readUInt32BE(xing + 8);
  } else if (head.toString('latin1', 36, 40) === 'VBRI') {
    frames = head.readUInt32BE(36 + 14);
  }

  return frames === 0 ? undefined : frames * frameSamples;
}

/**
 * @param handle Open audio file
 * @param format Format sniffed from its first bytes
 * @param start Where the format's bytes start, past any ID3 tag
 * @param size File size
 * @returns What its headers declare
 * @throws {Error} When they declare something no decode can afford
 */
export async function readLayout(
  handle: FileHandle,
  format: 'mp3' | 'wav' | 'flac' | 'vorbis' | 'opus',
  start: number,
  size: number,
): Promise<AudioLayout> {
  switch (format) {
    case 'wav': {
      return wavLayout(handle, start, size);
    }

    case 'flac': {
      return flacLayout(handle, start, size);
    }

    case 'mp3': {
      return {samples: mp3Samples(await readAt(handle, start, headBytes)), prefix: noPrefix, from: start};
    }

    default: {
      return {samples: await oggSamples(handle, start, size), prefix: noPrefix, from: start};
    }
  }
}
