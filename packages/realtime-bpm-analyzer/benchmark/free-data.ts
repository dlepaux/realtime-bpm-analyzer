/**
 * RBA-59: gets the free data, labels it, and says with counts whether it is decent. Stages run in
 * order and resume, as a run takes hours and can be killed. Layout and rules: benchmark/readme.md
 *
 *   free-data.mjs <catalogue|fetch|list|consolidate|synth|derive|mixes|report> [--root dir]
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, truncateSync, writeFileSync} from 'node:fs';
import {dirname, extname, join} from 'node:path';
import {parseArgs} from 'node:util';
import {crc32} from 'node:zlib';
import {dataRoot, loaders, loopAnnotations} from './lib/datasets';
import {fnv1a} from './lib/split';
import type {Split} from './lib/types';
import {keyConsensus, normaliseKey, pickForConfirmation, tempoConsensus} from './free-data/consensus';
import {derivedRow, factorsTowards, ffmpegFilter} from './free-data/derive';
import {mixLicence, planMixes, renderMix} from './free-data/loop-mix';
import type {Loop, LoopRole} from './free-data/loop-mix';
import {artistGroups, artistKeyOf, dropDuplicates, extendFreeze, rowProblems} from './free-data/manifest';
import type {FrozenSplit, ManifestRow, TempoVote} from './free-data/manifest';
import {bandOf, buildReport, calibrate} from './free-data/report';
import {classifyLicence, echonestTempos, narrow, parseCsv, parseFma, parseInternetArchive} from './free-data/sources';
import type {Candidate, FmaRow, GenreRow, IaItem, Parsed} from './free-data/sources';
import {defaultStructure, encodeWav, generateTrack, sampleRate, specFromSeed} from './free-data/synth';
import {dataStart, directoryLocation, parseDirectory, tailBytes} from './free-data/zip-range';
import type {ZipMember} from './free-data/zip-range';

/** Next to dist/, in an image and outside one */
const benchmarkDir = process.env.RBA_BENCHMARK_DIR ?? process.cwd();
const userAgent = 'rba-free-data/0.1 (github.com/dlepaux/realtime-bpm-analyzer)';
const seed = 'rba-59-2026-10-31';
const fmaArchive = 'https://os.unil.cloud.switch.ch/fma/fma_full.zip';
const fmaMetadata = 'https://os.unil.cloud.switch.ch/fma/fma_metadata.zip';
/** As published in FMA's own readme */
const fmaMetadataSha1 = 'f0df49ffe5f2a6008d7dc83c6915b31835dfe733';
/** One artist adds little past this, and the card asks for many */
const perArtist = 30;
const mostBytesPerFile = 80 * 1024 * 1024;
/** The whole set may not take more than this, whatever the catalogue says: 1.6 TB is shared */
const mostBytesInAll = 150 * 1024 ** 3;
/** Refusals in a row from a host end its fetch. A host saying no is an answer, not an obstacle */
const refusalsToStop = 5;
const iaPauseMs = 1000;
const fmaPauseMs = 200;

const iaSubjects = [
  'drum and bass', 'drum & bass', 'drum n bass', 'dnb', 'jungle', 'breakcore', 'gabber', 'hardcore techno', 'speedcore',
  'happy hardcore', 'hardstyle', 'neurofunk', 'footwork', 'juke', 'dubstep', 'hard trance', 'psytrance', 'trance',
  'techno', 'breakbeat',
];
// Metadata costs 3.5 s an item here. These hold about 6,600 items and would add more than six hours of
// holding the one writer lock: rock cannot meet the target, and this tag says nothing about tempo.
// FMA's rock and electronic stay. The report states the omission, as a count here is not all there is.
const iaSubjectsLeftOut = ['punk', 'thrash', 'grindcore', 'electronic'];

const sleep = (ms: number) => new Promise(resolve => { setTimeout(resolve, ms); });

/** Lines end with their newline, so anything after the last one is a write a kill cut short */
function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) {
    return [];
  }

  const text = readFileSync(path, 'utf8');

  return text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as T);
}

/** Cuts a line a kill left half written, as the next append would glue onto it */
function repairTail(path: string): void {
  if (existsSync(path)) {
    const bytes = readFileSync(path);

    truncateSync(path, bytes.lastIndexOf(10) + 1);
  }
}

/** Why a stage ended before its work did. A short count from a stop must not read as scarcity */
function recordStop(root: string, stop: string): void {
  log(stop);
  appendFileSync(join(root, 'stops.jsonl'), `${JSON.stringify({stop})}\n`);
}

