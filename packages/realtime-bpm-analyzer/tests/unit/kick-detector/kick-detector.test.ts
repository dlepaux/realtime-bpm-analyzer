import {expect} from 'chai';
import {createKickDetector} from '../../../src/core/kick-detector';
import {absolutePercentile, createKickChangeScene, createKickScene, kickSceneNames, scoreKicks} from '../../fixtures/kick-scenes';
import type {KickSceneName} from '../../fixtures/kick-scenes';

/**
 * The kick detector on synthetic scenes whose kick times are exact (RBA-243). The thresholds, and why:
 * - The hit window is ±50 ms, the usual one for scoring onsets (MIREX). The timing error is asserted on its own,
 *   much tighter, so a detection late by 40 ms does not pass as a hit and go unnoticed.
 * - Music scenes: no miss and no false kick. The scenes are deterministic and the detector scores 100% on them at
 *   both rates; anything less is a regression, not noise.
 * - Timing error: median 4 ms, p90 6 ms, max 8 ms. Half of a 60 Hz frame (16.7 ms) is the tightest a visual can be
 *   placed, so a kick time within 8 ms lands on the right frame. Measured: median 0.5 to 2.7 ms, max 3.9 ms.
 * - Signed timing error, median from -4 to +0.5 ms: the time is corrected for the filters' delay, 4.5 ms at 60 Hz,
 *   so a kick is stamped where its sound starts or just before. Without the correction it lands 1.2 to 4 ms late,
 *   which the absolute bounds above would let through. Measured: -3.2 to -0.5 ms.
 * - Confirmation delay: each kick is reported within 30 ms of where it truly started, on the clock of the audio,
 *   counted to the end of the block that confirmed it. This is most of the event's delay, so a slower detector fails
 *   here and not only in a browser. Measured: median 11 ms for kicks alone and 17 to 19 ms under a bass line, max
 *   26.7 ms (tempo change at 48 kHz).
 * - Noise: no false kick. The scene is deterministic like the others, so a false kick in it is a regression. Real
 *   noise heavy in the bass swells by chance now and then: two minutes of pink and brown noise gave one to one and a
 *   half a minute, which the guide states.
 * - Strength: a kick 4 dB softer than the loudest reads 10^(-4/20) = 0.63, so it must read 0.63 ± 0.08, and the
 *   loudest ones at least 0.92 (the 0.7 dB a peak may lose between samples).
 */

/** Seconds either side of a true kick a detection may fall and count as its hit */
const hitWindow = 0.05;

type Detection = {readonly time: number; readonly strength: number};

/**
 * Runs a detector over a scene in blocks, as the worklet does
 * @param name The scene
 * @param sampleRate Its rate
 * @param block Samples per call: the worklet passes 128
 * @param startTime The time of the first sample
 * @returns The scene's truth and the detections
 */
function detect(name: KickSceneName, sampleRate: number, block = 128, startTime = 0) {
  const scene = createKickScene(name, sampleRate);
  const detector = createKickDetector(sampleRate);
  const detections: Detection[] = [];
  // How long after the true kick's start each kick was confirmed, to the end of the block that reported it: from the
  // reported time instead, a later stamp would read as a quicker detector
  const confirmations: number[] = [];
  for (let start = 0; start < scene.samples.length; start += block) {
    const blockEnd = startTime + (Math.min(start + block, scene.samples.length) / sampleRate);
    detector.process(scene.samples.subarray(start, start + block), startTime + (start / sampleRate), (time, strength) => {
      detections.push({time, strength});
      confirmations.push(blockEnd - nearestKick(scene.kicks.map(kick => startTime + kick), time));
    });
  }

  return {scene, detections, confirmations};
}

/** The scene's kick nearest to a reported time */
function nearestKick(kicks: readonly number[], time: number): number {
  return kicks.reduce((nearest, kick) => (Math.abs(kick - time) < Math.abs(nearest - time) ? kick : nearest), Number.POSITIVE_INFINITY);
}

