/// <reference types="node" />

import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import type {FileHandle} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readAt, readLayout} from './declared-length';
import type {AudioLayout} from './declared-length';

export type DecodedAudio = {
  /** Channel 0, the channel analyzeFullBuffer analyses in the browser */
  readonly channelData: Float32Array;
  readonly sampleRate: number;
};

/** Formats with a bundled pure JS/WASM decoder; anything else goes to ffmpeg */
export type BuiltInFormat = 'mp3' | 'wav' | 'flac' | 'vorbis' | 'opus';

export type DecodeOptions = {
  /** ffmpeg binary for formats without a bundled decoder */
  readonly ffmpegPath: string;
  /** Most PCM bytes (channel 0, 32-bit float) to hold before refusing the file */
  readonly maxDecodedBytes: number;
  /** Stops a decode in progress */
  readonly signal?: AbortSignal;
};

type DecodedChannels = {channelData: Float32Array[]; sampleRate: number};

// mpg123's decoder has no flush; the WAV one is synchronous, the WASM ones hide behind a promise
type StreamDecoder = {
  decode: (chunk: Uint8Array) => DecodedChannels;
  flush?: () => DecodedChannels;
  free: () => void;
};

type DecodeModule = {decoder: () => StreamDecoder | Promise<StreamDecoder>};

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

// Input step of the bundled decoders, and so the bound on what one step can yield before the
// count is checked. Compression makes that large: silent FLAC needs about 15 bytes per 65 535
// samples per channel, so keep this small. Streaming in such steps measured faster than a
// whole-file decode, which also keeps every channel.
const inputChunkBytes = 4096;

// Longest ID3 look-ahead needed to tell the format
const sniffBytes = 64;

// Input a decoder may swallow with nothing to show for it. Ogg and FLAC parsers buffer it and
// copy that buffer at every step, so without this a tiny-audio file costs minutes and gigabytes.
const maxBytesWithoutAudio = 32 * 1024 * 1024;

const bytesPerSample = Float32Array.BYTES_PER_ELEMENT;
const sinkStepBytes = 16 * 1024 * 1024;

/**
 * @param maxBytes The limit
 * @returns The limit in the plain words every refusal and document uses
 */
export function describeDecodedLimit(maxBytes: number): string {
  const minutes = Math.floor(maxBytes / bytesPerSample / 44_100 / 60);
  return `${Math.round(maxBytes / (1024 * 1024))} MB of decoded audio (${minutes} minutes at 44.1 kHz)`;
}

/**
 * @param maxBytes The limit
 * @returns The refusal of a file over the limit
 */
function tooLong(maxBytes: number): Error {
  return new Error(`Too long to analyze: the limit is ${describeDecodedLimit(maxBytes)}, for the first channel.`);
}

type PcmSink = {
  /** Adds the samples, or returns false and adds nothing when they would pass the limit */
  readonly push: (samples: Float32Array) => boolean;
  readonly samples: () => Float32Array;
};

/**
 * Collects samples without ever holding two copies of them: a resizable buffer reserves the
 * address space of the whole limit and commits memory only as it grows.
 * @param maxBytes The limit
 * @returns The sink
 */
function createSink(maxBytes: number): PcmSink {
  const maxSamples = Math.floor(maxBytes / bytesPerSample);
  const buffer = new ArrayBuffer(0, {maxByteLength: maxSamples * bytesPerSample});
  const pcm = new Float32Array(buffer);
  let length = 0;
  return {
    push(samples) {
      if (length + samples.length > maxSamples) {
        return false;
      }

      const needed = (length + samples.length) * bytesPerSample;
      if (needed > buffer.byteLength) {
        // In steps: each resize is a system call that costs more as the buffer grows
        buffer.resize(Math.min(needed + sinkStepBytes, buffer.maxByteLength));
      }

      pcm.set(samples, length);
      length += samples.length;
      return true;
    },
    samples: () => pcm.subarray(0, length),
  };
}

/**
 * Identifies a format from its first bytes, so a misnamed file still decodes.
 * @param bytes The first bytes of the audio
 * @returns The format, 'aac' for ADTS AAC, or undefined when unrecognised
 */
function sniffBytesFormat(bytes: Uint8Array): BuiltInFormat | 'aac' | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  const byte = (offset: number) => bytes[offset] ?? 0;

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

  // MPEG audio frame sync. Layer bits 00 mean AAC in ADTS.
  if (byte(0) === 0xFF && (byte(1) & 0xE0) === 0xE0) {
    return ((byte(1) >> 1) & 0b11) === 0 ? 'aac' : 'mp3';
  }

  return undefined;
}