function writeAtomic(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(`${path}.partial`, content);
  renameSync(`${path}.partial`, path);
}

function log(message: string): void {
  console.error(`[free-data] ${message}`);
}

async function get(url: string, range?: readonly [number, number]): Promise<Response> {
  return fetch(url, {
    headers: {'user-agent': userAgent, ...(range ? {range: `bytes=${range[0]}-${range[1]}`} : {})},
    signal: AbortSignal.timeout(600_000),
  });
}

/** Streamed against a limit: a host's stated length is optional, and a job's memory is not */
async function getBytes(url: string, range?: readonly [number, number], most = mostBytesPerFile * 2): Promise<Uint8Array> {
  const response = await get(url, range);

  if (response.status !== (range ? 206 : 200)) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  if (response.body) {
    const reader = response.body.getReader();

    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      size += part.value.length;

      if (size > most) {
        await reader.cancel();
        throw new Error('over the size limit');
      }

      chunks.push(part.value);
    }
  }

  return new Uint8Array(Buffer.concat(chunks));
}

function tally(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

async function fmaCandidates(root: string): Promise<Parsed[]> {
  const dir = join(root, 'catalogue/fma');
  const zip = join(dir, 'fma_metadata.zip');

  mkdirSync(dir, {recursive: true});

  if (!existsSync(zip)) {
    // Its own limit, above the 358 MB published: this file is pinned by hash just below
    writeAtomic(zip, await getBytes(fmaMetadata, undefined, 400 * 1024 * 1024));
  }

  const sha1 = createHash('sha1').update(readFileSync(zip)).digest('hex');

  if (sha1 !== fmaMetadataSha1) {
    throw new Error(`fma_metadata.zip is ${sha1}, not the published one`);
  }

  const unzip = spawnSync('unzip', ['-o', '-j', zip, 'fma_metadata/raw_tracks.csv', 'fma_metadata/genres.csv', 'fma_metadata/echonest.csv', '-d', dir]);

  if (unzip.status !== 0) {
    throw new Error(`unzip failed: ${unzip.stderr.toString()}`);
  }

  const table = (name: string) => parseCsv(readFileSync(join(dir, name), 'utf8'));
  const [genreHeader, ...genreRows] = table('genres.csv');
  const genres = new Map(genreRows.map(row => {
    const genre = Object.fromEntries(genreHeader.map((name, i) => [name, row[i]])) as GenreRow;

    return [genre.genre_id, genre];
  }));
  const tempos = echonestTempos(table('echonest.csv'));
  const [header, ...rows] = table('raw_tracks.csv');

  return rows.map(row => {
    const track = Object.fromEntries(header.map((name, i) => [name, row[i]])) as FmaRow;

    return parseFma(track, genres, tempos.get(track.track_id) ?? null);
  });
}

async function iaIdentifiers(root: string, subject: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = '';

  // Bounded: the largest subject here holds a few thousand items, at 1000 a page
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({
      q: `mediatype:audio AND licenseurl:*creativecommons* AND subject:"${subject}"`,
      fields: 'identifier,licenseurl',
      count: '1000',
      ...(cursor ? {cursor} : {}),
    });
    const body = JSON.parse(new TextDecoder().decode(await getBytes(`https://archive.org/services/search/v1/scrape?${query.toString()}`))) as {
      items?: ReadonlyArray<{identifier: string; licenseurl?: string}>;
      cursor?: string;
    };

    found.push(...(body.items ?? []).filter(item => classifyLicence(item.licenseurl ?? '').ok).map(item => item.identifier));
    await sleep(iaPauseMs);

    if (!body.cursor) {
      return found;
    }

    cursor = body.cursor;
  }

  recordStop(root, `internet archive, ${subject}: stopped at the page limit, more items exist`);

  return found;
}