/** The median of signed values, nearest-rank */
function signedMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length / 2) - 1];
}

describe('Kick detector - synthetic scenes', () => {
  for (const sampleRate of [48_000, 44_100]) {
    for (const name of kickSceneNames) {
      it(`${name} at ${sampleRate} Hz`, () => {
        const {scene, detections, confirmations} = detect(name, sampleRate);
        const score = scoreKicks(scene.kicks, detections.map(({time}) => time), hitWindow);
        const timing = {
          median: absolutePercentile(score.errors, 0.5),
          p90: absolutePercentile(score.errors, 0.9),
          max: absolutePercentile(score.errors, 1),
        };
        // Read by the RBA-243 report: one line per scene and rate
        console.log(`KICK-SCORE ${JSON.stringify({name, sampleRate, ...score, errors: undefined, timingMs: Object.fromEntries(Object.entries(timing).map(([key, value]) => [key, Number((value * 1000).toFixed(1))]))})}`);

        expect(score.misses, 'missed kicks').to.equal(0);
        expect(score.falseKicks, 'false kicks').to.equal(0);
        if (scene.kicks.length === 0) {
          return;
        }

        expect(timing.median, 'median timing error').to.be.at.most(0.004);
        expect(timing.p90, 'p90 timing error').to.be.at.most(0.006);
        expect(timing.max, 'max timing error').to.be.at.most(0.008);
        expect(signedMedian(score.errors), 'signed median timing error').to.be.within(-0.004, 0.0005);
        expect(Math.max(...confirmations), 'confirmation delay').to.be.at.most(0.03);
      });
    }
  }

  it('reads a kick 4 dB softer as about 0.63, and the loud ones near 1', () => {
    for (const sampleRate of [48_000, 44_100]) {
      const {detections} = detect('kicks-alone', sampleRate);
      expect(detections).to.have.length(32);
      detections.forEach(({strength}, index) => {
        if (index % 4 === 3) {
          expect(strength, `soft kick ${index} at ${sampleRate} Hz`).to.be.within(0.55, 0.71);
        } else {
          expect(strength, `loud kick ${index} at ${sampleRate} Hz`).to.be.within(0.92, 1);
        }
      });
    }
  });

  it('gives every kick a strength from 0 to 1, in time order', () => {
    for (const name of kickSceneNames) {
      const {detections} = detect(name, 48_000);
      detections.forEach(({time, strength}, index) => {
        expect(strength, name).to.be.within(0, 1);
        expect(Number.isFinite(time), name).to.equal(true);
        if (index > 0) {
          expect(time, name).to.be.above(detections[index - 1].time);
        }
      });
    }
  });
});

describe('Kick detector - its interface', () => {
  it('finds the same kicks whatever the block size', () => {
    const quanta = detect('full-mix', 48_000, 128).detections;
    for (const block of [1, 100, 4096]) {
      const other = detect('full-mix', 48_000, block).detections;
      expect(other.map(({strength}) => strength), `blocks of ${block}`).to.deep.equal(quanta.map(({strength}) => strength));
      other.forEach(({time}, index) => {
        expect(time, `blocks of ${block}`).to.be.closeTo(quanta[index].time, 1e-9);
      });
    }
  });

  it('reports times on the clock it is given', () => {
    const atZero = detect('kicks-alone', 48_000).detections;
    const later = detect('kicks-alone', 48_000, 128, 1234.5).detections;
    expect(later).to.have.length(atZero.length);
    later.forEach(({time}, index) => {
      expect(time - 1234.5).to.be.closeTo(atZero[index].time, 1e-6);
    });
  });

  it('forgets everything on reset(), and then hears as a new detector does', () => {
    const scene = createKickScene('full-mix', 48_000);
    const fresh = detect('full-mix', 48_000).detections;
    const detector = createKickDetector(48_000);
    const ignore = () => undefined;
    // Half a scene of other audio first, so a reset that forgot nothing would show
    const noise = createKickScene('noise', 48_000).samples.subarray(0, 48_000 * 5);
    for (let start = 0; start < noise.length; start += 128) {
      detector.process(noise.subarray(start, start + 128), 0, ignore);
    }

    detector.reset();
    const after: Detection[] = [];
    for (let start = 0; start < scene.samples.length; start += 128) {
      detector.process(scene.samples.subarray(start, start + 128), start / 48_000, (time, strength) => after.push({time, strength}));
    }

    expect(after).to.deep.equal(fresh);
  });

  it('hears nothing in silence, and nothing before it has heard enough to judge', () => {
    const detector = createKickDetector(48_000);
    const kicks: number[] = [];
    // One loud kick-like jump in the first 20 ms: there is no reference before it to measure the jump against
    const start = new Float32Array(960);
    start.fill(0.9, 100);
    detector.process(start, 0, time => kicks.push(time));
    detector.process(new Float32Array(48_000), 0.02, time => kicks.push(time));
    expect(kicks).to.deep.equal([]);
  });
});

