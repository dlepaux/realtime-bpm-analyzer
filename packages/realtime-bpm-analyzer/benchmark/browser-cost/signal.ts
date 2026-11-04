/**
 * A generated drum-and-bass mix: kick on every beat, snare on 2 and 4, closed hats on eighths and an
 * offbeat bass. Licence-clean by construction, and the same bytes on every run, so two engines and two
 * runners hear the same thing. It is busy enough for the peaks engine to find peaks at every threshold,
 * which is its costly case; the tempogram's cost does not depend on the signal.
 * @param sampleRate - Samples per second
 * @param seconds - Length
 * @param bpm - Tempo
 * @returns Mono samples in [-1, 1]
 */
export function drumMix(sampleRate: number, seconds: number, bpm = 128): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const beat = (60 / bpm) * sampleRate;
  let seed = 0x2545_f491;

  for (let i = 0; i < out.length; i += 1) {
    seed = ((seed * 1_664_525) + 1_013_904_223) >>> 0;

    const noise = (seed / 4_294_967_296) - 0.5;
    const inBeat = (i % beat) / sampleRate;
    const inEighth = (i % (beat / 2)) / sampleRate;
    const beatIndex = Math.floor(i / beat) % 4;
    const kickPhase = 2 * Math.PI * ((50 * inBeat) + (70 * 0.03 * (1 - Math.exp(-inBeat / 0.03))));
    const kick = Math.sin(kickPhase) * Math.exp(-inBeat / 0.15);
    const snare = beatIndex % 2 === 1 ? ((noise * 0.8) + (0.3 * Math.sin(2 * Math.PI * 180 * inBeat))) * Math.exp(-inBeat / 0.08) : 0;
    const hat = noise * 0.25 * Math.exp(-inEighth / 0.02);
    const isOffbeat = (i % beat) >= beat / 2;
    const bass = isOffbeat ? 0.2 * ((((55 * i) / sampleRate) % 1) - 0.5) : 0;

    out[i] = 0.5 * (kick + snare + hat + bass);
  }

  return out;
}
