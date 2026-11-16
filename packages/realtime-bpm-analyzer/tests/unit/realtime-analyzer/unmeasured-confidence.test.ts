import {expect} from 'chai';
import {createSession} from '../../../src/core/session';
import {resolveEngine} from '../../../src/core/engine';
import {MEASURED_TEMPO_RANGE} from '../../../src/core/calibration';
import type {EngineName, Reading, TempoRange, WorkletMessage} from '../../../src/contract/types';
import {analyzeChannelData} from '../../../src/node';
import {createClickTrack} from '../../fixtures/click-track';
import {feedSession} from '../../setup';

// RBA-108's DECISIONs of 2026-11-16 (RBA-147): confidence was measured only on the default tempo range, 90 to 180.
// A reading outside it carries confidence null, and so does every reading of an analysis run on any other range,
// on both engines and both paths. An explicit {min: 90, max: 180} is the default and keeps the number.

const sampleRate = 44_100;
const engines: readonly EngineName[] = ['tempogram', 'peaks'];

async function realtimeReadings(engine: EngineName, pcm: Float32Array, tempoRange?: TempoRange): Promise<Reading[]> {
  const resolved = resolveEngine(engine, tempoRange);
  const session = createSession({engine: resolved.engine, tempoRange: resolved.tempoRange, debug: false});
  const messages: WorkletMessage[] = (await feedSession(session, pcm, sampleRate)).map(({message}) => message);
  return messages.flatMap(message => (message.type === 'step' && message.status !== 'listening' ? [message.reading] : []));
}

const measured = (bpm: number): boolean => bpm >= MEASURED_TEMPO_RANGE.min && bpm <= MEASURED_TEMPO_RANGE.max;
const bpms = (readings: readonly Reading[]): string => readings.map(({bpm}) => bpm).join(', ');

describe('confidence on a custom tempo range', () => {
  const cases = [
    // Each click has no octave both inside 90 to 180 and inside its range, so the engines report it outside 90 to 180
    {what: 'a reading under 90 BPM', clickBpm: 70, tempoRange: {min: 60, max: 120}, inside: false},
    {what: 'a reading over 180 BPM', clickBpm: 200, tempoRange: {min: 120, max: 240}, inside: false},
    // The reading lands inside 90 to 180, since 128 is the click's only octave in 80 to 200, but the range changes
    // what each engine picks, which nobody measured: on 60 to 200 both engines read a 120 BPM click as 60
    {what: 'a reading inside 90 to 180 BPM', clickBpm: 128, tempoRange: {min: 80, max: 200}, inside: true},
  ] as const;

  for (const engine of engines) {
    for (const {what, clickBpm, tempoRange, inside} of cases) {
      it(`is null on ${what} from ${engine} on ${tempoRange.min} to ${tempoRange.max}, realtime and offline`, async () => {
        const pcm = createClickTrack(clickBpm, sampleRate, 30);
        const realtime = await realtimeReadings(engine, pcm, tempoRange);
        const offline = await analyzeChannelData(pcm, sampleRate, {engine, tempoRange});

        // The case is the one named: the engines read the click where it says
        expect(realtime.some(({bpm}) => measured(bpm) === inside), `${engine} realtime read ${bpms(realtime)}`).to.equal(true);
        expect(measured(offline?.bpm ?? Number.NaN), `${engine} offline read ${offline?.bpm}`).to.equal(inside);

        for (const {bpm, confidence} of realtime) {
          expect(confidence, `${engine} realtime at ${bpm} BPM`).to.equal(null);
        }

        expect(offline?.confidence, `${engine} offline`).to.equal(null);
      });
    }
  }
});

describe('confidence on the default tempo range', () => {
  const ranges = [
    {what: 'no tempoRange', tempoRange: undefined},
    {what: 'an explicit {min: 90, max: 180}', tempoRange: {min: 90, max: 180}},
  ] as const;

  for (const engine of engines) {
    for (const {what, tempoRange} of ranges) {
      it(`is a number on every ${engine} reading with ${what}, realtime and offline`, async () => {
        const pcm = createClickTrack(128, sampleRate, 30);
        const realtime = await realtimeReadings(engine, pcm, tempoRange);
        const offline = await analyzeChannelData(pcm, sampleRate, {engine, tempoRange});

        expect(realtime.length, `${engine} realtime`).to.be.greaterThan(0);
        for (const {bpm, confidence} of realtime) {
          expect(confidence, `${engine} realtime at ${bpm} BPM`).to.be.within(0, 1);
        }

        expect(offline?.confidence, `${engine} offline`).to.be.within(0, 1);
      });
    }
  }
});
