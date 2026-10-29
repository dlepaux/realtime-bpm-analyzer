// Top candidate analyzeFullBuffer returns for bass-test.wav (24-bit stereo, 44.1 kHz, channel 0).
// The browser parity test asserts it, and tests/node asserts the Node entry returns it too.
export const bassTestExpected = {
  sampleRate: 44_100,
  tempo: 125,
  count: 6,
};
