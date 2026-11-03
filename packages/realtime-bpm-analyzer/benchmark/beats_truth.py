"""RBA-109: beat ground truth for the licence-clean sets, derived exactly, no annotator taps.

- groove: the metronome grid of the MIDI file, which the drummer played to. Gillick et al. 2019 align
  the TD-11 audio to the MIDI within 2 ms. Bars start at tick 0.
- guitarset: the `beat_position` annotation of the JAMS file, the click the player recorded to.
- fsld: a well-cut loop starts on a beat, so its beats are k * 60 / bpm, repeated with the loop as the
  benchmark plays it (lib/stream.ts repeatTo). Only loops whose length is a whole number of beats
  within LOOP_TOLERANCE pass: on any other, a repeat would move the grid.

Callers pass dev tracks only. Nothing here decides a split.
"""

import json
import struct

LOOP_TOLERANCE = 0.02
SAMPLE_RATE = 44100


def _varlen(data, pos):
    value = 0
    while True:
        byte = data[pos]
        pos += 1
        value = (value << 7) | (byte & 0x7F)
        if byte < 0x80:
            return value, pos


def _events(track):
    """(absolute tick, kind, payload) of one MTrk chunk: ('tempo', us), ('meter', (n, d)), ('note', pitch)"""
    pos = tick = 0
    running = 0
    out = []
    while pos < len(track):
        delta, pos = _varlen(track, pos)
        tick += delta
        status = running
        if track[pos] >= 0x80:
            status = track[pos]
            pos += 1
            # Meta and system events never become the running status
            running = status if status < 0xF0 else running
        if status == 0xFF:
            kind = track[pos]
            length, pos = _varlen(track, pos + 1)
            body = track[pos:pos + length]
            pos += length
            if kind == 0x51:
                out.append((tick, 'tempo', int.from_bytes(body, 'big')))
            elif kind == 0x58:
                out.append((tick, 'meter', (body[0], 2 ** body[1])))
        elif status in (0xF0, 0xF7):
            length, pos = _varlen(track, pos)
            pos += length
        else:
            size = 1 if status & 0xF0 in (0xC0, 0xD0) else 2
            data = track[pos:pos + size]
            pos += size
            if status & 0xF0 == 0x90 and data[1] > 0:
                out.append((tick, 'note', data[0]))
    return out


def read_midi(path):
    """ppq and the merged events of a standard MIDI file, sorted by tick"""
    with open(path, 'rb') as handle:
        data = handle.read()
    assert data[:4] == b'MThd', path
    _, _, division = struct.unpack('>HHH', data[8:14])
    assert division < 0x8000, 'SMPTE time division is not used by these sets'
    pos, events = 8 + struct.unpack('>I', data[4:8])[0], []
    while pos + 8 <= len(data):
        size = struct.unpack('>I', data[pos + 4:pos + 8])[0]
        if data[pos:pos + 4] == b'MTrk':
            events.extend(_events(data[pos + 8:pos + 8 + size]))
        pos += 8 + size
    return division, sorted(events, key=lambda e: e[0])


def groove_beats(midi_path, duration):
    """Beats, downbeats and the note times of a Groove performance, from its single tempo"""
    ppq, events = read_midi(midi_path)
    tempos = {e[2] for e in events if e[1] == 'tempo'}
    meters = {e[2] for e in events if e[1] == 'meter'}
    assert len(tempos) == 1, f'{midi_path}: {len(tempos)} tempos'
    seconds_per_tick = next(iter(tempos)) / 1e6 / ppq
    notes = [e[0] * seconds_per_tick for e in events if e[1] == 'note']
    beat = ppq * seconds_per_tick
    end = min(duration, notes[-1] + beat / 2)
    start = notes[0] - beat / 2
    beats = [k * beat for k in range(int(end / beat) + 1) if k * beat >= start]
    numerator = next(iter(meters))[0] if len(meters) == 1 else 4
    downbeats = [b for b in beats if round(b / beat) % numerator == 0]
    return {'beats': beats, 'downbeats': downbeats, 'notes': notes, 'bpm': 60 / beat, 'meters': sorted(meters)}


def guitarset_beats(jams_path):
    with open(jams_path, encoding='utf8') as handle:
        jams = json.load(handle)
    positions = next(a['data'] for a in jams['annotations'] if a['namespace'] == 'beat_position')
    beats = sorted(p['time'] for p in positions)
    downbeats = sorted(p['time'] for p in positions if p['value']['position'] == 1)
    return {'beats': beats, 'downbeats': downbeats}


def loop_beats(loop_samples, bpm, total_samples):
    """Beats of a loop repeated to total_samples, or None when its length is not whole beats"""
    loop = loop_samples / SAMPLE_RATE
    beat = 60.0 / bpm
    count = round(loop / beat)
    if count < 2 or abs(loop - count * beat) > LOOP_TOLERANCE:
        return None
    total = total_samples / SAMPLE_RATE
    # The grid restarts with each repeat: the loop's own length, not count * beat, sets the repeat
    beats = [m * loop + k * beat for m in range(int(total / loop) + 1) for k in range(count)]
    return {'beats': [b for b in beats if b < total], 'beatsPerLoop': count}
