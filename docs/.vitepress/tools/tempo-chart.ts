// The tempo chart's rows (RBA-209): the Italian tempo terms and common genre tempos, each range
// with the source that gives it. Pure data and two pure helpers, so node --test reads it as it is
// (scripts/tempo-chart.test.ts) and rba-web can render the same rows when the page moves.
//
// The ranges are compiled from the sources below, read on 2026-11-15, never copied from one
// table: each row shows what each source says, side by side, so a reader sees where they part.
// `play` is the tempo a row's links open. It sits inside the ranges most sources share
// (the test holds it to at least half of them), which is the rule the page states.

import { MAX_BPM, MIN_BPM } from './tempo.ts'

export type SourceId = 'wikipedia' | 'dolmetsch' | 'lumen' | 'izotope'
  | 'wiki-house' | 'wiki-techno' | 'wiki-trance' | 'wiki-garage' | 'wiki-dubstep'
  | 'wiki-trap' | 'wiki-dnb' | 'wiki-hardstyle' | 'wiki-downtempo'

export type Source = {
  /** The short name a table cell shows. */
  readonly short: string
  /** The full reference the sources list prints. */
  readonly title: string
  readonly publisher: string
  readonly url: string
}

export const READ_ON = '2026-11-15'

const wiki = (article: string, path: string): Source => ({
  short: 'Wikipedia',
  title: `"${article}"`,
  publisher: 'Wikipedia',
  url: `https://en.wikipedia.org/wiki/${path}`,
})

