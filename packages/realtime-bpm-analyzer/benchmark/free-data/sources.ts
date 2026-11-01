import {fnv1a} from '../lib/split';
import {artistKeyOf} from './manifest';
import type {LicenceClass, ManifestRow} from './manifest';

/**
 * Parsing what each host says about an item into a candidate or a named rejection. Pure, so every
 * rule can be tested without a network. An item whose licence or maker is unclear is rejected and
 * counted, never guessed at.
 */

export type Candidate = {
  readonly id: string;
  readonly source: 'fma' | 'internet-archive';
  readonly url: string;
  /** Where the audio comes from: a URL, or a member of FMA's own archive */
  readonly audio: {readonly url: string} | {readonly zipMember: string};
  readonly artist: string;
  readonly artistKey: string;
  readonly title: string;
  readonly licence: string;
  readonly licenceClass: LicenceClass;
  readonly licenceEvidence: string;
  readonly attribution: string;
  readonly genre: string;
  readonly genreFamily: ManifestRow['genreFamily'];
  readonly hintBpm: number | null;
  /** What the host states, in seconds, or null when it states nothing */
  readonly statedSeconds: number | null;
};

export type Parsed = {readonly ok: true; readonly candidate: Candidate} | {readonly ok: false; readonly reason: string};

export type LicenceVerdict =
  | {readonly ok: true; readonly spdx: string; readonly licenceClass: LicenceClass}
  | {readonly ok: false; readonly reason: string};

const licenceUrl = /^https?:\/\/(?:www\.)?creativecommons\.org\/(?:licenses\/(by|by-sa)\/(\d\.\d)(?:\/([a-z]{2}))?|publicdomain\/zero\/1\.0)\/?(?:deed\.[a-zA-Z-]+|legalcode)?$/;

/**
 * The only way in is an exact licence URL: a title or a free-text note decides nothing. Public
 * domain marks are out on purpose: they state no licence from the maker.
 * @param url Licence URL as the host gives it
 * @returns SPDX id and class, or why it is refused
 */
export function classifyLicence(url: string): LicenceVerdict {
  const match = licenceUrl.exec(url.trim());

  if (!match) {
    return {ok: false, reason: url.trim() === '' ? 'no licence' : 'licence not permissive'};
  }

  const [, terms, version, port] = match;

  if (!terms) {
    return {ok: true, spdx: 'CC0-1.0', licenceClass: 'permissive'};
  }

  const suffix = port ? `-${port.toUpperCase()}` : '';

  return terms === 'by'
    ? {ok: true, spdx: `CC-BY-${version}${suffix}`, licenceClass: 'permissive'}
    : {ok: true, spdx: `CC-BY-SA-${version}${suffix}`, licenceClass: 'share-alike'};
}

const fastRock = /\b(punk|hardcore|thrash|grindcore|grind|metal|speedcore)\b/i;
const electronic = /\b(electronic|electronica|techno|house|trance|drum ?(?:&|and|n|'n'|-)? ?bass|dnb|d&b|jungle|breakcore|breakbeat|breaks|gabber|hardstyle|hard ?dance|dubstep|idm|edm|electro|chiptune|chip ?music|glitch|footwork|juke|psytrance|goa|acid|rave|synth|synthwave|bigbeat|neurofunk|grime)\b/i;

/**
 * Which family a free-text genre falls in. The card asks for electronic music; loud rock is kept
 * and reported apart because it fills the fast bands with a different sound.
 * @param text Tags or genre names
 * @returns The family
 */
export function genreFamilyOf(text: string): ManifestRow['genreFamily'] {
  if (electronic.test(text)) {
    return 'electronic';
  }

  return fastRock.test(text) ? 'fast-rock' : 'other';
}

function attribution(title: string, artist: string, licence: string, url: string): string {
  return `"${title}" by ${artist}, ${licence}, ${url}`;
}

export type GenreRow = {readonly genre_id: string; readonly title: string; readonly top_level: string};

const fastRockGenres: ReadonlySet<string> = new Set([
  'Punk', 'Hardcore', 'Thrash', 'Grindcore', 'Metal', 'Death-Metal', 'Black-Metal', 'Electro-Punk',
]);

const electronicTopLevel = '15';

export type FmaRow = {
  readonly track_id: string;
  readonly artist_name: string;
  readonly track_title: string;
  readonly license_url: string;
  readonly license_title: string;
  readonly track_genres: string;
  readonly track_url: string;
  readonly track_duration: string;
};

/**
 * Reads a row of FMA's own `raw_tracks.csv`. Audio is a member of the dataset's archive, so the site
 * is never crawled, as its terms bar data mining.
 * @param row Row of raw_tracks.csv
 * @param genres FMA's genres.csv by id
 * @param tempoHint Echo Nest tempo of the track, one old detector's opinion
 * @returns The candidate, or why not
 */