/** Each item's metadata is cached, so a resumed catalogue asks the Archive for nothing twice */
async function iaCandidates(root: string): Promise<Parsed[]> {
  const cache = join(root, 'catalogue/ia-items.jsonl');

  repairTail(cache);

  const items = new Map(readJsonl<IaItem>(cache).map(item => [item.metadata.identifier, item]));
  const identifiers = new Set<string>();

  for (const subject of iaSubjects) {
    const found = await iaIdentifiers(root, subject);

    found.forEach(identifier => { identifiers.add(identifier); });
    log(`internet archive, ${subject}: ${found.length} permissive items, ${identifiers.size} in all`);
  }

  recordStop(root, `internet archive: subjects left out to save time, more items exist: ${iaSubjectsLeftOut.join(', ')}`);

  let refusals = 0;

  for (const identifier of [...identifiers].filter(id => !items.has(id))) {
    const response = await get(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);

    refusals = response.ok ? 0 : refusals + 1;

    if (refusals >= refusalsToStop) {
      throw new Error(`the Internet Archive refused ${refusals} in a row, last HTTP ${response.status}`);
    }

    if (response.ok) {
      const item = await response.json() as IaItem;

      if (item.metadata?.identifier) {
        const small: IaItem = {metadata: item.metadata, files: item.files ?? []};

        items.set(identifier, small);
        appendFileSync(cache, `${JSON.stringify(small)}\n`);
      }
    }

    await sleep(iaPauseMs);
  }

  return [...identifiers].flatMap(identifier => {
    const item = items.get(identifier);

    return item ? parseInternetArchive(item) : [];
  });
}

async function catalogue(root: string): Promise<void> {
  // Frozen once written: a new item could move the per-artist draw and silently drop analysed tracks
  if (existsSync(join(root, 'catalogue/candidates.jsonl'))) {
    log('catalogue: already frozen');
    return;
  }

  const parsed = [...await fmaCandidates(root), ...await iaCandidates(root)];
  const rejected = parsed.flatMap(result => (result.ok ? [] : [result.reason]));
  const candidates = parsed.flatMap(result => (result.ok ? [result.candidate] : []));
  const {kept, dropped} = narrow(candidates, seed, perArtist);

  writeAtomic(join(root, 'catalogue/candidates.jsonl'), kept.map(row => JSON.stringify(row)).join('\n') + '\n');
  writeAtomic(join(root, 'catalogue/rejections.json'), JSON.stringify({rejected: tally(rejected), narrowed: dropped}, null, 2));
  log(`catalogue: ${kept.length} candidates, ${rejected.length} rejected, ${JSON.stringify(dropped)}`);
}

type Fetched = {readonly id: string; readonly path: string; readonly sha256: string; readonly bytes: number};

async function fmaDirectory(root: string): Promise<ReadonlyMap<string, ZipMember>> {
  const path = join(root, 'catalogue/fma/directory.bin');

  if (!existsSync(path)) {
    const head = await fetch(fmaArchive, {method: 'HEAD', headers: {'user-agent': userAgent}});
    const size = Number(head.headers.get('content-length'));
    const {offset, size: length} = directoryLocation(await getBytes(fmaArchive, [size - tailBytes, size - 1]));

    writeAtomic(path, await getBytes(fmaArchive, [offset, offset + length - 1]));
  }

  return new Map(parseDirectory(readFileSync(path)).map(member => [member.name, member]));
}

async function fmaMember(member: ZipMember): Promise<Uint8Array> {
  if (member.method !== 12 || member.compressedSize > mostBytesPerFile) {
    throw new Error(`member not fetched: method ${member.method}, ${member.compressedSize} bytes`);
  }

  const header = await getBytes(fmaArchive, [member.headerOffset, member.headerOffset + 29]);
  const start = member.headerOffset + dataStart(header);
  const packed = await getBytes(fmaArchive, [start, start + member.compressedSize - 1]);
  const bzip2 = spawnSync('bzip2', ['-dc'], {input: packed, maxBuffer: mostBytesPerFile * 2});

  if (bzip2.status !== 0 || crc32(bzip2.stdout) !== member.crc32 || bzip2.stdout.length !== member.size) {
    throw new Error('member failed its archive checksum');
  }

  return bzip2.stdout;
}

