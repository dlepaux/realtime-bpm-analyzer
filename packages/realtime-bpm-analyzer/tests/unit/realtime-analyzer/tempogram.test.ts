import {expect} from 'chai';
import {createClickTrack, createNoise} from '../../fixtures/click-track';
import {createTempogramDetector, detectTempogram} from '../../../src/core/tempogram';
import type {TempogramReading, TempogramTuning} from '../../../src/core/tempogram';

const sampleRate = 44_100;

/**
 * Bright clicks on every beat: a click track for a full-band detector
 */
function createBrightClicks(bpm: number, seconds: number, gain = 1, rate = sampleRate): Float32Array {
  const samples = new Float32Array(Math.round(seconds * rate));
  const period = (60 / bpm) * rate;
  const noise = createNoise(samples.length, 7);

  for (let start = 0; start < samples.length; start += period) {
    const first = Math.round(start);
    const end = Math.min(first + 800, samples.length);

    for (let i = first; i < end; i += 1) {
      samples[i] = gain * noise[i] * Math.exp(-(i - first) / 200);
    }
  }

  return samples;
}

/**
 * Feeds audio chunk by chunk, as the analyzer does
 */
function feed(pcm: Float32Array, rate = sampleRate, tuning?: Partial<TempogramTuning>) {
  const detector = createTempogramDetector({sampleRate: rate, tuning});
  const readings: Array<TempogramReading & {at: number}> = [];

  for (let start = 0; start + 4096 <= pcm.length; start += 4096) {
    const reading = detector.process(pcm.subarray(start, start + 4096));

    if (reading) {
      readings.push({...reading, at: (start + 4096) / rate});
    }
  }

  return readings;
}