export function parseFma(row: FmaRow, genres: ReadonlyMap<string, GenreRow>, tempoHint: number | null): Parsed {
  const verdict = classifyLicence(row.license_url);

  if (!verdict.ok) {
    return verdict;
  }

  const stated = [...row.track_genres.matchAll(/'genre_id':\s*'(\d+)'/g)].flatMap(match => {
    const genre = genres.get(match[1]);

    return genre ? [genre] : [];
  });
  const isElectronic = stated.some(genre => genre.top_level === electronicTopLevel);
  const isFastRock = stated.some(genre => fastRockGenres.has(genre.title));

  if (!isElectronic && !isFastRock) {
    return {ok: false, reason: 'genre out of scope'};
  }

  const artistKey = artistKeyOf(row.artist_name);

  if (!artistKey) {
    return {ok: false, reason: 'no artist'};
  }

  // CC BY attribution and any later check of the licence both need the track's own page; a
  // made-up address, or an album page standing in for it, would be evidence nobody could follow.
  if (!row.track_url.trim()) {
    return {ok: false, reason: 'no source page'};
  }

  const number = row.track_id.padStart(6, '0');

  return {
    ok: true,
    candidate: {
      id: `fma-${row.track_id}`,
      source: 'fma',
      url: row.track_url,
      audio: {zipMember: `fma_full/${number.slice(0, 3)}/${number}.mp3`},
      artist: row.artist_name.trim(),
      artistKey,
      title: row.track_title,
      licence: verdict.spdx,
      licenceClass: verdict.licenceClass,
      licenceEvidence: `FMA dataset fma_metadata.zip raw_tracks.csv, track ${row.track_id}, license_url ${row.license_url}`,
      attribution: attribution(row.track_title, row.artist_name.trim(), verdict.spdx, row.track_url),
      genre: stated.map(genre => genre.title).join(','),
      genreFamily: isElectronic ? 'electronic' : 'fast-rock',
      hintBpm: tempoHint,
      statedSeconds: secondsOf(row.track_duration),
    },
  };
}

type IaFile = {
  readonly name: string;
  readonly source?: string;
  /** On a derivative: the file it was made from */
  readonly original?: string;
  readonly format?: string;
  readonly artist?: string;
  readonly creator?: string;
  readonly title?: string;
  readonly length?: string;
  readonly bpm?: string;
};

export type IaItem = {
  readonly metadata: {
    readonly identifier: string;
    readonly licenseurl?: string;
    readonly creator?: string | readonly string[];
    readonly subject?: string | readonly string[];
    readonly description?: string | readonly string[];
    readonly title?: string;
    readonly rights?: string | readonly string[];
  };
  readonly files: readonly IaFile[];
};

function joined(value: string | readonly string[] | undefined): string {
  return typeof value === 'string' ? value : (value ?? []).join(' ; ');
}

/** Words that contradict a permissive item field. Anything like this goes to rejection, not to a judgement */
const conflict = /all rights reserved|non-?commercial|\bby-nc\b|\bnc-|no derivative|\bby-nd\b/i;

/**
 * Reads an Internet Archive item. Its licence is the uploader's declaration, and the Archive's terms
 * leave trusting it to the reader, so an item whose own text contradicts the field is refused.
 * @param item Response of the metadata API
 * @returns One result per original audio file
 */
export function parseInternetArchive(item: IaItem): Parsed[] {
  const {metadata} = item;
  const verdict = classifyLicence(metadata.licenseurl ?? '');

  if (!verdict.ok) {
    return [verdict];
  }

  if (conflict.test(`${joined(metadata.description)} ${joined(metadata.rights)}`)) {
    return [{ok: false, reason: 'item text contradicts its licence field'}];
  }

  const url = `https://archive.org/details/${metadata.identifier}`;
  const subject = joined(metadata.subject);
  const originals = item.files.filter(file => file.source === 'original' && /\.(mp3|flac|ogg|wav|aiff?)$/i.test(file.name));
  // A WAV upload gets its own MP3 from the Archive: the same recording at a tenth of the bytes
  const smallest = (file: IaFile) => (/\.(wav|aiff?)$/i.test(file.name)
    ? item.files.find(other => other.source === 'derivative' && other.original === file.name && /\.mp3$/i.test(other.name)) ?? file
    : file);

  if (originals.length === 0) {
    return [{ok: false, reason: 'no original audio file'}];
  }

  return originals.map((file): Parsed => {
    const artist = (file.artist ?? file.creator ?? joined(metadata.creator)).trim();
    const artistKey = artistKeyOf(artist);

    if (!artistKey) {
      return {ok: false, reason: 'no artist'};
    }

    const title = file.title ?? file.name;
    const hint = Number(file.bpm);
    const path = smallest(file).name.split('/').map(part => encodeURIComponent(part)).join('/');

    return {
      ok: true,
      candidate: {
        id: `ia-${metadata.identifier}-${file.name.replace(/[^\w.-]+/g, '_')}`,
        source: 'internet-archive',
        url,
        audio: {url: `https://archive.org/download/${metadata.identifier}/${path}`},
        artist,
        artistKey,
        title,
        licence: verdict.spdx,
        licenceClass: verdict.licenceClass,
        licenceEvidence: `Internet Archive metadata API, item ${metadata.identifier}, licenseurl ${metadata.licenseurl ?? ''}`,
        attribution: attribution(title, artist, verdict.spdx, url),
        genre: subject,
        genreFamily: genreFamilyOf(subject),
        hintBpm: Number.isFinite(hint) && hint > 0 ? hint : null,
        statedSeconds: secondsOf(file.length ?? ''),
        },
    };
  });
}

