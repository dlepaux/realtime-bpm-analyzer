import {expect} from 'chai';
import {derivedRow, factorsTowards, ffmpegFilter, transposeKey} from '../../../benchmark/free-data/derive';
import {barFit, mixLicence, planMixes, renderMix} from '../../../benchmark/free-data/loop-mix';
import type {Loop} from '../../../benchmark/free-data/loop-mix';
import type {ManifestRow} from '../../../benchmark/free-data/manifest';
import {encodeWav, frequencyOf, generateTrack, sampleRate, specFromSeed, styles} from '../../../benchmark/free-data/synth';
import type {SectionPlan, TrackSpec} from '../../../benchmark/free-data/synth';
import {dataStart, directoryLocation, parseDirectory} from '../../../benchmark/free-data/zip-range';

const short: readonly SectionPlan[] = [{kind: 'drop', bars: 2}, {kind: 'breakdown', bars: 2}];

function spec(overrides: Partial<TrackSpec> = {}): TrackSpec {
  return {style: styles[0], bpm: 170, tonic: 9, mode: 'minor', seed: 1, structure: short, ...overrides};
}

function energy(pcm: Float32Array, from: number, to: number): number {
  let sum = 0;

  for (let i = from; i < to; i += 1) {
    sum += pcm[i] * pcm[i];
  }

  return sum / (to - from);
}

/** A level of 1 at this frequency, by correlation */
function levelAt(pcm: Float32Array, frequency: number): number {
  let re = 0;
  let im = 0;

  for (let i = 0; i < pcm.length; i += 1) {
    re += pcm[i] * Math.cos((2 * Math.PI * frequency * i) / sampleRate);
    im += pcm[i] * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }

  return Math.hypot(re, im) / pcm.length;
}