/** One host's queue, in order. A refusal is counted, and enough of them in a row end the queue */
async function fetchQueue(
  root: string,
  disk: {bytes: number},
  queue: readonly Candidate[],
  pauseMs: number,
  read: (candidate: Candidate) => Promise<Uint8Array>,
): Promise<void> {
  const out = join(root, 'fetched.jsonl');
  const failures = join(root, 'fetch-failures.jsonl');
  let refusals = 0;

  for (const candidate of queue) {
    if (disk.bytes > mostBytesInAll) {
      recordStop(root, `${candidate.source}: stopped at the disk limit`);
      return;
    }

    try {
      const bytes = await read(candidate);
      const extension = 'zipMember' in candidate.audio ? '.mp3' : extname(new URL(candidate.audio.url).pathname).toLowerCase();
      const name = createHash('sha1').update(candidate.id).digest('hex');
      const path = join(root, 'audio', candidate.source, name.slice(0, 2), `${name}${extension}`);

      writeAtomic(path, bytes);
      appendFileSync(out, `${JSON.stringify({id: candidate.id, path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length} satisfies Fetched)}\n`);
      disk.bytes += bytes.length;
      refusals = 0;
    } catch (error) {
      const reason = String(error);

      appendFileSync(failures, `${JSON.stringify({id: candidate.id, reason})}\n`);
      refusals = /HTTP (403|429|503)/.test(reason) ? refusals + 1 : 0;

      if (refusals >= refusalsToStop) {
        recordStop(root, `${candidate.source}: refused ${refusals} in a row, queue stopped: ${reason}`);
        return;
      }
    }

    await sleep(pauseMs);
  }
}

async function fetchAudio(root: string): Promise<void> {
  repairTail(join(root, 'fetched.jsonl'));
  repairTail(join(root, 'fetch-failures.jsonl'));

  const fetched = readJsonl<Fetched>(join(root, 'fetched.jsonl'));
  const done = new Set(fetched.map(row => row.id));
  // One limit over both queues, or each would have the whole allowance
  const disk = {bytes: fetched.reduce((sum, row) => sum + row.bytes, 0)};
  const candidates = readJsonl<Candidate>(join(root, 'catalogue/candidates.jsonl')).filter(row => !done.has(row.id));
  const members = await fmaDirectory(root);
  const of = (source: Candidate['source']) => candidates.filter(row => row.source === source);

  log(`fetch: ${candidates.length} to go`);
  await Promise.all([
    fetchQueue(root, disk, of('fma'), fmaPauseMs, async candidate => {
      const member = 'zipMember' in candidate.audio ? members.get(candidate.audio.zipMember) : undefined;

      if (!member) {
        throw new Error('not in the archive');
      }

      return fmaMember(member);
    }),
    fetchQueue(root, disk, of('internet-archive'), iaPauseMs, async candidate => {
      if (!('url' in candidate.audio)) {
        throw new Error('no url');
      }

      return getBytes(candidate.audio.url, undefined, mostBytesPerFile);
    }),
  ]);
}

function listForTrackers(root: string): void {
  // Generated audio goes along as a calibration: its tempo is exact, so it shows how each tracker fares
  const rows = [
    ...readJsonl<Fetched>(join(root, 'fetched.jsonl')).map(({id, path}) => ({id, path})),
    ...readJsonl<ManifestRow>(join(root, 'not-real-generated.jsonl')).map(row => ({id: row.id, path: row.audioPath})),
  ];

  writeAtomic(join(root, 'analysis-list.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  log(`list: ${rows.length} tracks`);
}

type Reading = {
  readonly id: string;
  readonly error?: string;
  readonly duration?: number;
  readonly votes?: readonly TempoVote[];
  readonly keyVotes?: readonly string[];
  readonly halvesAgree?: boolean | null;
};

/** Same artist, same title, about the same length: one recording, whichever host or encode it came from */
function recordingKey(candidate: Candidate, duration: number): string {
  const title = candidate.title.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^\p{L}\p{N}]+/gu, '');

  return `${candidate.artistKey}|${title}|${Math.round(duration / 4)}`;
}

