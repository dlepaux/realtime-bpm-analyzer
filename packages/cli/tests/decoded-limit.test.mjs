// The decoded size limit, on synthetic long files: fixtures whose headers are patched to declare
// hours of audio, or to declare nothing, so no test needs gigabytes of disk or memory.
// Needs `npm run build` at the repo root first (dist/api.mjs).
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {chmod, mkdtemp, open, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeFile, decodedLimit, defaultMaxDecodedBytes} from 'realtime-bpm-analyzer-cli';
// Built for these tests and not published: the sample counts are not part of the public API
import {decodeFile} from '../dist/decode.mjs';

const fixture = name => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const tooLong = /^Too long to analyze: the limit is \d+ MB of decoded audio \(\d+ minutes at 44\.1 kHz\)/;
// Refusing from the header must not cost a decode, however long the file claims to be
const headerRefusalMs = 2000;
// Every fixture decodes to more samples than this holds, so reaching it proves the count works
const smallLimit = 40_000;

/** Offset of the first MPEG frame of click-128.mp3, past its ID3 tag: mono MPEG 2, Info tag at +13 */
const mp3Frame = 44;
const mp3Info = mp3Frame + 13;

/**
 * @param {number} dataBytes Value of the data chunk size
 * @returns {Buffer} A 44-byte WAV header, mono 16-bit at 44.1 kHz
 */