describe('free data: made audio', () => {
  describe('generateTrack', () => {
    it('places every beat where the label says, with no drift', () => {
      const {beatSamples} = generateTrack(spec());
      const secondsPerBeat = 60 / 170;

      beatSamples.forEach((sample, beat) => {
        expect(Math.abs(sample - (beat * secondsPerBeat * sampleRate))).to.be.lessThan(1);
      });
    });

    it('labels sections end to end, and leaves a breakdown without drums', () => {
      const {pcm, sections} = generateTrack(spec({structure: [{kind: 'drop', bars: 2}, {kind: 'breakdown', bars: 2}]}));
      const [drop, breakdown] = sections;

      expect(drop.endSeconds).to.equal(breakdown.startSeconds);
      expect(breakdown.endSeconds).to.be.closeTo(pcm.length / sampleRate, 0.001);
      expect(energy(pcm, 0, Math.floor(drop.endSeconds * sampleRate))).to.be.greaterThan(
        energy(pcm, Math.floor(breakdown.startSeconds * sampleRate), pcm.length),
      );
    });

    it('sounds in the key it names', () => {
      const {pcm, key} = generateTrack(spec({style: {...styles[0], progression: [0]}, structure: [{kind: 'breakdown', bars: 2}]}));
      const tonic = frequencyOf(9 + 48);
      const outOfKey = frequencyOf(10 + 48);

      expect(key).to.equal('A minor');
      expect(levelAt(pcm, tonic)).to.be.greaterThan(levelAt(pcm, outOfKey) * 3);
    });

    it('gives the same audio for the same seed, and refuses a tempo outside the style', () => {
      expect(generateTrack(spec()).pcm).to.deep.equal(generateTrack(spec()).pcm);
      expect(() => generateTrack(spec({bpm: 90}))).to.throw('outside');
    });

    it('stays in range', () => {
      const {pcm} = generateTrack(spec());

      expect(Math.max(...pcm.subarray(0, 50_000).map(Math.abs))).to.be.at.most(0.9001);
    });
  });

  it('picks a tempo inside the style from any seed, only as whole numbers', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const {style, bpm} = specFromSeed(seed);

      expect(bpm).to.be.within(style.bpmRange[0], style.bpmRange[1]);
      expect(Number.isInteger(bpm)).to.equal(true);
    }
  });

  it('writes a WAV header that states the audio', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]));
    const view = new DataView(wav.buffer);

    expect(new TextDecoder().decode(wav.subarray(0, 4))).to.equal('RIFF');
    expect(view.getUint32(24, true)).to.equal(sampleRate);
    expect(view.getUint32(40, true)).to.equal(6);
    expect(view.getInt16(46, true)).to.equal(32_767);
    expect(view.getInt16(48, true)).to.equal(-32_767);
  });

  describe('derive', () => {
    const source: ManifestRow = {
      id: 'fma-1', kind: 'real', source: 'fma', url: 'u', artist: 'A', artistKey: 'a', title: 't', licence: 'CC-BY-4.0', licenceClass: 'permissive',
      licenceEvidence: 'e', attribution: 'by A', sha256: 'h', durationSeconds: 200, genre: 'g', genreFamily: 'electronic', bpm: 140, key: 'A minor',
      confidence: 'trackers-all', labelProvenance: {method: 'm', votes: [], hintBpm: null}, sourceItems: [], split: 'dev', audioPath: 'p',
    };
    const audio = {sha256: 'x', durationSeconds: 160, audioPath: 'q'};

    it('carries the label through the factor, and the licence and attribution unchanged', () => {
      const made = derivedRow(source, {tempoFactor: 1.25, semitones: 3}, audio);

      expect(made.bpm).to.equal(175);
      expect(made.key).to.equal('C minor');
      expect(made.licence).to.equal('CC-BY-4.0');
      expect(made.attribution).to.equal('by A');
      expect(made.kind).to.equal('derived');
      expect(made.confidence).to.equal('carried');
      expect(made.sourceItems).to.deep.equal(['fma-1']);
    });

    it('refuses a held-out source, as its audio on dev would leak', () => {
      expect(() => derivedRow({...source, split: 'heldout'}, {tempoFactor: 1.1, semitones: 0}, audio)).to.throw('on dev');
    });

    it('refuses an unlabelled source, or one already made', () => {
      expect(() => derivedRow({...source, bpm: null}, {tempoFactor: 1.1, semitones: 0}, audio)).to.throw();
      expect(() => derivedRow({...source, kind: 'derived'}, {tempoFactor: 1.1, semitones: 0}, audio)).to.throw();
    });

    it('wraps a key around the octave, both ways', () => {
      expect(transposeKey('B minor', 1)).to.equal('C minor');
      expect(transposeKey('C major', -1)).to.equal('B major');
    });

    it('builds the filter so tempo and pitch come out as asked', () => {
      expect(ffmpegFilter({tempoFactor: 1.1, semitones: 0}, 44_100)).to.equal('atempo=1.100000');
      // Up an octave doubles the speed, so tempo x1 needs atempo 0.5 to undo it
      expect(ffmpegFilter({tempoFactor: 1, semitones: 12}, 44_100)).to.equal('aresample=44100,asetrate=88200,aresample=44100,atempo=0.500000');
      expect(() => ffmpegFilter({tempoFactor: 3, semitones: 0}, 44_100)).to.throw();
    });

    it('offers only gentle factors', () => {
      expect(factorsTowards(140, [150, 172])).to.have.length(2);
      expect(factorsTowards(100, [150, 172])).to.deep.equal([]);
      expect(factorsTowards(150, [150])).to.deep.equal([]);
    });
  });

  describe('loop mixes', () => {
    const loop = (id: string, role: Loop['role'], bpm: number, key: string | null): Loop => ({id, bpm, role, key, licence: 'CC0-1.0', attribution: `by ${id}`, uploader: id});
    const bar = (bpm: number) => Math.round((240 / bpm) * sampleRate);

    it('plans only one tempo and one key per mix, fastest first', () => {
      const plans = planMixes([
        loop('p1', 'percussion', 170, null), loop('b1', 'bass', 170, 'A minor'), loop('h1', 'harmony', 170, 'A minor'),
        loop('p2', 'percussion', 150, null), loop('b2', 'bass', 150, 'C major'), loop('h2', 'harmony', 150, 'C major'),
        loop('b3', 'bass', 160, 'A minor'), loop('h3', 'harmony', 160, 'A minor'),
        loop('h4', 'harmony', 170, 'D minor'),
      ], 's', 5);

      expect(plans.map(plan => [plan.bpm, plan.key])).to.deep.equal([[170, 'A minor'], [150, 'C major']]);
    });

    it('fits whole bars, and refuses a loop that would have to bend', () => {
      expect(barFit(bar(170) * 2, 170)?.bars).to.equal(2);
      expect(barFit(Math.round(bar(170) * 2.4), 170)).to.equal(null);
      expect(barFit(100, 170)).to.equal(null);
    });

    it('renders the structure on the grid, with the bass only where a drop has it', () => {
      const plan = {bpm: 170, key: 'A minor', loops: {percussion: loop('p', 'percussion', 170, null), bass: loop('b', 'bass', 170, 'A minor'), harmony: loop('h', 'harmony', 170, 'A minor')}};
      const silent = new Float32Array(bar(170));
      const {pcm, sections} = renderMix(plan, {percussion: silent, harmony: silent, bass: new Float32Array(bar(170)).fill(0.5)}, short);

      expect(sections.map(section => section.kind)).to.deep.equal(['drop', 'breakdown']);
      expect(pcm.length).to.be.closeTo(bar(170) * 4, 4);
      expect(energy(pcm, 0, bar(170))).to.be.greaterThan(0);
      expect(energy(pcm, bar(170) * 2 + 10, bar(170) * 4 - 10)).to.equal(0);
    });

    it('owes attribution as soon as one loop does', () => {
      const cc0 = loop('a', 'percussion', 170, null);
      const owed = {...loop('b', 'bass', 170, 'A minor'), licence: 'CC-BY-3.0'};

      expect(mixLicence({bpm: 170, key: 'A minor', loops: {percussion: cc0, bass: cc0, harmony: cc0}}).licence).to.equal('CC0-1.0');
      expect(mixLicence({bpm: 170, key: 'A minor', loops: {percussion: cc0, bass: owed, harmony: cc0}}).licence).to.equal('CC-BY-3.0');
      expect(mixLicence({bpm: 170, key: 'A minor', loops: {percussion: cc0, bass: owed, harmony: cc0}}).attribution).to.contain('by b');
    });
  });

  describe('zip range', () => {
    function directoryEntry(name: string, huge: boolean): Uint8Array {
      const nameBytes = new TextEncoder().encode(name);
      const extra = huge ? 28 : 0;
      const entry = new Uint8Array(46 + nameBytes.length + extra);
      const view = new DataView(entry.buffer);

      view.setUint32(0, 0x02_01_4B_50, true);
      view.setUint16(10, 12, true);
      view.setUint32(16, 1234, true);
      view.setUint32(20, huge ? 0xFF_FF_FF_FF : 100, true);
      view.setUint32(24, huge ? 0xFF_FF_FF_FF : 200, true);
      view.setUint16(28, nameBytes.length, true);
      view.setUint16(30, extra, true);
      view.setUint32(42, huge ? 0xFF_FF_FF_FF : 300, true);
      entry.set(nameBytes, 46);

      if (huge) {
        const at = 46 + nameBytes.length;

        view.setUint16(at, 1, true);
        view.setUint16(at + 2, 24, true);
        view.setBigUint64(at + 4, BigInt(6_000_000_000), true);
        view.setBigUint64(at + 12, BigInt(5_000_000_000), true);
        view.setBigUint64(at + 20, BigInt(900_000_000_000), true);
      }

      return entry;
    }

    it('reads plain and zip64 entries', () => {
      const a = directoryEntry('fma_full/000/000002.mp3', false);
      const b = directoryEntry('b.mp3', true);
      const all = new Uint8Array(a.length + b.length);

      all.set(a);
      all.set(b, a.length);

      const [first, second] = parseDirectory(all);

      expect(first).to.deep.equal({name: 'fma_full/000/000002.mp3', method: 12, crc32: 1234, compressedSize: 100, size: 200, headerOffset: 300});
      expect(second).to.deep.include({name: 'b.mp3', size: 6_000_000_000, compressedSize: 5_000_000_000, headerOffset: 900_000_000_000});
    });

    it('refuses bytes that are not the directory: the range was wrong', () => {
      expect(() => parseDirectory(new Uint8Array(100))).to.throw('bad directory entry');
    });

    it('finds the directory from the file\'s tail', () => {
      const tail = new Uint8Array(200);
      const view = new DataView(tail.buffer);

      view.setUint32(50, 0x06_06_4B_50, true);
      view.setBigUint64(50 + 40, BigInt(8_628_867), true);
      view.setBigUint64(50 + 48, BigInt(943_634_069_671), true);

      expect(directoryLocation(tail)).to.deep.equal({offset: 943_634_069_671, size: 8_628_867});
      expect(() => directoryLocation(new Uint8Array(100))).to.throw('zip64');
    });

    it('skips a local header\'s own name and extra field', () => {
      const header = new Uint8Array(30);
      const view = new DataView(header.buffer);

      view.setUint32(0, 0x04_03_4B_50, true);
      view.setUint16(26, 22, true);
      view.setUint16(28, 20, true);

      expect(dataStart(header)).to.equal(72);
      expect(() => dataStart(new Uint8Array(30))).to.throw('local header');
    });
  });
});