function realRows(root: string): {readonly rows: ManifestRow[]; readonly refused: Record<string, number>} {
  const candidates = new Map(readJsonl<Candidate>(join(root, 'catalogue/candidates.jsonl')).map(row => [row.id, row]));
  const fetched = new Map(readJsonl<Fetched>(join(root, 'fetched.jsonl')).map(row => [row.id, row]));
  const refused: string[] = [];
  const labelled = readJsonl<Reading>(join(root, 'readings.jsonl')).flatMap(reading => {
    const candidate = candidates.get(reading.id);
    const file = fetched.get(reading.id);

    if (!candidate || !file) {
      return [];
    }

    // The catalogue froze before the parser refused these, and it stays frozen so the split
    // does not move: the same refusal is applied here.
    if (!candidate.url.trim()) {
      refused.push('no source page');
      return [];
    }

    if (reading.error || !reading.votes || !reading.duration) {
      refused.push('audio would not decode');
      return [];
    }

    if (reading.duration < 60 || reading.duration > 900) {
      refused.push('wrong length, as measured');
      return [];
    }

    return [{
      id: reading.id,
      candidate,
      file,
      reading,
      votes: reading.votes,
      duration: reading.duration,
      artist: candidate.artist,
      artistKey: candidate.artistKey,
      genreFamily: candidate.genreFamily,
      contentKeys: [file.sha256, recordingKey(candidate, reading.duration)],
    }];
  });
  const groups = artistGroups(labelled);
  const {kept, dropped} = dropDuplicates(labelled);
  const freezePath = join(root, 'split-frozen.json');
  const previous = existsSync(freezePath) ? JSON.parse(readFileSync(freezePath, 'utf8')) as FrozenSplit : {seed, artists: {}};
  const {frozen, conflicted} = extendFreeze(kept, groups, previous);

  writeAtomic(freezePath, JSON.stringify(frozen, null, 1));
  refused.push(...Array.from({length: dropped.size}, () => 'duplicate recording'));

  const placed = kept.filter(({artistKey}) => !conflicted.has(groups.get(artistKey) ?? artistKey));

  refused.push(...Array.from({length: kept.length - placed.length}, () => 'artist on both sides of the frozen split'));

  const rows = placed.map(({candidate, file, reading, votes, duration}): ManifestRow => {
    const consensus = tempoConsensus(votes);

    return {
      id: candidate.id,
      kind: 'real',
      source: candidate.source,
      url: candidate.url,
      artist: candidate.artist,
      artistKey: candidate.artistKey,
      title: candidate.title,
      licence: candidate.licence,
      licenceClass: candidate.licenceClass,
      licenceEvidence: candidate.licenceEvidence,
      attribution: candidate.attribution,
      sha256: file.sha256,
      durationSeconds: duration,
      genre: candidate.genre,
      genreFamily: candidate.genreFamily,
      bpm: consensus.bpm,
      key: keyConsensus(reading.keyVotes ?? []),
      confidence: consensus.confidence,
      labelProvenance: {
        method: 'independent trackers, hint excluded',
        votes,
        hintBpm: candidate.hintBpm,
        keyVotes: reading.keyVotes,
        octaveSplit: consensus.octaveSplit,
        candidateBpm: consensus.candidateBpm,
        halvesAgree: reading.halvesAgree ?? null,
      },
      sourceItems: [],
      split: frozen.artists[candidate.artistKey],
      audioPath: file.path,
    };
  });

  return {rows, refused: tally(refused)};
}

function confirmationFile(root: string, rows: readonly ManifestRow[]): void {
  const picks = pickForConfirmation(
    rows.map(row => ({
      id: row.id,
      confidence: row.confidence,
      octaveSplit: (row.labelProvenance.octaveSplit ?? false) || row.labelProvenance.halvesAgree === false,
      band: bandOf(row.bpm ?? row.labelProvenance.candidateBpm ?? null),
    })),
    seed,
    50,
    150,
  );
  const byId = new Map(rows.map(row => [row.id, row]));
  // Shuffled, with no label, votes, hint or reason in sight: a listener who sees a number hears it.
  // The key stays in its own file, for whoever compares afterwards.
  const shuffled = picks.flatMap(({id, why}) => {
    const row = byId.get(id);

    return row ? [{why, row}] : [];
  }).sort((a, b) => fnv1a(`${seed}:listen:${a.row.id}`) - fnv1a(`${seed}:listen:${b.row.id}`));
  const lines = shuffled.map(({row}) => `| ${row.id} | ${row.url} | \`${row.audioPath}\` | ${row.sha256.slice(0, 12)} |  |`);
  const minutes = Math.ceil(lines.length * 1.5);

  writeAtomic(join(root, 'confirmation-key.jsonl'), shuffled.map(({why, row}) => JSON.stringify({
    id: row.id, why, label: row.bpm, candidate: row.labelProvenance.candidateBpm, votes: row.labelProvenance.votes, hint: row.labelProvenance.hintBpm,
  })).join('\n') + '\n');
  writeAtomic(join(root, 'confirmation.md'), [
    '# RBA-59: tracks for a person to confirm',
    '',
    `${lines.length} tracks, about ${minutes} minutes at 1.5 minutes each: tap the beat, write the tempo in the last column.`,
    'The list is blind on purpose: open `confirmation-key.jsonl` only after listening. It says which tracks are the random sample, measuring how far agreement can be trusted, and which are open cases from the fast bands.',
    'Paths are on srv-compute, under the volume mounted at /data/rba-tempo (/srv/data/rba-tempo).',
    '',
    '| id | page | audio | sha256 | tempo heard |',
    '| --- | --- | --- | --- | --- |',
    ...lines,
    '',
  ].join('\n'));
}

