// The conformance run inside Hermes, React Native's engine. Hermes's shell has no file system and no gzip, so
// build.mjs bundles this file with the library, the vectors and every input's PCM as base64 into one script.
import {analyzeChannelData} from '../../../packages/realtime-bpm-analyzer/dist/node.mjs';
import {decodePcm16, runVectors, summary} from '../core.mjs';
import {pcm, vectors} from 'conformance-data';

/* global print, HermesInternal */
const log = typeof print === 'function' ? print : console.log;

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 to bytes, since Hermes's shell has no atob or Buffer
 * @param {string} text Base64 with padding
 * @returns {Uint8Array} The bytes
 */
function fromBase64(text) {
  const values = new Uint8Array(128);
  for (let i = 0; i < alphabet.length; i += 1) {
    values[alphabet.charCodeAt(i)] = i;
  }

  const padding = text.endsWith('==') ? 2 : (text.endsWith('=') ? 1 : 0);
  const bytes = new Uint8Array(((text.length / 4) * 3) - padding);
  let out = 0;
  for (let i = 0; i < text.length; i += 4) {
    const word = (values[text.charCodeAt(i)] << 18) | (values[text.charCodeAt(i + 1)] << 12)
      | (values[text.charCodeAt(i + 2)] << 6) | values[text.charCodeAt(i + 3)];
    for (const shift of [16, 8, 0]) {
      if (out < bytes.length) {
        bytes[out] = (word >> shift) & 0xff;
        out += 1;
      }
    }
  }

  return bytes;
}

const properties = typeof HermesInternal === 'object' ? HermesInternal.getRuntimeProperties() : {};
const runtime = `Hermes ${properties['OSS Release Version'] ?? 'unknown version'}`;

runVectors({
  vectors,
  loadSamples: async input => decodePcm16(fromBase64(pcm[input.id])),
  analyze: analyzeChannelData,
  log,
}).then(
  result => log(summary(runtime, result)),
  error => log(`conformance: FAIL on ${runtime}: ${error instanceof Error ? error.stack : String(error)}`),
);
