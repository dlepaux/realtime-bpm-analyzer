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

// Loaded on first use, so a run only pays for the decoders its files need
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
 * @param bytes The file, or at least its first bytes past any ID3 tag
 * @returns The built-in decoder to use, or undefined to hand the file to ffmpeg
 */
export function sniffFormat(bytes: Uint8Array): BuiltInFormat | undefined {
  const format = sniffAt(bytes, 0);
  return format === 'aac' ? undefined : format;
}

/**
 * @param bytes File bytes
 * @param start Offset to sniff from
 * @returns The format, 'aac' for ADTS AAC, or undefined when unrecognised
 */
function sniffAt(bytes: Uint8Array, start: number): BuiltInFormat | 'aac' | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(start + from, start + to));
  const byte = (offset: number) => bytes[start + offset] ?? 0;

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

  if (ascii(0, 3) === 'ID3' && start === 0) {
    // An ID3v2 tag can sit in front of FLAC or ADTS AAC too, so look behind it. Its size is
    // 4 syncsafe bytes (7 bits each), plus 10 header bytes and 10 more with a footer.
    const size = ((byte(6) & 0x7F) << 21) | ((byte(7) & 0x7F) << 14) | ((byte(8) & 0x7F) << 7) | (byte(9) & 0x7F);
    const tagged = sniffAt(bytes, size + ((byte(5) & 0x10) === 0 ? 10 : 20));
    // Padding or junk after the tag: MP3 is by far the format most likely to carry one
    return tagged ?? 'mp3';
  }

  // MPEG audio frame sync. Layer bits 00 mean AAC in ADTS.
  if (byte(0) === 0xFF && (byte(1) & 0xE0) === 0xE0) {
    return ((byte(1) >> 1) & 0b11) === 0 ? 'aac' : 'mp3';
  }

  return undefined;
}

/**
 * Decodes an audio file to channel 0 PCM: with a bundled decoder when one handles the
 * format, otherwise with ffmpeg.
 * @param path File to decode
 * @param ffmpegPath ffmpeg binary for formats without a bundled decoder
 * @returns Channel 0 samples and their sample rate
 * @throws {Error} When the file cannot be read or decoded
 */
export async function decodeFile(path: string, ffmpegPath: string): Promise<DecodedAudio> {
  const bytes = await readFile(path);
  const format = sniffFormat(bytes);

  if (format === undefined) {
    return decodeWithFfmpeg(path, ffmpegPath);
  }

  const {channelData, sampleRate} = await (await loaders[format]()).default(bytes);
  const [first] = channelData;
  if (first === undefined || first.length === 0) {
    throw new Error(`No audio samples decoded (${format}).`);
  }

  return {channelData: first, sampleRate};
}

/**
 * Pipes channel 0 of the file through ffmpeg as 32-bit float PCM.
 * @param path File to decode
 * @param ffmpegPath ffmpeg binary
 * @returns Channel 0 samples at ffmpegSampleRate
 */
async function decodeWithFfmpeg(path: string, ffmpegPath: string): Promise<DecodedAudio> {
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

  const exit = await new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolveExit, rejectExit) => {
    child.on('error', rejectExit);
    child.on('close', (code, signal) => resolveExit({code, signal}));
  }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('The bundled decoders do not read this format (they read MP3, WAV, FLAC, OGG Vorbis and Opus), and ffmpeg was not found: install ffmpeg, or set FFMPEG_PATH.');
    }

    throw error;
  });

  if (exit.code !== 0) {
    const detail = exit.signal === null
      ? Buffer.concat(errors).toString('utf8').trim().split('\n').at(-1) ?? ''
      : `killed by ${exit.signal}`;
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