function wavHeader(dataBytes) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(Math.min(dataBytes + 36, 0xFF_FF_FF_FF), 4);
  header.write('WAVEfmt ', 8, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44_100, 24);
  header.writeUInt32LE(88_200, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

/**
 * @param {Buffer} flac A FLAC file
 * @param {number} samples Value of the 36-bit STREAMINFO sample count
 * @returns {Buffer} The file declaring that count
 */
function withFlacSamples(flac, samples) {
  const patched = Buffer.from(flac);
  patched[21] = (patched[21] & 0xF0) | Math.floor(samples / 2 ** 32);
  patched.writeUInt32BE(samples % 2 ** 32, 22);
  return patched;
}

/**
 * @param {Buffer} ogg An Ogg file
 * @param {bigint} granule Granule position for its last page
 * @returns {Buffer} The file declaring that length
 */
function withLastGranule(ogg, granule) {
  const patched = Buffer.from(ogg);
  patched.writeBigUInt64LE(granule, patched.lastIndexOf('OggS') + 6);
  return patched;
}

/**
 * @param {Buffer} mp3 click-128.mp3
 * @param {number} frames Value of the Info tag's frame count
 * @returns {Buffer} The file declaring that count
 */
function withInfoFrames(mp3, frames) {
  const patched = Buffer.from(mp3);
  patched.writeUInt32BE(frames, mp3Info + 8);
  return patched;
}

/**
 * @param {Buffer} ogg An Ogg file
 * @param {bigint} offset Added to every page's granule position, as in a stream joined partway
 * @returns {Buffer} The file, the same length of audio
 */
function withGranuleOffset(ogg, offset) {
  const patched = Buffer.from(ogg);
  for (let page = patched.indexOf('OggS'); page >= 0; page = patched.indexOf('OggS', page + 4)) {
    const granule = patched.readBigUInt64LE(page + 6);
    if (granule > 0n && granule < 2n ** 53n) {
      patched.writeBigUInt64LE(granule + offset, page + 6);
    }
  }

  return patched;
}

/**
 * @param {Buffer} flac A FLAC file
 * @returns {number} Where its first frame starts
 */
function flacFramesStart(flac) {
  let position = 4;
  for (;;) {
    const last = (flac[position] & 0x80) !== 0;
    position += 4 + flac.readUIntBE(position + 1, 3);
    if (last) {
      return position;
    }
  }
}

/**
 * @param {number} bits Bits per sample
 * @param {number} channels Channels
 * @returns {Buffer} A one-second WAV of integer PCM with a tone in it, odd sizes welcome
 */
function intWav(bits, channels) {
  const bytes = bits / 8;
  const header = wavHeader(44_100 * bytes * channels);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(44_100 * bytes * channels, 28);
  header.writeUInt16LE(bytes * channels, 32);
  header.writeUInt16LE(bits, 34);
  return Buffer.concat([header, Buffer.alloc(44_100 * bytes * channels, 1)]);
}

describe('decoded size limit', () => {
  let root;

  /**
   * @param {string} name File name
   * @param {Buffer} bytes Content
   * @returns {Promise<string>} Its path
   */
  async function write(name, bytes) {
    const path = join(root, name);
    await writeFile(path, bytes);
    return path;
  }

  /**
   * Asserts a refusal that came from the headers, not from decoding.
   * @param {string} path File
   */
  async function assertRefusedFromHeader(path) {
    const started = performance.now();
    const result = await analyzeFile(path, {ffmpegPath: '/nonexistent/ffmpeg'});
    assert.equal(result.ok, false);
    assert.match(result.error, tooLong);
    assert.ok(performance.now() - started < headerRefusalMs, 'decoded instead of reading the header');
  }

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'rba-cli-limit-'));
  });

  after(async () => {
    await rm(root, {recursive: true, force: true});
  });

  it('states the default limit in plain words', () => {
    assert.equal(defaultMaxDecodedBytes, 2 * 1024 * 1024 * 1024);
    assert.equal(decodedLimit, '2048 MB of decoded audio (202 minutes at 44.1 kHz)');
  });

  describe('before decoding, from what the file declares', () => {
    it('refuses a long MP3 by its Xing or Info frame count', async () => {
      const mp3 = await readFile(fixture('click-128.mp3'));
      await assertRefusedFromHeader(await write('info.mp3', withInfoFrames(mp3, 2_000_000)));
    });

    it('refuses a long MP3 by its VBRI frame count', async () => {
      const frame = Buffer.alloc(417);
      frame.set([0xFF, 0xFB, 0x90, 0x44]);
      frame.write('VBRI', 36, 'latin1');
      frame.writeUInt32BE(1_000_000, 36 + 14);
      await assertRefusedFromHeader(await write('vbri.mp3', frame));
    });

    it('refuses a long WAV by its data size, capped by the size of the file', async () => {
      const dataBytes = 2 * (defaultMaxDecodedBytes / 4 + 1);
      const path = await write('long.wav', wavHeader(dataBytes));
      const short = await analyzeFile(path);
      assert.doesNotMatch(short.ok ? '' : short.error, tooLong, 'a 44-byte file declares no audio it holds');

      const handle = await open(path, 'r+');
      await handle.truncate(44 + dataBytes);
      await handle.close();
      await assertRefusedFromHeader(path);
    });

    it('refuses a long FLAC by its STREAMINFO sample count', async () => {
      const flac = await readFile(fixture('click-100.flac'));
      await assertRefusedFromHeader(await write('long.flac', withFlacSamples(flac, 2 ** 33)));
    });

    for (const name of ['click-140.ogg', 'click-140.opus']) {
      it(`refuses a long ${name} by its last page's granule position`, async () => {
        const ogg = await readFile(fixture(name));
        await assertRefusedFromHeader(await write(`long-${name}`, withLastGranule(ogg, 2n ** 33n)));
      });
    }
  });

  describe('during decoding, from what comes out', () => {
    // Each file understates or hides its length, so the headers let it through
    const cases = {
      'MP3 with a false Info frame count': async () => write('lying.mp3', withInfoFrames(await readFile(fixture('click-128.mp3')), 1)),
      'FLAC with an unknown sample count': async () => write('unknown.flac', withFlacSamples(await readFile(fixture('click-100.flac')), 0)),
      'Ogg Vorbis with a false granule position': async () => write('lying.ogg', withLastGranule(await readFile(fixture('click-140.ogg')), 1n)),
      'Opus with a false granule position': async () => write('lying.opus', withLastGranule(await readFile(fixture('click-140.opus')), 1n)),
    };

    for (const [label, build] of Object.entries(cases)) {
      it(`refuses ${label}`, async () => {
        const path = await build();
        const fits = await analyzeFile(path);
        assert.equal(fits.ok, true, 'the patch must leave the file decodable');

        const result = await analyzeFile(path, {maxDecodedBytes: smallLimit});
        assert.equal(result.ok, false);
        assert.match(result.error, tooLong);
      });
    }

    it('analyses a file that fits under a low limit', async () => {
      for (const name of ['click-128.mp3', 'click-100.flac', 'click-140.ogg', 'click-140.opus']) {
         
        const result = await analyzeFile(fixture(name), {maxDecodedBytes: 8 * 1024 * 1024});
        assert.equal(result.ok, true, name);
        assert.ok(result.bpm !== null, name);
      }
    });
  });

  describe('files that fit are not refused', () => {
    it('reads an interrupted encode, whose Info tag counts 0 frames', async () => {
      const mp3 = await readFile(fixture('click-128.mp3'));
      const result = await analyzeFile(await write('zero-frames.mp3', withInfoFrames(mp3, 0)));
      assert.equal(result.ok, true, result.error);
    });

    for (const name of ['click-140.ogg', 'click-140.opus']) {
      it(`reads ${name} with a last granule of 0`, async () => {
        const result = await analyzeFile(await write(`zero-${name}`, withLastGranule(await readFile(fixture(name)), 0n)));
        assert.equal(result.ok, true, result.error);
      });

      it(`reads ${name} as a stream joined partway, whose granules start high`, async () => {
        const result = await analyzeFile(await write(`joined-${name}`, withGranuleOffset(await readFile(fixture(name)), 2n ** 33n)));
        assert.equal(result.ok, true, result.error);
      });
    }

    it('does not take a large MP3 for a long one from the bitrate of its first frame', async () => {
      // One 8 kbps frame, then a hole: at that rate 36 MB would be 10 hours
      const path = join(root, 'low-first-frame.mp3');
      const handle = await open(path, 'w');
      await handle.write(Buffer.from([0xFF, 0xF3, 0x10, 0xC4]), 0, 4, 0);
      await handle.truncate(36 * 1024 * 1024);
      await handle.close();
      const result = await analyzeFile(path);
      assert.doesNotMatch(result.ok ? '' : result.error, tooLong);
    });

    it('decodes every sample of a long FLAC, whichever step its frame headers fall on', async () => {
      // The fixture's frames repeated for ten minutes, so many frame headers meet a step boundary
      const flac = await readFile(fixture('click-100.flac'));
      const start = flacFramesStart(flac);
      const long = Buffer.concat([flac.subarray(0, start), ...Array.from({length: 30}, () => flac.subarray(start))]);
      const {default: decode} = await import('@audio/decode-flac');
      const expected = (await decode(long)).channelData[0].length;
      const {channelData} = await decodeFile(await write('repeated.flac', withFlacSamples(long, 0)), {ffmpegPath: 'ffmpeg', maxDecodedBytes: 1024 ** 3});
      assert.equal(channelData.length, expected);
    });

    it('skips a large block of cover art in a FLAC, and tags in a WAV', async () => {
      // 48 MB of blocks, past maxBytesWithoutAudio were it fed to the decoder
      const flac = await readFile(fixture('click-100.flac'));
      const streamInfoWasLast = (flac[4] & 0x80) !== 0;
      const art = last => {
        const block = Buffer.alloc(4 + (16 * 1024 * 1024) - 1);
        block.writeUIntBE(block.length - 4, 1, 3);
        block[0] = 6 | (last ? 0x80 : 0);
        return block;
      };

      const tagged = Buffer.concat([flac.subarray(0, 42), art(false), art(false), art(streamInfoWasLast), flac.subarray(42)]);
      tagged[4] &= 0x7F;
      const started = performance.now();
      const result = await analyzeFile(await write('art.flac', tagged));
      assert.equal(result.ok, true, result.error);
      assert.ok(performance.now() - started < headerRefusalMs, 'fed the cover art to the decoder');

      const wav = intWav(16, 1);
      const list = Buffer.alloc(8 + (40 * 1024 * 1024));
      list.write('LIST', 0, 'latin1');
      list.writeUInt32LE(list.length - 8, 4);
      const listed = Buffer.concat([wav.subarray(0, 36), list, wav.subarray(36)]);
      const samples = await decodeFile(await write('list.wav', listed), {ffmpegPath: 'ffmpeg', maxDecodedBytes: 1024 ** 3});
      assert.equal(samples.channelData.length, 44_100);
    });

    it('reads 32-bit integer WAV, which needs its samples aligned', async () => {
      const {channelData} = await decodeFile(await write('int32.wav', intWav(32, 1)), {ffmpegPath: 'ffmpeg', maxDecodedBytes: 1024 ** 3});
      assert.equal(channelData.length, 44_100);
    });
  });

  it('refuses a WAV with more channels than a decode can afford', async () => {
    const wav = intWav(16, 1);
    wav.writeUInt16LE(65_535, 22);
    wav.writeUInt16LE(1, 32);
    const result = await analyzeFile(await write('channels.wav', wav));
    assert.equal(result.ok, false);
    assert.match(result.error, /declares 65535 channels/);
  });

  it('gives up on an Ogg stream that never produces audio', async () => {
    // The fixture's first two pages, then pages whose single packet never ends
    const opus = await readFile(fixture('click-140.opus'));
    const second = opus.indexOf('OggS', 4);
    const third = opus.indexOf('OggS', second + 4);
    const page = Buffer.alloc(27 + 255 + (255 * 255));
    page.write('OggS', 0, 'latin1');
    page[5] = 1;
    page.writeBigInt64LE(-1n, 6);
    page[26] = 255;
    page.fill(255, 27, 27 + 255);
    const pages = Array.from({length: 520}, () => page);
    const result = await analyzeFile(await write('endless.opus', Buffer.concat([opus.subarray(0, third), ...pages])));
    assert.equal(result.ok, false);
    assert.match(result.error, /^No audio found in 32 MB/);
  });

  it('refuses a WAV with no audio chunk instead of buffering the file', async () => {
    const header = wavHeader(0);
    header.write('junk', 36, 'latin1');
    header.writeUInt32LE(1 << 20, 40);
    const path = await write('no-data.wav', Buffer.concat([header, Buffer.alloc(1 << 20)]));
    const result = await analyzeFile(path);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'No audio samples decoded (wav).');
  });

  it('stops a bundled decode when the signal aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await analyzeFile(fixture('click-128.mp3'), {signal: controller.signal});
    assert.equal(result.ok, false);
    assert.match(result.error, /abort/i);
  });

  describe('through ffmpeg', () => {
    /**
     * @param {string} name File name
     * @param {string} body Script body; `args` holds the arguments
     * @returns {Promise<string>} Path of an executable stand-in for ffmpeg
     */
    async function fakeFfmpeg(name, body) {
      const path = await write(name, Buffer.from(`#!/usr/bin/env node\nconst args = process.argv.slice(2);\n${body}\n`));
      await chmod(path, 0o755);
      return path;
    }

    it('kills ffmpeg once its output passes the limit', async () => {
      // Never ends by itself, so the test only finishes if the child is killed
      const ffmpegPath = await fakeFfmpeg('ffmpeg-endless.mjs', `
        const silence = Buffer.alloc(65_536);
        const write = () => process.stdout.write(silence, write);
        write();
      `);
      const result = await analyzeFile(fixture('click-128.m4a'), {ffmpegPath, maxDecodedBytes: 1024 * 1024});
      assert.equal(result.ok, false);
      assert.match(result.error, tooLong);
    });

    it('asks ffmpeg to stop just past the limit', async () => {
      const argsFile = join(root, 'ffmpeg-args.json');
      const ffmpegPath = await fakeFfmpeg('ffmpeg-args.mjs', `
        process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(args));
        process.exit(1);
      `);
      await analyzeFile(fixture('click-128.m4a'), {ffmpegPath, maxDecodedBytes: 44_100 * 4 * 60});
      const args = JSON.parse(await readFile(argsFile, 'utf8'));
      assert.equal(args[args.indexOf('-t') + 1], '61');
    });

    it('joins a sample cut in two by the pipe', async () => {
      // 20 s of 120 BPM clicks, written in chunks that end inside a float
      const ffmpegPath = await fakeFfmpeg('ffmpeg-split.mjs', `
        const pcm = new Float32Array(44_100 * 20);
        for (let i = 0; i < pcm.length; i += 22_050) pcm.fill(1, i, i + 2000);
        const bytes = Buffer.from(pcm.buffer);
        const send = offset => offset < bytes.length && process.stdout.write(bytes.subarray(offset, offset + 65_537), () => send(offset + 65_537));
        send(0);
      `);
      const result = await analyzeFile(fixture('click-128.m4a'), {ffmpegPath});
      assert.equal(result.ok, true, result.error);
      assert.ok(result.bpm !== null);
    });
  });
});
