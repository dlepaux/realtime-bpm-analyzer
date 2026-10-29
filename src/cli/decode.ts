/// <reference types="node" />

import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export type DecodedAudio = {
  /** Channel 0, the channel analyzeFullBuffer analyses in the browser */
  readonly channelData: Float32Array;
  readonly sampleRate: number;
};

/** Formats with a bundled pure JS/WASM decoder; anything else goes to ffmpeg */
export type BuiltInFormat = 'mp3' | 'wav' | 'flac' | 'vorbis' | 'opus';

type DecodedChannels = {channelData: Float32Array[]; sampleRate: number};

// The WAV decoder answers synchronously, the WASM ones with a promise
type DecodeModule = {
  default: (bytes: Uint8Array) => DecodedChannels | Promise<DecodedChannels>;
};

// Literal specifiers so bundlers and readers see every optional dependency the CLI loads
const loaders: Record<BuiltInFormat, () => Promise<DecodeModule>> = {
  mp3: async () => import('@audio/decode-mp3'),
  wav: async () => import('@audio/decode-wav'),
  flac: async () => import('@audio/decode-flac'),
  vorbis: async () => import('@audio/decode-vorbis'),
  opus: async () => import('@audio/decode-opus'),
};

// ffmpeg output rate. The analysis works at any rate; one fixed rate keeps the pipe simple.
const ffmpegSampleRate = 44_100;

/**
 * Identifies a format from its first bytes, so a misnamed file still decodes.
 * @param bytes Start of the file (at least 40 bytes when the file has them)
 * @returns The built-in decoder to use, or undefined to hand the file to ffmpeg
 */
export function sniffFormat(bytes: Uint8Array): BuiltInFormat | undefined {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') {
    return 'wav';
  }

  if (ascii(0, 4) === 'fLaC') {
    return 'flac';
  }

  if (ascii(0, 4) === 'OggS') {
    // The first Ogg page carries the codec's identification header at byte 28
    if (ascii(28, 36) === 'OpusHead') {
      return 'opus';
    }

    return ascii(29, 35) === 'vorbis' ? 'vorbis' : undefined;
  }

  if (ascii(0, 3) === 'ID3') {
    return 'mp3';
  }

  // MPEG audio frame sync. Layer bits 00 are AAC in ADTS, which goes to ffmpeg.
  const isFrameSync = bytes[0] === 0xFF && ((bytes[1] ?? 0) & 0xE0) === 0xE0;
  return isFrameSync && (((bytes[1] ?? 0) >> 1) & 0b11) !== 0 ? 'mp3' : undefined;
}

/**
 * Decodes an audio file to channel 0 PCM: with a bundled decoder when one handles the
 * format and is installed, otherwise with ffmpeg.
 * @param path File to decode
 * @param ffmpegPath ffmpeg binary for formats without a bundled decoder
 * @returns Channel 0 samples and their sample rate
 * @throws {Error} When the file cannot be read or decoded
 */
export async function decodeFile(path: string, ffmpegPath: string): Promise<DecodedAudio> {
  const bytes = await readFile(path);
  const format = sniffFormat(bytes);
  const module = format === undefined ? undefined : await loadDecoder(format);

  if (module === undefined) {
    return decodeWithFfmpeg(path, ffmpegPath, format);
  }

  const {channelData, sampleRate} = await module.default(bytes);
  const [first] = channelData;
  if (first === undefined || first.length === 0) {
    throw new Error(`No audio samples decoded (${format}).`);
  }

  return {channelData: first, sampleRate};
}

/**
 * Loads a bundled decoder. The decoders are optional dependencies, so `npm install
 * --omit=optional` leaves them out; ffmpeg then takes over.
 * @param format Format to decode
 * @returns The decoder module, or undefined when it is not installed
 */
async function loadDecoder(format: BuiltInFormat): Promise<DecodeModule | undefined> {
  try {
    return await loaders[format]();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return undefined;
    }

    throw error;
  }
}

/**
 * Pipes channel 0 of the file through ffmpeg as 32-bit float PCM.
 * @param path File to decode
 * @param ffmpegPath ffmpeg binary
 * @param format Built-in format whose decoder is missing, for the error message
 * @returns Channel 0 samples at ffmpegSampleRate
 */
async function decodeWithFfmpeg(path: string, ffmpegPath: string, format: BuiltInFormat | undefined): Promise<DecodedAudio> {
  const args = [
    '-v', 'error', '-nostdin',
    // `file:` stops ffmpeg from reading a name such as `concat:a|b` or `https://...` as a protocol
    '-i', `file:${resolve(path)}`,
    '-map', '0:a:0', '-af', 'pan=mono|c0=c0',
    '-f', 'f32le', '-ar', String(ffmpegSampleRate), 'pipe:1',
  ];

  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  const child = spawn(ffmpegPath, args, {stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));

  const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
    child.on('error', rejectExit);
    child.on('close', resolveExit);
  }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const why = format === undefined
        ? 'The bundled decoders do not read this format (they read MP3, WAV, FLAC, OGG Vorbis and Opus)'
        : `The ${format} decoder (an optional dependency) is not installed`;
      throw new Error(`${why}, and ffmpeg was not found: install ffmpeg, or set FFMPEG_PATH.`);
    }

    throw error;
  });

  if (exitCode !== 0) {
    const detail = Buffer.concat(errors).toString('utf8').trim().split('\n').at(-1) ?? '';
    throw new Error(`ffmpeg could not decode the file${detail === '' ? '' : `: ${detail}`}`);
  }

  // readFloatLE rather than a typed-array view: it ignores host byte order and Buffer alignment
  const pcm = Buffer.concat(chunks);
  const channelData = new Float32Array(Math.floor(pcm.length / 4));
  for (let i = 0; i < channelData.length; i += 1) {
    channelData[i] = pcm.readFloatLE(i * 4);
  }

  if (channelData.length === 0) {
    throw new Error('No audio samples decoded (ffmpeg).');
  }

  return {channelData, sampleRate: ffmpegSampleRate};
}