/**
 * Runs a fresh detector over samples in quanta of 128, as the worklet does
 * @returns The detections, in time order
 */
function detectIn(samples: Float32Array, sampleRate: number): Detection[] {
  const detector = createKickDetector(sampleRate);
  const detections: Detection[] = [];
  for (let start = 0; start < samples.length; start += 128) {
    detector.process(samples.subarray(start, start + 128), start / sampleRate, (time, strength) => detections.push({time, strength}));
  }

  return detections;
}

/** The true kicks no detection fell within the hit window of */
const missedKicks = (truth: readonly number[], detections: readonly Detection[]) => truth.filter(kick => !detections.some(({time}) => Math.abs(time - kick) <= hitWindow));

/** The detections that fell within the hit window of no true kick */
const falseKicks = (truth: readonly number[], detections: readonly Detection[]) => detections.filter(({time}) => !truth.some(kick => Math.abs(time - kick) <= hitWindow));

/**
 * When the music changes under the detector, with no reset() (RBA-246). The thresholds, and why:
 * - The loudest kick is the loudest of the last 3.5 s (`memorySeconds`), so after a drop every kick that starts 3.55 s
 *   or more after it counts again, whatever the drop: 3.5 s for the window, and 50 ms for the hops a kick takes to be
 *   confirmed, which differ from one kick to the next. Measured: the last kick missed starts 3.08 s after either drop,
 *   the next one, 3.57 s after it, counts. The decaying peak before it missed kicks until 5.0 s after a 10 dB drop,
 *   and every one of the 10 s after a 20 dB drop.
 * - A level that rises lets every kick through, with no false kick but the cut itself: a whole mix 20 dB louder from
 *   one sample to the next is a jump in the band, under 150 Hz like a kick, so it may count once, within 50 ms.
 * - A break longer than the window, kick and bass gone, and two bars with no kick but the bass, at 90 BPM, the
 *   slowest tempo the library reads: no false kick. In the bars, the bass notes pass every test but the gate, which
 *   still holds the kicks before them: a 2 s window lets 4 of them through.
 * - A bass line that plays on with no kick: its notes count once the last kick has left the window. Pinned, so the
 *   guide's word on it stays true.
 */
