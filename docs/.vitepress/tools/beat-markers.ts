// Beat markers for video editors (RBA-127): a marker every beat at the detected tempo, written
// as CSV, FCPXML (Final Cut Pro), a CMX 3600 EDL with DaVinci Resolve's marker notes, or a
// Final Cut Pro 7 XML sequence (Premiere Pro). Everything is built in the browser.
//
// Pure and import-free so `npm test` runs it with plain `node --test` (scripts/beat-markers.test.ts).
//
// Specs:
// - FCPXML: https://developer.apple.com/documentation/professional-video-applications/fcpxml-reference
//   Times are rational seconds ("1001/24000s"), and every time must fall on a frame boundary of the
//   sequence's frameDuration, so markers are written as whole frames times frameDuration.
// - Final Cut Pro 7 XML (xmeml), which Premiere Pro imports:
//   https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/
//   A <rate> is a whole <timebase> plus <ntsc>TRUE</ntsc> for the 1000/1001 rates; marker <in> and
//   <out> count frames, and <out>-1</out> means no duration.
// - CMX 3600 EDL: https://xmil.biz/EDL-X/CMX3600.pdf . Resolve reads a marker from the note line
//   under each event (" |C:<color> |M:<name> |D:<frames>"), the form it writes when it exports
//   timeline markers to an EDL (DaVinci Resolve manual, "Exporting and importing timeline markers").
// - Drop-frame timecode: SMPTE ST 12-1. At 29.97 the frame numbers 00 and 01 are skipped at the
//   start of every minute except each tenth; at 59.94 the numbers 00 to 03.
// - CSV: RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 (CRLF line ends, header row).
// - XML text and attribute escaping: https://www.w3.org/TR/xml/#syntax , characters allowed in
//   XML 1.0: https://www.w3.org/TR/xml/#charsets

/** A frame rate as an exact fraction, so NTSC rates are 24000/1001 and never 23.976. */
export interface ExportRate {
  /** How editors name the rate, the same labels as FRAME_RATES in frames.ts. */
  label: string
  numerator: number
  denominator: number
  /** Frames per timecode second: the rate rounded, 30 for 29.97. */
  timebase: number
  /** Whether drop-frame timecode exists at this rate (29.97 and 59.94 only). */
  canDropFrame: boolean
  /** Final Cut Pro's name for a 1080p format at this rate. */
  fcpFormatName: string
}

export const EXPORT_RATES: readonly ExportRate[] = [
  { label: '23.976', numerator: 24_000, denominator: 1001, timebase: 24, canDropFrame: false, fcpFormatName: 'FFVideoFormat1080p2398' },
  { label: '24', numerator: 24, denominator: 1, timebase: 24, canDropFrame: false, fcpFormatName: 'FFVideoFormat1080p24' },
  { label: '25', numerator: 25, denominator: 1, timebase: 25, canDropFrame: false, fcpFormatName: 'FFVideoFormat1080p25' },
  { label: '29.97', numerator: 30_000, denominator: 1001, timebase: 30, canDropFrame: true, fcpFormatName: 'FFVideoFormat1080p2997' },
  { label: '30', numerator: 30, denominator: 1, timebase: 30, canDropFrame: false, fcpFormatName: 'FFVideoFormat1080p30' },
  { label: '50', numerator: 50, denominator: 1, timebase: 50, canDropFrame: false, fcpFormatName: 'FFVideoFormat1080p50' },
  { label: '59.94', numerator: 60_000, denominator: 1001, timebase: 60, canDropFrame: true, fcpFormatName: 'FFVideoFormat1080p5994' },
  { label: '60', numerator: 60, denominator: 1, timebase: 60, canDropFrame: false, fcpFormatName: 'FFVideoFormat1080p60' },
]

export type MarkerFormat = 'csv' | 'fcpxml' | 'edl' | 'fcp7xml'

export const MARKER_FORMATS: readonly { id: MarkerFormat; label: string; extension: string; mime: string }[] = [
  { id: 'fcp7xml', label: 'XML for Premiere Pro', extension: 'xml', mime: 'application/xml' },
  { id: 'edl', label: 'EDL for DaVinci Resolve', extension: 'edl', mime: 'text/plain' },
  { id: 'fcpxml', label: 'FCPXML for Final Cut Pro', extension: 'fcpxml', mime: 'application/xml' },
  { id: 'csv', label: 'CSV for a spreadsheet', extension: 'csv', mime: 'text/csv' },
]

/** No marker file grows past this: 4 beats a second for an hour and a half. */
export const MAX_MARKERS = 20_000

export function fps(rate: ExportRate): number {
  return rate.numerator / rate.denominator
}