describe('tempogram detector', () => {
  for (const bpm of [70, 90, 100, 120, 128, 140, 174]) {
    it(`reads clicks at ${bpm} BPM within 2%`, () => {
      const readings = feed(createBrightClicks(bpm, 20));
      const top = readings.at(-1)!.candidates[0];

      expect(Math.abs(top.tempo - bpm)).to.be.lessThan(bpm * 0.02);
    });
  }

  it('reads the kick-only click track of the peaks tests', () => {
    const top = feed(createClickTrack(128)).at(-1)!.candidates[0];

    expect(Math.abs(top.tempo - 128)).to.be.lessThan(3);
  });

  it('gives no reading above nothing: digital silence', () => {
    const readings = feed(new Float32Array(sampleRate * 15));

    expect(readings.length).to.be.greaterThan(0);
    expect(readings.every(reading => reading.candidates.length === 0)).to.equal(true);
    expect(readings.some(reading => reading.isNewlyStable)).to.equal(false);
  });

  it('never calls noise stable', () => {
    const readings = feed(createNoise(sampleRate * 20, 3));

    expect(readings.some(reading => reading.isNewlyStable)).to.equal(false);
  });

  it('does not depend on the volume', () => {
    const loud = feed(createBrightClicks(120, 15)).at(-1)!.candidates[0];
    const quiet = feed(createBrightClicks(120, 15, 0.05)).at(-1)!.candidates[0];

    expect(quiet.tempo).to.equal(loud.tempo);
    expect(Math.abs(quiet.confidence - loud.confidence)).to.be.lessThan(0.1);
  });

  it('replays onset strength exactly as it reads audio', () => {
    const pcm = createBrightClicks(128, 12);
    const live = feed(pcm);
    const curve = createTempogramDetector({sampleRate}).onsetCurve(pcm);
    const detector = createTempogramDetector({sampleRate});
    const replayed = Array.from(curve, strength => detector.ingest(strength)).filter(Boolean);

    // `feed` drops the last partial chunk, so the replay runs a frame further
    expect(replayed.slice(0, live.length).map(reading => reading!.candidates[0]?.tempo))
      .to.deep.equal(live.map(reading => reading.candidates[0]?.tempo));
  });

  it('holds "stable" back while a rival tempo is close behind', () => {
    const pcm = createBrightClicks(120, 20);
    const stableWith = (stableMargin: number) => {
      const detector = createTempogramDetector({sampleRate, tuning: {stableMargin}});
      const curve = detector.onsetCurve(pcm);

      detector.reset();

      return Array.from(curve, strength => detector.ingest(strength)).some(reading => reading?.isNewlyStable);
    };

    expect(stableWith(1)).to.equal(true);
    expect(stableWith(1000)).to.equal(false);
  });

  it('keeps a stable event when a chunk spans two tempogram frames', () => {
    const readings = feed(createBrightClicks(120, 30, 1, 3000), 3000);

    expect(readings.some(reading => reading.isNewlyStable)).to.equal(true);
  });

  it('works at 48 kHz', () => {
    const pcm = new Float32Array(48_000 * 15);
    const period = 48_000 / 2;

    for (let start = 0; start < pcm.length; start += period) {
      pcm.set(createNoise(600, start).map((value, i) => value * Math.exp(-i / 200)), start);
    }

    const top = feed(pcm, 48_000).at(-1)!.candidates[0];

    expect(Math.abs(top.tempo - 120)).to.be.lessThan(3);
  });

  it('settles on the beat of a half-time pattern, not its bar', () => {
    // Backbeat at 140: kicks on 1 and 3 are quiet, snares land every other beat
    const pcm = createBrightClicks(70, 20);
    const beats = createBrightClicks(140, 20, 0.5);

    for (let i = 0; i < pcm.length; i += 1) {
      pcm[i] += beats[i];
    }

    const top = feed(pcm).at(-1)!.candidates[0];

    expect(Math.abs(top.tempo - 140)).to.be.lessThan(3);
  });

  it('counts pulses between the beats against a too-slow tempo', () => {
    const loud = createBrightClicks(60, 24);
    const soft = createBrightClicks(60, 24, 0.5);
    const pcm = new Float32Array(loud.length);

    pcm.set(loud);

    for (let i = 0; i + 22_050 < pcm.length; i += 1) {
      pcm[i + 22_050] += soft[i];
    }

    const slowPrior = {priorBpm: 60, priorOctaves: 0.8};
    const plain = feed(pcm, sampleRate, slowPrior).at(-1)!.candidates[0];
    const penalised = feed(pcm, sampleRate, {...slowPrior, halfBeatPenalty: 1}).at(-1)!.candidates[0];

    expect(Math.abs(plain.tempo - 60)).to.be.lessThan(2);
    expect(Math.abs(penalised.tempo - 120)).to.be.lessThan(3);
  });

  it('calls a steady tempo stable once, and only after the agreement window', () => {
    const readings = feed(createBrightClicks(120, 30));
    const stable = readings.filter(reading => reading.isNewlyStable);

    expect(stable.length).to.equal(1);
    expect(stable[0].at).to.be.greaterThan(6);
    expect(Math.abs(stable[0].candidates[0].tempo - 120)).to.be.lessThan(3);
  });

  it('follows a tempo change and declares the new tempo stable', () => {
    const first = createBrightClicks(100, 30);
    const second = createBrightClicks(140, 40);
    const pcm = new Float32Array(first.length + second.length);

    pcm.set(first);
    pcm.set(second, first.length);

    const stable = feed(pcm).filter(reading => reading.isNewlyStable).map(reading => reading.candidates[0].tempo);

    expect(Math.abs(stable[0] - 100)).to.be.lessThan(3);
    expect(Math.abs(stable.at(-1)! - 140)).to.be.lessThan(3);
    expect(stable.length).to.equal(2);
  });

  it('keeps salience between 0 and 1, higher on a clean pulse than on noise', () => {
    const clean = feed(createBrightClicks(120, 15)).at(-1)!.candidates[0];
    const noisy = feed(createNoise(sampleRate * 15, 11)).at(-1)!.candidates[0];

    expect(clean.confidence).to.be.within(0, 1);
    expect(clean.confidence).to.be.greaterThan((noisy?.confidence ?? 0) * 2);
  });

  it('searches only the range asked for', () => {
    const detector = createTempogramDetector({sampleRate, tempoRange: {min: 60, max: 120}});
    const pcm = createBrightClicks(160, 15);
    let reading: TempogramReading | null = null;

    for (let start = 0; start + 4096 <= pcm.length; start += 4096) {
      reading = detector.process(pcm.subarray(start, start + 4096)) ?? reading;
    }

    expect(reading!.candidates.every(({tempo}) => tempo >= 60 && tempo <= 120)).to.equal(true);
  });

  it('starts over on reset', () => {
    const detector = createTempogramDetector({sampleRate});
    const pcm = createBrightClicks(120, 10);

    detector.process(pcm);
    expect(detector.progress()).to.equal(1);
    detector.reset();
    expect(detector.progress()).to.equal(0);
    expect(detector.process(pcm.subarray(0, sampleRate))).to.equal(null);
  });

  it('reports the warm-up as progress', () => {
    const detector = createTempogramDetector({sampleRate});

    detector.process(new Float32Array(sampleRate * 2));
    expect(detector.progress()).to.be.closeTo(0.5, 0.01);
  });
});

describe('detectTempogram', () => {
  it('reads a whole recording', () => {
    const [top] = detectTempogram(createBrightClicks(128, 30), sampleRate);

    expect(top.tempo).to.be.within(127, 129);
  });

  it('counts every frame the same, so an outro does not decide', () => {
    const song = createBrightClicks(100, 90);
    const outro = createBrightClicks(141, 20);
    const samples = new Float32Array(song.length + outro.length);

    samples.set(song);
    samples.set(outro, song.length);

    const [top] = detectTempogram(samples, sampleRate);

    expect(top.tempo).to.be.within(99, 101);
  });

  it('reads a recording shorter than the warm-up', () => {
    const [top] = detectTempogram(createBrightClicks(120, 3), sampleRate);

    expect(top.tempo).to.be.within(118, 122);
  });

  it('returns nothing for silence or for too little audio', () => {
    expect(detectTempogram(new Float32Array(sampleRate * 10), sampleRate)).to.deep.equal([]);
    expect(detectTempogram(createBrightClicks(120, 1), sampleRate)).to.deep.equal([]);
  });

  it('searches the given range and refuses an invalid one', () => {
    const [top] = detectTempogram(createBrightClicks(160, 20), sampleRate, {min: 60, max: 130});

    expect(top.tempo).to.be.within(79, 81);
    expect(() => detectTempogram(new Float32Array(10), sampleRate, {min: 100, max: 150})).to.throw(RangeError);
  });
});