describe('Kick detector - when the music changes', () => {
  for (const sampleRate of [48_000, 44_100]) {
    for (const name of ['drop-10', 'drop-20'] as const) {
      it(`${name} at ${sampleRate} Hz: hears the quieter kicks again within 3.55 s, with no false kick`, () => {
        const scene = createKickChangeScene(name, sampleRate);
        const detections = detectIn(scene.samples, sampleRate);
        const missed = missedKicks(scene.kicks, detections);
        console.log(`KICK-CHANGE ${JSON.stringify({name, sampleRate, kicks: scene.kicks.length, missed: missed.length, lastMissedAfterChange: missed.length === 0 ? null : Number((Math.max(...missed) - scene.changeAt).toFixed(3))})}`);

        expect(missed.filter(kick => kick < scene.changeAt), 'kicks missed before the drop').to.deep.equal([]);
        expect(missed.filter(kick => kick >= scene.changeAt + 3.55), 'kicks missed 3.55 s and more after the drop').to.deep.equal([]);
        expect(falseKicks(scene.kicks, detections), 'false kicks').to.deep.equal([]);
      });
    }

    it(`rise-20 at ${sampleRate} Hz: hears every kick, and nothing else but the cut itself`, () => {
      const scene = createKickChangeScene('rise-20', sampleRate);
      const detections = detectIn(scene.samples, sampleRate);
      expect(missedKicks(scene.kicks, detections), 'missed kicks').to.deep.equal([]);
      const extra = falseKicks(scene.kicks, detections);
      expect(extra.length, 'false kicks').to.be.at.most(1);
      extra.forEach(({time}) => {
        expect(Math.abs(time - scene.changeAt), 'a false kick away from the cut').to.be.at.most(hitWindow);
      });
    });

    for (const name of ['long-breakdown', 'kick-free-bars'] as const) {
      it(`${name} at ${sampleRate} Hz: hears every kick, with no false kick`, () => {
        const scene = createKickChangeScene(name, sampleRate);
        const detections = detectIn(scene.samples, sampleRate);
        expect(missedKicks(scene.kicks, detections), 'missed kicks').to.deep.equal([]);
        expect(falseKicks(scene.kicks, detections), 'false kicks').to.deep.equal([]);
      });
    }

    it(`bass-breakdown at ${sampleRate} Hz: counts the bass notes as kicks once the last kick has left the window`, () => {
      const scene = createKickChangeScene('bass-breakdown', sampleRate);
      const detections = detectIn(scene.samples, sampleRate);
      const lastKick = Math.max(...scene.kicks.filter(kick => kick < scene.changeAt));
      const extra = falseKicks(scene.kicks, detections);
      expect(missedKicks(scene.kicks, detections), 'missed kicks').to.deep.equal([]);
      expect(extra.filter(({time}) => time < lastKick + 3.45), 'false kicks while the last kick is in the window').to.deep.equal([]);
      expect(extra.length, 'bass notes counted after it').to.be.above(0);
    });
  }
});

/**
 * A sample that is not finite, once (RBA-246). It used to leave the filters at NaN, and no kick counted again until
 * reset(). Each one lands 23 ms into the full mix's kick at 10.18 s, the hardest place: that kick is being confirmed.
 * The bound: every kick that starts 100 ms or more after it is heard, the 80 ms the detector takes to refill its
 * history and the time it takes to confirm a kick. Measured: every kick of the scene is heard, that one included,
 * as it was confirmed before the sample. The kicks heard before are kept: from 250 ms after the sample on, once the
 * filters have settled, every kick is heard at the same time and with the same strength as without it.
 */
describe('Kick detector - a sample that is not finite', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    it(`starts over by itself after one ${String(bad)}, and hears the kicks after it`, () => {
      const sampleRate = 48_000;
      const scene = createKickScene('full-mix', sampleRate);
      const clean = detectIn(scene.samples, sampleRate);
      const samples = scene.samples.slice();
      const badAt = 10.2;
      samples[Math.round(badAt * sampleRate)] = bad;
      const detections = detectIn(samples, sampleRate);

      expect(missedKicks(scene.kicks.filter(kick => kick < badAt - 0.03 || kick >= badAt + 0.1), detections), 'missed kicks').to.deep.equal([]);
      expect(falseKicks(scene.kicks, detections), 'false kicks').to.deep.equal([]);
      const settled = (list: readonly Detection[]) => list.filter(({time}) => time >= badAt + 0.25);
      expect(settled(detections)).to.have.length(settled(clean).length);
      settled(detections).forEach(({time, strength}, index) => {
        expect(time).to.be.closeTo(settled(clean)[index].time, 1e-6);
        expect(strength).to.be.closeTo(settled(clean)[index].strength, 1e-6);
      });
    });
  }
});