function consolidate(root: string): void {
  const {rows, refused} = realRows(root);
  const problems = rows.flatMap(row => rowProblems(row).map(problem => `${row.id}: ${problem}`));

  if (problems.length > 0) {
    throw new Error(`rows with problems, none written:\n${problems.slice(0, 20).join('\n')}`);
  }

  writeAtomic(join(root, 'manifest.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  writeAtomic(join(root, 'refused.json'), JSON.stringify(refused, null, 2));
  writeAtomic(join(root, 'split-ids.json'), JSON.stringify({
    seed,
    dev: rows.filter(row => row.split === 'dev').map(row => row.id).sort(),
    heldout: rows.filter(row => row.split === 'heldout').map(row => row.id).sort(),
  }));
  confirmationFile(root, rows);
  log(`consolidate: ${rows.length} real tracks, refused ${JSON.stringify(refused)}`);
}

/** Every made row passes here, as `rowProblems` is what keeps made audio out of held-out */
function writeNotReal(root: string, name: string, rows: readonly ManifestRow[]): void {
  const problems = rows.flatMap(row => rowProblems(row).map(problem => `${row.id}: ${problem}`));

  if (problems.length > 0) {
    throw new Error(`rows with problems, none written:\n${problems.slice(0, 20).join('\n')}`);
  }

  writeAtomic(join(root, `not-real-${name}.jsonl`), rows.map(row => `${JSON.stringify(row)}\n`).join(''));
}

function synthRow(id: string, audioPath: string, pcmLength: number, sha256: string, bpm: number, key: string, genre: string, sections: ManifestRow['sections']): ManifestRow {
  return {
    id,
    kind: 'generated',
    source: 'generated',
    url: 'packages/realtime-bpm-analyzer/benchmark/free-data/synth.ts',
    artist: 'generated from code',
    artistKey: 'generated',
    title: id,
    licence: 'MIT',
    licenceClass: 'permissive',
    licenceEvidence: 'This repo\'s own code, no sample and no third-party audio: benchmark/free-data/synth.ts',
    attribution: 'realtime-bpm-analyzer benchmark synth',
    sha256,
    durationSeconds: pcmLength / sampleRate,
    genre,
    genreFamily: 'electronic',
    bpm,
    key,
    confidence: 'exact',
    labelProvenance: {method: 'by construction', votes: [], hintBpm: null},
    sections,
    sourceItems: [],
    split: 'dev',
    audioPath,
  };
}

function synth(root: string, count: number): void {
  const rows = Array.from({length: count}, (_, i) => {
    const spec = specFromSeed(fnv1a(`${seed}:synth:${i}`));
    const track = generateTrack(spec);
    const wav = encodeWav(track.pcm);
    const id = `generated-${i}-${spec.style.name}-${spec.bpm}`;
    const path = join(root, 'generated', `${id}.wav`);

    writeAtomic(path, wav);

    return synthRow(id, path, track.pcm.length, createHash('sha256').update(wav).digest('hex'), spec.bpm, track.key, spec.style.name, track.sections);
  });

  writeNotReal(root, 'generated', rows);
  log(`synth: ${rows.length} tracks`);
}

/**
 * A small sample: this card proves the tooling, and how many are worth making depends on what RBA-60
 * finds. Sources are dev, labelled by every tracker with no octave dissent, so a wrong label does not
 * get copied.
 */
function derive(root: string, count: number): void {
  const manifest = readJsonl<ManifestRow>(join(root, 'manifest.jsonl'));
  const sources = manifest
    .filter(row => row.kind === 'real' && row.split === 'dev' && row.confidence === 'trackers-all' && !row.labelProvenance.octaveSplit && row.labelProvenance.halvesAgree !== false && row.bpm !== null)
    .sort((a, b) => fnv1a(`${seed}:derive:${a.id}`) - fnv1a(`${seed}:derive:${b.id}`));
  const rows: ManifestRow[] = [];
  const failures: string[] = [];

  mkdirSync(join(root, 'derived'), {recursive: true});

  for (const source of sources) {
    const [tempoFactor] = factorsTowards(source.bpm ?? 0, [150, 172]);

    if (tempoFactor !== undefined && rows.length < count) {
      const semitones = (fnv1a(source.id) % 5) - 2;
      const path = join(root, 'derived', `${createHash('sha1').update(source.id).digest('hex')}.flac`);
      const made = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', source.audioPath, '-af', ffmpegFilter({tempoFactor, semitones}, 44_100), '-ar', '44100', '-map_metadata', '-1', path]);

      if (made.status === 0) {
        rows.push(derivedRow(source, {tempoFactor, semitones}, {
          sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
          durationSeconds: source.durationSeconds / tempoFactor,
          audioPath: path,
        }));
      } else {
        failures.push(`${source.id}: ${String(made.stderr).slice(0, 200)}`);
      }
    }
  }

  writeNotReal(root, 'derived', rows);
  log(`derive: ${rows.length} tracks, ${failures.length} failed${failures.length > 0 ? `, first: ${failures[0]}` : ''}`);
}

/** The loops FSLD's own split and licence filter allow, with the role and key their annotators gave */
function annotatedLoops(root: string): ReadonlyArray<Loop & {readonly audioPath: string; readonly split: Split; readonly genre: string}> {
  const base = join(root, '../fsld');
  const annotations = loopAnnotations(base);
  const {dev} = JSON.parse(readFileSync(join(benchmarkDir, 'splits/fsld.json'), 'utf8')) as Record<Split, string[]>;
  const onDev = new Set(dev);
  const metadata = JSON.parse(readFileSync(join(base, 'FSL10K/metadata.json'), 'utf8')) as Record<string, {username: string; name: string}>;

  return loaders.fsld().flatMap(track => {
    const first = annotations.get(track.id)?.[0];
    const flags = first?.instrumentation;
    const item = metadata[track.id];

    if (!first || !flags || !item) {
      return [];
    }

    const role: LoopRole | null = flags.percussion && !flags.bass && !flags.chords && !flags.melody
      ? 'percussion'
      : (flags.bass && !flags.percussion && !flags.chords ? 'bass' : (flags.chords && !flags.percussion && !flags.bass ? 'harmony' : null));
    const key = first.key && first.mode ? normaliseKey(`${first.key} ${first.mode}`) : null;

    return role === null ? [] : [{
      id: track.id,
      bpm: track.bpm,
      role,
      key: role === 'percussion' ? null : key,
      licence: track.licence,
      attribution: `"${item.name}" by ${item.username}, ${track.licence}, https://freesound.org/s/${track.id}/`,
      uploader: item.username,
      audioPath: track.audioPath,
      split: onDev.has(track.id) ? 'dev' as const : 'heldout' as const,
      genre: track.genre,
    }];
  });
}

function decode(path: string): Float32Array {
  const pcm = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', path, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], {maxBuffer: 256 * 1024 * 1024});

  if (pcm.status !== 0) {
    throw new Error(`could not decode ${path}`);
  }

  const bytes = new Uint8Array(pcm.stdout);

  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4)).slice();
}