/**
 * @param text Seconds, or `mm:ss`, or `hh:mm:ss`, as hosts state a length
 * @returns Seconds, or null when the text is not a length
 */
export function secondsOf(text: string): number | null {
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(text.trim())) {
    return null;
  }

  return text.trim().split(':').reduce((total, part) => (total * 60) + Number(part), 0);
}

/** Under a minute is a sketch or a fragment, and over this is a set: it holds many tempos, not one */
export const lengthRange = {shortest: 60, longest: 900};

/**
 * Keeps what can hold one tempo, and at most a fair share per artist: one prolific artist adds
 * little, and the card asks for many. Which tracks stay is a hash, so it cannot follow a score.
 * @param candidates All candidates
 * @param seed Fixed seed
 * @param perArtist Most tracks per artist
 * @returns Kept candidates, and how many fell out, by reason
 */
export function narrow(
  candidates: readonly Candidate[],
  seed: string,
  perArtist: number,
): {readonly kept: Candidate[]; readonly dropped: Readonly<Record<string, number>>} {
  const dropped = {'wrong length': 0, 'over the per-artist share': 0};
  const taken = new Map<string, number>();
  const kept: Candidate[] = [];
  const shuffled = [...candidates].sort((a, b) => fnv1a(`${seed}:${a.id}`) - fnv1a(`${seed}:${b.id}`) || (a.id < b.id ? -1 : 1));

  for (const candidate of shuffled) {
    const seconds = candidate.statedSeconds;
    const count = taken.get(candidate.artistKey) ?? 0;

    if (seconds !== null && (seconds < lengthRange.shortest || seconds > lengthRange.longest)) {
      dropped['wrong length'] += 1;
    } else if (count >= perArtist) {
      dropped['over the per-artist share'] += 1;
    } else {
      taken.set(candidate.artistKey, count + 1);
      kept.push(candidate);
    }
  }

  return {kept, dropped};
}

/**
 * A CSV parser, as FMA's fields hold quotes, commas and newlines. Twenty lines do not earn a package.
 * Fields are slices of the text, as building them a character at a time took 3 GB on raw_tracks.csv.
 * @param text The file
 * @returns Rows of fields
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let at = 0;

  while (at < text.length) {
    let field: string;

    if (text[at] === '"') {
      let end = text.indexOf('"', at + 1);

      while (end !== -1 && text[end + 1] === '"') {
        end = text.indexOf('"', end + 2);
      }

      end = end === -1 ? text.length : end;
      field = text.slice(at + 1, end).replaceAll('""', '"');
      at = end + 1;
    } else {
      const comma = text.indexOf(',', at);
      const newline = text.indexOf('\n', at);
      const end = Math.min(comma === -1 ? text.length : comma, newline === -1 ? text.length : newline);

      field = text.slice(at, end);
      at = end;
    }

    row.push(field.endsWith('\r') && text[at] !== ',' ? field.slice(0, -1) : field);

    if (text[at] === '\r') {
      at += 1;
    }

    if (text[at] === '\n' || at >= text.length) {
      rows.push(row);
      row = [];
    }

    at += 1;
  }

  return rows;
}

/**
 * The tempo column of FMA's echonest.csv, whose header takes three rows. It is one old detector's
 * opinion on a subset of the tracks, and it stays a hint.
 * @param rows Parsed file
 * @returns Tempo by track id
 * @throws {Error} When the header is not the one this reads
 */
export function echonestTempos(rows: readonly string[][]): ReadonlyMap<string, number> {
  const column = rows[2]?.indexOf('tempo') ?? -1;

  if (column < 0 || rows[1][column] !== 'audio_features') {
    throw new Error('echonest.csv has changed');
  }

  return new Map(rows.slice(4).flatMap((row): Array<[string, number]> => {
    const tempo = Number(row[column]);

    return Number.isFinite(tempo) && tempo > 0 ? [[row[0], tempo]] : [];
  }));
}