/**
 * @param handle Open file
 * @returns The built-in decoder to use, undefined to hand the file to ffmpeg, and where the
 * audio starts past any ID3 tag
 */
async function sniffFile(handle: FileHandle): Promise<{format: BuiltInFormat | undefined; start: number}> {
  const head = await readAt(handle, 0, sniffBytes);
  if (head.toString('latin1', 0, 3) !== 'ID3') {
    const format = sniffBytesFormat(head);
    return {format: format === 'aac' ? undefined : format, start: 0};
  }

  // An ID3v2 tag can sit in front of FLAC or ADTS AAC too, so look behind it. Its size is
  // 4 syncsafe bytes (7 bits each), plus 10 header bytes and 10 more with a footer.
  const byte = (offset: number) => head[offset] ?? 0;
  const size = ((byte(6) & 0x7F) << 21) | ((byte(7) & 0x7F) << 14) | ((byte(8) & 0x7F) << 7) | (byte(9) & 0x7F);
  const start = size + ((byte(5) & 0x10) === 0 ? 10 : 20);
  // Padding or junk after the tag: MP3 is by far the format most likely to carry one
  const format = sniffBytesFormat(await readAt(handle, start, sniffBytes)) ?? 'mp3';
  return {format: format === 'aac' ? undefined : format, start};
}

/**
 * Decodes an audio file to channel 0 PCM: with a bundled decoder when one handles the format,
 * otherwise with ffmpeg. The size of the PCM is bounded before decoding, from what the file
 * declares, and during it, from what actually comes out, because a file can lie or say nothing.
 * The audio is read in small steps, and channels past the first are dropped as they are decoded.
 * @param path File to decode
 * @param options ffmpeg binary, limit and abort signal
 * @returns Channel 0 samples and their sample rate
 * @throws {Error} When the file cannot be read or decoded, or is over the limit
 */
export async function decodeFile(path: string, options: DecodeOptions): Promise<DecodedAudio> {
  const handle = await open(path);
  try {
    const {format, start} = await sniffFile(handle);
    if (format === undefined) {
      return await decodeWithFfmpeg(path, options);
    }

    const {size} = await handle.stat();
    const layout = await readLayout(handle, format, start, size);
    if (layout.samples !== undefined && layout.samples * bytesPerSample > options.maxDecodedBytes) {
      throw tooLong(options.maxDecodedBytes);
    }

    if (layout.samples === 0 && format === 'wav') {
      throw new Error(`No audio samples decoded (${format}).`);
    }

    return await decodeBundled(handle, format, layout, options);
  } finally {
    await handle.close();
  }
}

/**
 * Where a FLAC input step may end. The FLAC decoder loses a frame for good when a frame's header
 * spans two steps, without an error (seen on @audio/decode-flac 1.3.5), so a step stops short of
 * any frame sync near its end. Frame headers are at most 16 bytes; 32 leaves a margin.
 * @param step A full input step
 * @returns The length to feed, the rest being read again at the head of the next step
 */
function flacStepEnd(step: Uint8Array): number {
  for (let i = step.length - 32; i < step.length; i += 1) {
    const next = step[i + 1];
    if (step[i] === 0xFF && (next === undefined || next === 0xF8 || next === 0xF9)) {
      return i;
    }
  }

  return step.length;
}

/**
 * Feeds the file through the format's streaming decoder, in steps small enough for the limit
 * to hold: nothing but channel 0 of the steps so far stays in memory.
 * @param handle Open file
 * @param format Decoder to use
 * @param layout Where the audio is
 * @param options Limit and abort signal
 * @returns Channel 0 samples and their sample rate
 */