function mixes(root: string, count: number): void {
  const loops = annotatedLoops(root).filter(loop => loop.split === 'dev');
  const byId = new Map(loops.map(loop => [loop.id, loop]));
  const usable = loops.filter(loop => loop.role === 'percussion' || loop.key !== null);
  const plans = planMixes(usable.filter(loop => loop.bpm >= 130), seed, count * 8);
  const rows: ManifestRow[] = [];

  for (const plan of plans) {
    if (rows.length < count) {
      try {
        const audio = {
          percussion: decode(byId.get(plan.loops.percussion.id)?.audioPath ?? ''),
          bass: decode(byId.get(plan.loops.bass.id)?.audioPath ?? ''),
          harmony: decode(byId.get(plan.loops.harmony.id)?.audioPath ?? ''),
        };
        const mix = renderMix(plan, audio, defaultStructure);
        const wav = encodeWav(mix.pcm);
        const id = `loop-mix-${plan.bpm}-${plan.key.replaceAll(' ', '-').replaceAll('#', 'sharp')}-${rows.length}`;
        const path = join(root, 'loop-mixes', `${id}.wav`);
        const sources = Object.values(plan.loops);
        const {licence, attribution} = mixLicence(plan);

        writeAtomic(path, wav);
        rows.push({
          id,
          kind: 'loop-mix',
          source: 'fsld',
          url: 'packages/realtime-bpm-analyzer/benchmark/free-data/loop-mix.ts',
          artist: sources.map(loop => loop.uploader).join(', '),
          artistKey: artistKeyOf(sources[0].uploader) ?? 'fsld',
          title: id,
          licence,
          licenceClass: 'permissive',
          licenceEvidence: `FSLD metadata.json per loop: ${sources.map(loop => `${loop.id} ${loop.licence}`).join(', ')}`,
          attribution,
          sha256: createHash('sha256').update(wav).digest('hex'),
          durationSeconds: mix.pcm.length / sampleRate,
          genre: 'loop mix',
          genreFamily: 'electronic',
          bpm: plan.bpm,
          key: plan.key,
          confidence: 'exact',
          labelProvenance: {method: 'by construction, from annotated loops of one tempo and key', votes: [], hintBpm: null},
          sections: mix.sections,
          sourceItems: sources.map(loop => `fsld-${loop.id}`),
          split: 'dev',
          audioPath: path,
        });
      } catch (error) {
        log(`mix skipped: ${String(error)}`);
      }
    }
  }

  writeNotReal(root, 'loop-mixes', rows);
  log(`mixes: ${rows.length} of ${plans.length} plans, from ${usable.length} usable dev loops: ${JSON.stringify(tally(usable.map(loop => loop.role)))}`);
}