/** Beat times in seconds, every 60 / bpm from the first beat, up to the end of the audio. */
export function beatTimes(bpm: number, firstBeat: number, duration: number): number[] {
  if (!(bpm > 0) || !(firstBeat >= 0) || !(duration > firstBeat)) return []
  const period = 60 / bpm
  // Multiplying, not adding, so float error doesn't pile up over thousands of beats.
  const count = Math.min(MAX_MARKERS, Math.floor((duration - firstBeat) / period) + 1)
  return Array.from({ length: count }, (_, index) => firstBeat + index * period)
}

/** The frame a time falls on, rounded to the nearest frame of the exact rate. */
export function frameAt(seconds: number, rate: ExportRate): number {
  return Math.round((seconds * rate.numerator) / rate.denominator)
}

/** Frames dropped from the count at each minute boundary, except every tenth minute. */
function droppedPerMinute(rate: ExportRate): number {
  return rate.timebase === 30 ? 2 : 4
}

/** Timecode frames in one hour: the start of an editor timeline at 01:00:00:00. */
export function framesPerHour(rate: ExportRate, dropFrame: boolean): number {
  const nominal = rate.timebase * 3600
  return dropFrame && rate.canDropFrame ? nominal - droppedPerMinute(rate) * 54 : nominal
}

/**
 * The timecode of a frame count, "hh:mm:ss:ff", or "hh:mm:ss;ff" in drop-frame. Drop-frame skips
 * frame numbers, never frames, so the label stays in step with the clock at 29.97 and 59.94.
 */
export function timecode(frame: number, rate: ExportRate, dropFrame: boolean): string {
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError(`Invalid frame: ${frame}`)
  const base = rate.timebase
  let label = frame
  const isDrop = dropFrame && rate.canDropFrame
  if (isDrop) {
    const drop = droppedPerMinute(rate)
    const perMinute = base * 60 - drop
    const perTenMinutes = perMinute * 10 + drop
    const tens = Math.floor(frame / perTenMinutes)
    const rest = frame % perTenMinutes
    label += drop * 9 * tens + (rest > drop ? drop * Math.floor((rest - drop) / perMinute) : 0)
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  const ff = label % base
  const ss = Math.floor(label / base) % 60
  const mm = Math.floor(label / (base * 60)) % 60
  const hh = Math.floor(label / (base * 3600)) % 24
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${isDrop ? ';' : ':'}${pad(ff)}`
}

/** A time in FCPXML's rational seconds, on a frame boundary of the rate. */
export function rationalTime(frames: number, rate: ExportRate): string {
  return frames === 0 ? '0s' : `${frames * rate.denominator}/${rate.numerator}s`
}

/** XML 1.0's Char production: what a document may hold at all, even escaped. */
function isXmlChar(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD
    || (codePoint >= 0x20 && codePoint <= 0xD7FF)
    || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
    || (codePoint >= 0x1_0000 && codePoint <= 0x10_FFFF)
}

function isControl(codePoint: number): boolean {
  return codePoint < 0x20 || codePoint === 0x7F
}

/** Each code point of the text through `map`. A lone surrogate comes through on its own. */
function mapCodePoints(text: string, map: (character: string, codePoint: number) => string): string {
  let out = ''
  for (const character of text) out += map(character, character.codePointAt(0)!)
  return out
}

/**
 * Text safe inside an XML element or a double- or single-quoted attribute. A file name can carry
 * characters XML 1.0 refuses even escaped (most C0 controls, lone surrogates): they are dropped.
 */
export function escapeXml(text: string): string {
  return mapCodePoints(text, (character, codePoint) => (isXmlChar(codePoint) ? character : ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface MarkerExport {
  /** The analysed file's name, used as the sequence or project name and in the download's name. */
  name: string
  bpm: number
  /** Seconds of the first marker. */
  firstBeat: number
  /** Seconds of audio. */
  duration: number
  rate: ExportRate
  /** Drop-frame timecode, honoured only where the rate has it. */
  dropFrame: boolean
}

interface Marker {
  index: number
  seconds: number
  frame: number
}

function markersOf(input: MarkerExport): Marker[] {
  return beatTimes(input.bpm, input.firstBeat, input.duration)
    .map((seconds, index) => ({ index: index + 1, seconds, frame: frameAt(seconds, input.rate) }))
}

function title(input: MarkerExport): string {
  return `${input.name} beat markers`
}

function durationFrames(input: MarkerExport): number {
  return Math.max(1, Math.ceil((input.duration * input.rate.numerator) / input.rate.denominator))
}

export function toCsv(input: MarkerExport): string {
  const isDrop = input.dropFrame && input.rate.canDropFrame
  const rows = markersOf(input).map((marker) =>
    [`Beat ${marker.index}`, marker.seconds.toFixed(3), marker.frame, timecode(marker.frame, input.rate, isDrop)].join(','))
  return ['marker,seconds,frame,timecode', ...rows].map((line) => `${line}\r\n`).join('')
}

export function toFcpxml(input: MarkerExport): string {
  const { rate } = input
  const name = escapeXml(title(input))
  const duration = rationalTime(durationFrames(input), rate)
  const oneFrame = rationalTime(1, rate)
  const tcFormat = input.dropFrame && rate.canDropFrame ? 'DF' : 'NDF'
  const markers = markersOf(input).map((marker) =>
    `              <marker start="${rationalTime(marker.frame, rate)}" duration="${oneFrame}" value="Beat ${marker.index}"/>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.8">',
    '  <resources>',
    `    <format id="r1" name="${rate.fcpFormatName}" frameDuration="${oneFrame}" width="1920" height="1080"/>`,
    '  </resources>',
    '  <library>',
    `    <event name="${name}">`,
    `      <project name="${name}">`,
    `        <sequence format="r1" duration="${duration}" tcStart="0s" tcFormat="${tcFormat}">`,
    '          <spine>',
    `            <gap name="Beat markers" offset="0s" duration="${duration}" start="0s">`,
    ...markers,
    '            </gap>',
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    '',
  ].join('\n')
}