async function decodeBundled(handle: FileHandle, format: BuiltInFormat, layout: AudioLayout, options: DecodeOptions): Promise<DecodedAudio> {
  const {maxDecodedBytes, signal} = options;
  const sink = createSink(maxDecodedBytes);
  const decoder = await (await loaders[format]()).decoder();
  let sampleRate = 0;
  let bytesWithoutAudio = 0;
  const take = ({channelData: [first], sampleRate: rate}: DecodedChannels) => {
    if (first !== undefined && first.length > 0) {
      sampleRate ||= rate;
      bytesWithoutAudio = 0;
      if (!sink.push(first)) {
        throw tooLong(maxDecodedBytes);
      }
    }
  };

  try {
    if (layout.prefix.length > 0) {
      take(decoder.decode(layout.prefix));
    }

    let position = layout.from;
    for (;;) {
       
      const chunk = await readAt(handle, position, inputChunkBytes);
      if (chunk.length === 0) {
        break;
      }

      signal?.throwIfAborted();
      // A fresh buffer each step, as the Ogg and FLAC parsers keep references to their input.
      // A plain Uint8Array, as the WAV decoder's alignment copy only copies through one.
      const end = format === 'flac' && chunk.length === inputChunkBytes ? flacStepEnd(chunk) : chunk.length;
      position += end;
      bytesWithoutAudio += end;
      take(decoder.decode(new Uint8Array(chunk.buffer, chunk.byteOffset, end)));
      if (bytesWithoutAudio > maxBytesWithoutAudio) {
        throw new Error(`No audio found in ${maxBytesWithoutAudio / (1024 * 1024)} MB of this file.`);
      }
    }

    if (decoder.flush !== undefined) {
      take(decoder.flush());
    }
  } finally {
    decoder.free();
  }

  const channelData = sink.samples();
  if (channelData.length === 0) {
    throw new Error(`No audio samples decoded (${format}).`);
  }

  return {channelData, sampleRate};
}

/**
 * Pipes channel 0 of the file through ffmpeg as 32-bit float PCM. ffmpeg is told to stop just
 * past the limit, and killed if its output passes it anyway.
 * @param path File to decode
 * @param options ffmpeg binary, limit and abort signal
 * @returns Channel 0 samples at ffmpegSampleRate
 */
async function decodeWithFfmpeg(path: string, {ffmpegPath, maxDecodedBytes, signal}: DecodeOptions): Promise<DecodedAudio> {
  // A second past the limit, so a file that reaches -t is told from one that fits
  const maxSeconds = Math.ceil(maxDecodedBytes / bytesPerSample / ffmpegSampleRate) + 1;
  const args = [
    '-v', 'error', '-nostdin',
    // `file:` stops ffmpeg from reading a name such as `concat:a|b` or `https://...` as a protocol
    '-i', `file:${resolve(path)}`,
    '-map', '0:a:0', '-af', 'pan=mono|c0=c0', '-t', String(maxSeconds),
    '-f', 'f32le', '-ar', String(ffmpegSampleRate), 'pipe:1',
  ];

  const sink = createSink(maxDecodedBytes);
  // A pipe cuts anywhere, so a chunk can end inside a sample
  let partial: Buffer = Buffer.alloc(0);
  let refused = false;
  let lastError = '';
  const child = spawn(ffmpegPath, args, {stdio: ['ignore', 'pipe', 'pipe'], signal});
  child.stdout.on('data', (chunk: Buffer) => {
    const bytes = partial.length === 0 ? chunk : Buffer.concat([partial, chunk]);
    const samples = new Float32Array(Math.floor(bytes.length / bytesPerSample));
    // readFloatLE rather than a typed-array view: it ignores host byte order and Buffer alignment
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = bytes.readFloatLE(i * bytesPerSample);
    }

    partial = bytes.subarray(samples.length * bytesPerSample);
    if (!refused && !sink.push(samples)) {
      refused = true;
      child.kill('SIGKILL');
    }
  });
  // Only the last line is reported, and a damaged file can make ffmpeg print one per packet
  child.stderr.on('data', (chunk: Buffer) => {
    lastError = `${lastError}${chunk.toString('utf8')}`.slice(-4096);
  });

  const exit = await new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolveExit, rejectExit) => {
    child.on('error', rejectExit);
    child.on('close', (code, signal) => resolveExit({code, signal}));
  }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('The bundled decoders do not read this format (they read MP3, WAV, FLAC, OGG Vorbis and Opus), and ffmpeg was not found: install ffmpeg, or set FFMPEG_PATH.');
    }

    throw error;
  });

  if (refused) {
    throw tooLong(maxDecodedBytes);
  }

  if (exit.code !== 0) {
    const detail = exit.signal === null
      ? lastError.trim().split('\n').at(-1) ?? ''
      : `killed by ${exit.signal}`;
    throw new Error(`ffmpeg could not decode the file${detail === '' ? '' : `: ${detail}`}`);
  }

  const channelData = sink.samples();
  if (channelData.length === 0) {
    throw new Error('No audio samples decoded (ffmpeg).');
  }

  return {channelData, sampleRate: ffmpegSampleRate};
}
