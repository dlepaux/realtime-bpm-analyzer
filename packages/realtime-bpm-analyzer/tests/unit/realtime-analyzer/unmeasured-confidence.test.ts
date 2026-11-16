import {expect} from 'chai';
import {createSession} from '../../../src/core/session';
import {resolveEngine} from '../../../src/core/engine';
import {MEASURED_TEMPO_RANGE} from '../../../src/core/calibration';
import type {EngineName, Reading, TempoRange, WorkletMessage} from '../../../src/contract/types';
import {analyzeChannelData} from '../../../src/node';
import {createClickTrack} from '../../fixtures/click-track';
import {feedSession} from '../../setup';

// RBA-108's DECISION of 2026-11-16 (RBA-147): a reading outside the tempo range confidence was measured on carries
// confidence null, on both engines and both paths, and a reading inside it carries a number

const sampleRate = 44_100;
const engines: readonly EngineName[] = ['tempogram', 'peaks'];

async function realtimeReadings(engine: EngineName, pcm: Float32Array, tempoRange?: TempoRange): Promise<Reading[]> {
  const resolved = resolveEngine(engine, tempoRange);
  const session = createSession({engine: resolved.engine, tempoRange: resolved.tempoRange, debug: false});
  const messages: WorkletMessage[] = (await feedSession(session, pcm, sampleRate)).map(({message}) => message);
  return messages.flatMap(message => (message.type === 'step' && message.status !== 'listening' ? [message.reading] : []));
}

const measured = (bpm: number): boolean => bpm >= MEASURED_TEMPO_RANGE.min && bpm <= MEASURED_TEMPO_RANGE.max;

function expectConfidenceMatchesRange(readings: readonly Reading[], label: string): void {
  for (const {bpm, confidence} of readings) {
    if (measured(bpm)) {
      expect(confidence, `${label} at ${bpm} BPM`).to.be.within(0, 1);
    } else {
      expect(confidence, `${label} at ${bpm} BPM`).to.equal(null);
    }
  }
}

const outside = (bpm: number): boolean => !measured(bpm);

describe('confidence outside the measured tempo range', () => {
  // Each click has no octave both inside 90 to 180 and inside its range, so the engines report it outside 90 to 180
  const cases = [
    {side: 'under 90', clickBpm: 70, tempoRange: {min: 60, max: 120}},
    {side: 'over 180', clickBpm: 200, tempoRange: {min: 120, max: 240}},
  ] as const;

  for (const engine of engines) {
    for (const {side, clickBpm, tempoRange} of cases) {
      it(`is null on a ${engine} reading ${side} BPM, realtime and offline`, async () => {
        const pcm = createClickTrack(clickBpm, sampleRate, 30);
        const realtime = await realtimeReadings(engine, pcm, tempoRange);
        const offline = await analyzeChannelData(pcm, sampleRate, {engine, tempoRange});

        expect(realtime.some(({bpm}) => outside(bpm)), `${engine} realtime read ${realtime.map(({bpm}) => bpm).join(', ')}`).to.equal(true);
        expectConfidenceMatchesRange(realtime, `${engine} realtime`);
        expect(outside(offline?.bpm ?? Number.NaN), `${engine} offline read ${offline?.bpm}`).to.equal(true);
        expect(offline?.confidence, `${engine} offline`).to.equal(null);
      });
    }

    it(`is a number on every ${engine} reading on the default range, realtime and offline`, async () => {
      const pcm = createClickTrack(128, sampleRate, 30);
      const realtime = await realtimeReadings(engine, pcm);
      const offline = await analyzeChannelData(pcm, sampleRate, {engine});

      expect(realtime.length, `${engine} realtime`).to.be.greaterThan(0);
      for (const {confidence} of realtime) {
        expect(confidence, `${engine} realtime`).to.be.within(0, 1);
      }

      expect(offline?.confidence, `${engine} offline`).to.be.within(0, 1);
    });
  }
});
