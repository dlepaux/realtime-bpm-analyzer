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

describe('confidence outside the measured tempo range', () => {
  // 70 BPM on 60 to 120 has no octave inside 90 to 180 that the range allows, so the engines report it as 70
  const slow = {min: 60, max: 120};

  for (const engine of engines) {
    it(`is null on a ${engine} reading under 90 BPM, realtime and offline`, async () => {
      const pcm = createClickTrack(70, sampleRate, 30);
      const realtime = await realtimeReadings(engine, pcm, slow);
      const offline = await analyzeChannelData(pcm, sampleRate, {engine, tempoRange: slow});

      expect(realtime.some(({bpm}) => bpm < MEASURED_TEMPO_RANGE.min), `${engine} realtime read ${realtime.map(({bpm}) => bpm).join(', ')}`).to.equal(true);
      expectConfidenceMatchesRange(realtime, `${engine} realtime`);
      expect(offline?.bpm, `${engine} offline`).to.be.below(MEASURED_TEMPO_RANGE.min);
      expect(offline?.confidence, `${engine} offline`).to.equal(null);
    });

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
