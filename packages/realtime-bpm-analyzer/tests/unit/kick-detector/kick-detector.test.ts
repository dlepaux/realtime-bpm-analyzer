import {expect} from 'chai';
import {createKickDetector} from '../../../src/core/kick-detector';
import {absolutePercentile, createKickScene, kickSceneNames, scoreKicks} from '../../fixtures/kick-scenes';
import type {KickSceneName} from '../../fixtures/kick-scenes';

/**
 * The kick detector on synthetic scenes whose kick times are exact (RBA-243). The thresholds, and why:
 * - The hit window is ±50 ms, the usual one for scoring onsets (MIREX). The timing error is asserted on its own,
 *   much tighter, so a detection late by 40 ms does not pass as a hit and go unnoticed.
 * - Music scenes: no miss and no false kick. The scenes are deterministic and the detector scores 100% on them at
 *   both rates; anything less is a regression, not noise.
 * - Timing error: median 4 ms, p90 6 ms, max 8 ms. Half of a 60 Hz frame (16.7 ms) is the tightest a visual can be
 *   placed, so a kick time within 8 ms lands on the right frame. Measured: median 0.5 to 2.7 ms, max 3.9 ms.
 * - Noise: at most one false kick in 16 s. Noise heavy in the bass swells by chance now and then: two minutes of
 *   pink and brown noise gave one to one and a half a minute. White noise gave almost none.
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
  for (let start = 0; start < scene.samples.length; start += block) {
    detector.process(scene.samples.subarray(start, start + block), startTime + (start / sampleRate), (time, strength) => {
      detections.push({time, strength});
    });
  }

  return {scene, detections};
}

describe('Kick detector - synthetic scenes', () => {
  for (const sampleRate of [48_000, 44_100]) {
    for (const name of kickSceneNames) {
      it(`${name} at ${sampleRate} Hz`, () => {
        const {scene, detections} = detect(name, sampleRate);
        const score = scoreKicks(scene.kicks, detections.map(({time}) => time), hitWindow);
        const timing = {
          median: absolutePercentile(score.errors, 0.5),
          p90: absolutePercentile(score.errors, 0.9),
          max: absolutePercentile(score.errors, 1),
        };
        // Read by the RBA-243 report: one line per scene and rate
        console.log(`KICK-SCORE ${JSON.stringify({name, sampleRate, ...score, errors: undefined, timingMs: Object.fromEntries(Object.entries(timing).map(([key, value]) => [key, Number((value * 1000).toFixed(1))]))})}`);

        if (name === 'noise') {
          expect(score.falseKicks, 'chance swells of noise').to.be.at.most(1);
          return;
        }

        expect(score.misses, 'missed kicks').to.equal(0);
        expect(score.falseKicks, 'false kicks').to.equal(0);
        expect(timing.median, 'median timing error').to.be.at.most(0.004);
        expect(timing.p90, 'p90 timing error').to.be.at.most(0.006);
        expect(timing.max, 'max timing error').to.be.at.most(0.008);
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
