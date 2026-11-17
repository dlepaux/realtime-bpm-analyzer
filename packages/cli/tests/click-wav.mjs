// Generated WAV files of known length and rate, for the tests that bound the cost of a file.
// The MCP server's tests import it too.

/**
 * A mono 8-bit WAV of 128 BPM clicks, written without holding float samples.
 * @param {number} rate Sample rate the header declares
 * @param {number} samples Length in samples
 * @returns {Buffer} The file
 */
export function clickWav(rate, samples) {
  const file = Buffer.alloc(44 + samples, 128);
  file.write('RIFF', 0, 'latin1');
  file.writeUInt32LE(36 + samples, 4);
  file.write('WAVEfmt ', 8, 'latin1');
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(rate, 24);
  file.writeUInt32LE(rate, 28);
  file.writeUInt16LE(1, 32);
  file.writeUInt16LE(8, 34);
  file.write('data', 36, 'latin1');
  file.writeUInt32LE(samples, 40);
  // At least a sample apart, or a rate under 3 Hz would never get past the first beat
  const beat = Math.max(1, Math.round((rate * 60) / 128));
  const click = Math.max(1, Math.round(0.08 * rate));
  for (let start = 0; start < samples; start += beat) {
    for (let i = 0; i < click && start + i < samples; i += 1) {
      const t = i / rate;
      file[44 + start + i] = Math.round(128 + 115 * Math.exp(-t * 40) * Math.sin(2 * Math.PI * 60 * t));
    }
  }

  return file;
}