/** Counted, never summed into the target: a loop is seconds long, whatever its tempo */
function loopCounts(): {readonly loops: number; readonly bands: Record<string, number>; readonly byLicence: Record<string, number>} {
  const loops = loaders.fsld();

  return {loops: loops.length, bands: tally(loops.map(track => bandOf(track.bpm))), byLicence: tally(loops.map(track => track.licence))};
}

function directorySize(path: string): number {
  const du = spawnSync('du', ['-sb', path]);

  return du.status === 0 ? Number(du.stdout.toString().split('\t')[0]) : (existsSync(path) ? statSync(path).size : 0);
}

/** A report is worth reading mid-run too, so a stage not run yet is an empty count, not a crash */
function readJsonIfThere(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as unknown : {};
}

function report(root: string): void {
  const rows = [
    ...readJsonl<ManifestRow>(join(root, 'manifest.jsonl')),
    ...['generated', 'derived', 'loop-mixes'].flatMap(name => readJsonl<ManifestRow>(join(root, `not-real-${name}.jsonl`))),
  ];
  const readings = new Map(readJsonl<Reading>(join(root, 'readings.jsonl')).map(row => [row.id, row.votes ?? []]));
  const candidates = readJsonl<Candidate>(join(root, 'catalogue/candidates.jsonl')).length;
  const fetched = readJsonl<Fetched>(join(root, 'fetched.jsonl')).length;
  const stops = readJsonl<{stop: string}>(join(root, 'stops.jsonl')).map(row => row.stop);
  const body = {
    ...buildReport(rows),
    // A stop or a gap means the counts are a floor, not what free data can give
    progress: {candidates, fetched, read: readings.size, stops, complete: stops.length === 0 && candidates > 0 && fetched >= candidates},
    calibrationOnGenerated: calibrate(rows.filter(row => row.kind === 'generated'), readings),
    fsldLoops: loopCounts(),
    catalogue: readJsonIfThere(join(root, 'catalogue/rejections.json')),
    refused: readJsonIfThere(join(root, 'refused.json')),
    fetchFailures: tally(readJsonl<{reason: string}>(join(root, 'fetch-failures.jsonl')).map(row => row.reason.slice(0, 60))),
    diskBytes: directorySize(root),
  };

  writeAtomic(join(root, 'report.json'), JSON.stringify(body, null, 2));
  console.log(JSON.stringify(body));
}

async function main(): Promise<void> {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {root: {type: 'string'}, count: {type: 'string'}}});
  const root = values.root ?? join(dataRoot, 'free-data');
  const [stage] = positionals;
  const count = Number(values.count ?? 12);

  mkdirSync(root, {recursive: true});

  switch (stage) {
    case 'catalogue': { await catalogue(root); break; }
    case 'fetch': { await fetchAudio(root); break; }
    case 'list': { listForTrackers(root); break; }
    case 'consolidate': { consolidate(root); break; }
    case 'synth': { synth(root, count); break; }
    case 'derive': { derive(root, count); break; }
    case 'mixes': { mixes(root, count); break; }
    case 'report': { report(root); break; }
    default: {
      console.error(`unknown stage: ${stage ?? 'none'}`);
      process.exit(2);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