/** EDL titles are one plain line: no control characters, at most 70 characters. */
function edlTitle(text: string): string {
  return mapCodePoints(text, (character, codePoint) => (isControl(codePoint) ? ' ' : character)).slice(0, 70)
}

/**
 * Markers on a timeline that starts at 01:00:00:00, Resolve's default start. Each marker is a
 * one-frame event whose record in is the marker's place, with Resolve's note line under it.
 */
export function toEdl(input: MarkerExport): string {
  const { rate } = input
  const isDrop = input.dropFrame && rate.canDropFrame
  const start = framesPerHour(rate, isDrop)
  const markers = markersOf(input)
  const width = Math.max(3, String(markers.length).length)
  const events = markers.flatMap((marker) => {
    const tcIn = timecode(start + marker.frame, rate, isDrop)
    const tcOut = timecode(start + marker.frame + 1, rate, isDrop)
    const number = String(marker.index).padStart(width, '0')
    return [
      `${number}  001      V     C        ${tcIn} ${tcOut} ${tcIn} ${tcOut}`,
      ` |C:ResolveColorBlue |M:Beat ${marker.index} |D:1`,
      '',
    ]
  })
  return [
    `TITLE: ${edlTitle(title(input))}`,
    `FCM: ${isDrop ? 'DROP FRAME' : 'NON-DROP FRAME'}`,
    '',
    ...events,
  ].join('\n')
}

/** A Final Cut Pro 7 XML sequence holding the markers, with empty video and audio tracks. */
export function toFcp7Xml(input: MarkerExport): string {
  const { rate } = input
  const name = escapeXml(title(input))
  const ntsc = rate.denominator === 1001 ? 'TRUE' : 'FALSE'
  const rateXml = `<rate><timebase>${rate.timebase}</timebase><ntsc>${ntsc}</ntsc></rate>`
  const displayFormat = input.dropFrame && rate.canDropFrame ? 'DF' : 'NDF'
  const markers = markersOf(input).map((marker) =>
    `    <marker><name>Beat ${marker.index}</name><comment/><in>${marker.frame}</in><out>-1</out></marker>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE xmeml>',
    '<xmeml version="4">',
    '  <sequence id="beat-markers">',
    `    <name>${name}</name>`,
    `    <duration>${durationFrames(input)}</duration>`,
    `    ${rateXml}`,
    `    <timecode>${rateXml}<string>${timecode(0, rate, displayFormat === 'DF')}</string><frame>0</frame><displayformat>${displayFormat}</displayformat></timecode>`,
    '    <media>',
    `      <video><format><samplecharacteristics>${rateXml}<width>1920</width><height>1080</height></samplecharacteristics></format><track/></video>`,
    '      <audio><track/></audio>',
    '    </media>',
    ...markers,
    '  </sequence>',
    '</xmeml>',
    '',
  ].join('\n')
}

const WRITERS: Record<MarkerFormat, (input: MarkerExport) => string> = {
  csv: toCsv,
  fcpxml: toFcpxml,
  edl: toEdl,
  fcp7xml: toFcp7Xml,
}

/** A download name from the analysed file's: its stem, without characters file systems refuse. */
export function downloadName(fileName: string, format: MarkerFormat, rate: ExportRate): string {
  const dot = fileName.lastIndexOf('.')
  const stem = mapCodePoints(dot > 0 ? fileName.slice(0, dot) : fileName,
    (character, codePoint) => (isControl(codePoint) ? '_' : character))
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim()
    .slice(0, 80) || 'audio'
  const extension = MARKER_FORMATS.find((entry) => entry.id === format)!.extension
  return `${stem} beat markers ${rate.label} fps.${extension}`
}

export function markerFile(format: MarkerFormat, input: MarkerExport): { name: string; mime: string; content: string } {
  const entry = MARKER_FORMATS.find((candidate) => candidate.id === format)
  if (!entry) throw new RangeError(`Unknown marker format: ${String(format)}`)
  return { name: downloadName(input.name, format, input.rate), mime: entry.mime, content: WRITERS[format](input) }
}