export const SOURCES: Readonly<Record<SourceId, Source>> = {
  wikipedia: { short: 'Wikipedia', title: '"Tempo", list of basic tempo markings', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Tempo' },
  dolmetsch: { short: 'Dolmetsch', title: 'Music Theory Online: Tempo, table of tempo markings', publisher: 'Brian Blood, Dolmetsch Online', url: 'https://www.dolmetsch.com/musictheory5.htm' },
  lumen: { short: 'Lumen', title: 'Music Appreciation 1: Tempo Markings and Changes', publisher: 'Lumen Learning (SUNY)', url: 'https://courses.lumenlearning.com/suny-musicappreciationtheory/?p=325' },
  izotope: { short: 'iZotope', title: 'Using different tempos to make beats for different genres', publisher: 'Nick Messitte, iZotope, 2021', url: 'https://www.izotope.com/en/learn/using-different-tempos-to-make-beats-for-different-genres' },
  'wiki-house': wiki('House music', 'House_music'),
  'wiki-techno': wiki('Techno', 'Techno'),
  'wiki-trance': wiki('Trance music', 'Trance_music'),
  'wiki-garage': wiki('UK garage', 'UK_garage'),
  'wiki-dubstep': wiki('Dubstep', 'Dubstep'),
  'wiki-trap': wiki('Trap music', 'Trap_music'),
  'wiki-dnb': wiki('Drum and bass', 'Drum_and_bass'),
  'wiki-hardstyle': wiki('Hardstyle', 'Hardstyle'),
  'wiki-downtempo': wiki('Downtempo', 'Downtempo'),
}

/** One source's figure. A missing bound is open: "24 and under" has no `min`. */
export type Range = {
  readonly source: SourceId
  readonly min?: number
  readonly max?: number
}

export type ChartRow = {
  /** Stable id, sent with the row's clicks: never rename one, a report reads it. */
  readonly id: string
  readonly name: string
  readonly meaning: string
  readonly ranges: readonly Range[]
  readonly play: number
  /** The tempo the row is felt at in half time, where the genre is known for it. */
  readonly half?: number
}

export const ITALIAN_TERMS: readonly ChartRow[] = [
  { id: 'larghissimo', name: 'Larghissimo', meaning: 'As slowly as possible', play: 22, ranges: [
    { source: 'wikipedia', max: 24 }, { source: 'dolmetsch', max: 40 }] },
  { id: 'grave', name: 'Grave', meaning: 'Very slow and solemn', play: 32, ranges: [
    { source: 'wikipedia', min: 24, max: 40 }, { source: 'dolmetsch', max: 40 }, { source: 'lumen', min: 20, max: 40 }] },
  { id: 'largo', name: 'Largo', meaning: 'Broadly, very slow', play: 48, ranges: [
    { source: 'wikipedia', min: 40, max: 66 }, { source: 'dolmetsch', min: 42, max: 66 }, { source: 'lumen', min: 45, max: 50 }] },
  { id: 'lento', name: 'Lento', meaning: 'Slowly', play: 56, ranges: [
    { source: 'wikipedia', min: 40, max: 60 }, { source: 'dolmetsch', min: 52, max: 108 }, { source: 'lumen', min: 40, max: 45 }] },
  { id: 'larghetto', name: 'Larghetto', meaning: 'Rather broadly, a little less slow than largo', play: 61, ranges: [
    { source: 'wikipedia', min: 44, max: 66 }, { source: 'dolmetsch', min: 60, max: 66 }, { source: 'lumen', min: 50, max: 55 }] },
  { id: 'adagio', name: 'Adagio', meaning: 'Slow, at ease', play: 62, ranges: [
    { source: 'wikipedia', min: 44, max: 66 }, { source: 'dolmetsch', min: 58, max: 97 }, { source: 'lumen', min: 55, max: 65 }] },
  { id: 'adagietto', name: 'Adagietto', meaning: 'A little faster than adagio', play: 63, ranges: [
    { source: 'wikipedia', min: 46, max: 80 }] },
  { id: 'andante', name: 'Andante', meaning: 'At a walking pace', play: 75, ranges: [
    { source: 'wikipedia', min: 56, max: 108 }, { source: 'dolmetsch', min: 56, max: 88 }, { source: 'lumen', min: 73, max: 77 }] },
  { id: 'andantino', name: 'Andantino', meaning: 'A little faster than andante, though some read it as a little slower', play: 94, ranges: [
    { source: 'wikipedia', min: 80, max: 108 }] },
  { id: 'moderato', name: 'Moderato', meaning: 'At a moderate speed', play: 114, ranges: [
    { source: 'wikipedia', min: 108, max: 120 }, { source: 'dolmetsch', min: 66, max: 126 }, { source: 'lumen', min: 86, max: 97 }] },
  { id: 'allegretto', name: 'Allegretto', meaning: 'Moderately fast, not as fast as allegro', play: 116, ranges: [
    { source: 'wikipedia', min: 112, max: 120 }] },
  { id: 'allegro', name: 'Allegro', meaning: 'Fast and bright', play: 126, ranges: [
    { source: 'wikipedia', min: 120, max: 156 }, { source: 'dolmetsch', min: 84, max: 144 }, { source: 'lumen', min: 109, max: 132 }] },
  { id: 'vivace', name: 'Vivace', meaning: 'Lively and fast', play: 140, ranges: [
    { source: 'wikipedia', min: 156, max: 176 }, { source: 'dolmetsch', min: 140, max: 140 }, { source: 'lumen', min: 132, max: 140 }] },
  { id: 'presto', name: 'Presto', meaning: 'Very fast', play: 172, ranges: [
    { source: 'wikipedia', min: 168, max: 200 }, { source: 'dolmetsch', min: 100, max: 152 }, { source: 'lumen', min: 168, max: 177 }] },
  { id: 'prestissimo', name: 'Prestissimo', meaning: 'As fast as possible', play: 208, ranges: [
    { source: 'wikipedia', min: 200 }] },
]

export const GENRE_TEMPOS: readonly ChartRow[] = [
  { id: 'hip-hop', name: 'Hip-hop', meaning: 'Boom bap and classic hip-hop beats', play: 90, ranges: [
    { source: 'izotope', min: 85, max: 95 }] },
  { id: 'downtempo', name: 'Downtempo', meaning: 'Slow electronic and chill-out', play: 90, ranges: [
    { source: 'wiki-downtempo', min: 90, max: 90 }] },
  { id: 'house', name: 'House', meaning: 'Four on the floor, a kick on every beat', play: 124, ranges: [
    { source: 'wiki-house', min: 115, max: 130 }, { source: 'izotope', min: 115, max: 130 }] },
  { id: 'techno', name: 'Techno', meaning: 'Driving, repetitive four on the floor', play: 125, ranges: [
    { source: 'wiki-techno', min: 120, max: 150 }, { source: 'izotope', min: 120, max: 125 }] },
  { id: 'uk-garage', name: 'UK garage', meaning: 'Shuffled, skippy drums', play: 132, ranges: [
    { source: 'wiki-garage', min: 130, max: 138 }] },
  { id: 'trance', name: 'Trance', meaning: 'Long builds and melodic leads', play: 138, ranges: [
    { source: 'wiki-trance', min: 120, max: 150 }] },
  { id: 'dubstep', name: 'Dubstep', meaning: 'Heavy bass, a snare on beat 3', play: 140, half: 70, ranges: [
    { source: 'wiki-dubstep', min: 132, max: 142 }, { source: 'izotope', min: 140, max: 140 }] },
  { id: 'trap', name: 'Trap', meaning: 'Rolling hi-hats over a half-time beat', play: 140, half: 70, ranges: [
    { source: 'wiki-trap', min: 100, max: 176 }] },
  { id: 'hardstyle', name: 'Hardstyle', meaning: 'Distorted kicks, hard dance', play: 150, ranges: [
    { source: 'wiki-hardstyle', min: 150, max: 160 }] },
  { id: 'drum-and-bass', name: 'Drum and bass', meaning: 'Fast breakbeats and deep bass', play: 174, half: 87, ranges: [
    { source: 'wiki-dnb', min: 165, max: 185 }, { source: 'izotope', min: 174, max: 174 }] },
]

/** Every row id, for the analytics catalogue's `chart_row` values. */
export const CHART_ROW_IDS: readonly string[] = [...ITALIAN_TERMS, ...GENRE_TEMPOS].map((row) => row.id)

/** "40–66", "24 and under", "200 and over" or "140". */
export function formatRange(range: Range): string {
  const { min, max } = range
  if (min === undefined && max !== undefined) return `${max} and under`
  if (max === undefined && min !== undefined) return `${min} and over`
  if (min === max) return `${min}`
  return `${min}–${max}`
}

/** True when the tempo falls inside the source's range, open bounds reaching the metronome's limits. */
export function inRange(range: Range, bpm: number): boolean {
  return bpm >= (range.min ?? MIN_BPM) && bpm <= (range.max ?? MAX_BPM)
}

/** The two tools a row opens, each set to the tempo through the `?bpm=` they read. */
export const CHART_TOOLS = [
  { tool: 'metronome', label: 'Play' },
  { tool: 'bpm-to-ms', label: 'Delay times' },
] as const

export type ChartTool = (typeof CHART_TOOLS)[number]['tool']

export const chartLink = (tool: ChartTool, bpm: number): string => `/${tool}?bpm=${bpm}`
