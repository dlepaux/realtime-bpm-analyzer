// Run with `npm test` (node --test, Node's own type stripping; no test framework).
// The spec each format follows is cited at the top of .vitepress/tools/beat-markers.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FRAME_RATES } from '../.vitepress/tools/frames.ts'
import {
  EXPORT_RATES,
  MAX_MARKERS,
  beatTimes,
  downloadName,
  escapeXml,
  fps,
  frameAt,
  framesPerHour,
  markerFile,
  rationalTime,
  timecode,
  toCsv,
  toEdl,
  toFcp7Xml,
  toFcpxml,
  type ExportRate,
  type MarkerExport,
} from '../.vitepress/tools/beat-markers.ts'

const rate = (label: string): ExportRate => {
  const found = EXPORT_RATES.find((candidate) => candidate.label === label)
  assert.ok(found, `no rate ${label}`)
  return found
}

const input = (overrides: Partial<MarkerExport> = {}): MarkerExport => ({
  name: 'song.mp3',
  bpm: 120,
  firstBeat: 0.5,
  duration: 2,
  rate: rate('25'),
  dropFrame: false,
  ...overrides,
})

test('EXPORT_RATES: the /bpm-to-frames rates, as exact fractions', () => {
  assert.deepEqual(EXPORT_RATES.map((entry) => entry.label), FRAME_RATES.map((entry) => entry.label))
  for (const [index, entry] of EXPORT_RATES.entries()) assert.equal(fps(entry), FRAME_RATES[index]!.fps)
  assert.equal(rate('23.976').denominator, 1001)
  assert.equal(rate('29.97').numerator, 30_000)
  assert.equal(rate('59.94').numerator, 60_000)
  assert.deepEqual(EXPORT_RATES.filter((entry) => entry.canDropFrame).map((entry) => entry.label), ['29.97', '59.94'])
})

test('beatTimes: every 60 / bpm from the first beat to the end of the audio', () => {
  assert.deepEqual(beatTimes(120, 0.5, 2), [0.5, 1, 1.5, 2])
  assert.deepEqual(beatTimes(120, 0.5, 1.99), [0.5, 1, 1.5])
  assert.deepEqual(beatTimes(0, 0, 10), [])
  assert.deepEqual(beatTimes(120, 3, 2), [])
  assert.deepEqual(beatTimes(Number.NaN, 0, 2), [])
  assert.equal(beatTimes(240, 0, 24 * 3600).length, MAX_MARKERS)
})

test('beatTimes: no float drift after thousands of beats', () => {
  const times = beatTimes(128, 0.25, 3600)
  const last = times.at(-1)!
  assert.equal(last, 0.25 + (times.length - 1) * (60 / 128))
})

test('frameAt: rounds to the nearest frame of the exact rate', () => {
  assert.equal(frameAt(1, rate('24')), 24)
  assert.equal(frameAt(1.001, rate('23.976')), 24)
  // 60 s at 29.97 is 1798.2 frames.
  assert.equal(frameAt(60, rate('29.97')), 1798)
  assert.equal(frameAt(0.5, rate('25')), 13)
})

test('timecode: non-drop at every rate', () => {
  const cases: [string, number, string][] = [
    ['23.976', 0, '00:00:00:00'],
    ['23.976', 23, '00:00:00:23'],
    ['23.976', 24, '00:00:01:00'],
    ['24', 24 * 3600, '01:00:00:00'],
    ['25', 25 * 61 + 7, '00:01:01:07'],
    ['29.97', 1800, '00:01:00:00'],
    ['30', 30 * 3599 + 29, '00:59:59:29'],
    ['50', 50 * 600, '00:10:00:00'],
    ['59.94', 59, '00:00:00:59'],
    ['60', 60 * 3600 * 24, '00:00:00:00'],
  ]
  for (const [label, frame, expected] of cases) {
    assert.equal(timecode(frame, rate(label), false), expected, `${label} frame ${frame}`)
  }
})

test('timecode: drop-frame at 29.97 skips ;00 and ;01 each minute but every tenth', () => {
  const df = rate('29.97')
  assert.equal(timecode(1799, df, true), '00:00:59;29')
  assert.equal(timecode(1800, df, true), '00:01:00;02')
  assert.equal(timecode(3598, df, true), '00:02:00;02')
  assert.equal(timecode(17_981, df, true), '00:09:59;29')
  assert.equal(timecode(17_982, df, true), '00:10:00;00')
  assert.equal(timecode(17_982 + 1800, df, true), '00:11:00;02')
  assert.equal(timecode(107_892, df, true), '01:00:00;00')
})

test('timecode: drop-frame at 59.94 skips ;00 to ;03', () => {
  const df = rate('59.94')
  assert.equal(timecode(3599, df, true), '00:00:59;59')
  assert.equal(timecode(3600, df, true), '00:01:00;04')
  assert.equal(timecode(35_964, df, true), '00:10:00;00')
  assert.equal(timecode(215_784, df, true), '01:00:00;00')
})

test('timecode: drop-frame is ignored where the rate has none, and bad frames are refused', () => {
  assert.equal(timecode(1800, rate('30'), true), '00:01:00:00')
  assert.throws(() => timecode(-1, rate('25'), false), RangeError)
  assert.throws(() => timecode(1.5, rate('25'), false), RangeError)
})

test('drop-frame keeps the label on the clock: an hour of 29.97 video reads 01:00:00;00', () => {
  const df = rate('29.97')
  assert.equal(timecode(frameAt(3600, df), df, true), '01:00:00;00')
  // Non-drop at 29.97 falls behind the clock by 3.6 s an hour.
  assert.equal(timecode(frameAt(3600, df), df, false), '00:59:56:12')
})

test('framesPerHour: the 01:00:00:00 timeline start in frames', () => {
  assert.equal(framesPerHour(rate('25'), false), 90_000)
  assert.equal(framesPerHour(rate('29.97'), false), 108_000)
  assert.equal(framesPerHour(rate('29.97'), true), 107_892)
  assert.equal(framesPerHour(rate('59.94'), true), 215_784)
  assert.equal(framesPerHour(rate('24'), true), 86_400)
})

test('rationalTime: whole frames of frameDuration, as FCPXML wants', () => {
  assert.equal(rationalTime(0, rate('24')), '0s')
  assert.equal(rationalTime(1, rate('23.976')), '1001/24000s')
  assert.equal(rationalTime(24, rate('23.976')), '24024/24000s')
  assert.equal(rationalTime(3, rate('25')), '3/25s')
  assert.equal(rationalTime(2, rate('59.94')), '2002/60000s')
})

test('escapeXml: the five XML entities, and characters XML 1.0 forbids are dropped', () => {
  assert.equal(escapeXml(`Tom & "Jerry" <live>'s.mp3`), 'Tom &amp; &quot;Jerry&quot; &lt;live&gt;&apos;s.mp3')
  assert.equal(escapeXml('a\u0000b\u0007c\u001Fd\tE\nF'), 'abcd\tE\nF')
  assert.equal(escapeXml('x\uD800y'), 'xy')
  assert.equal(escapeXml(`a${String.fromCharCode(0xFFFE)}b${String.fromCharCode(0xDC00)}c`), 'abc')
  assert.equal(escapeXml('Beyoncé 🎵.wav'), 'Beyoncé 🎵.wav')
  assert.equal(escapeXml('&amp;'), '&amp;amp;')
})

test('CSV: RFC 4180 with CRLF and a header, one row per beat', () => {
  assert.equal(toCsv(input()), [
    'marker,seconds,frame,timecode',
    'Beat 1,0.500,13,00:00:00:13',
    'Beat 2,1.000,25,00:00:01:00',
    'Beat 3,1.500,38,00:00:01:13',
    // 2.000 s is the audio's end, frame 50, so it sits on the last frame, 49.
    'Beat 4,2.000,49,00:00:01:24',
    '',
  ].join('\r\n'))
})

test('CSV: drop-frame timecode at 29.97', () => {
  // Drop-frame matches the clock at every tenth minute: 600 s is frame 17982, 00:10:00;00.
  const csv = toCsv(input({ bpm: 60, firstBeat: 600, duration: 601, rate: rate('29.97'), dropFrame: true }))
  assert.match(csv, /^Beat 1,600\.000,17982,00:10:00;00\r$/m)
})

test('FCPXML: a gap in a project holding one marker per beat, every time on a frame boundary', () => {
  const xml = toFcpxml(input({ rate: rate('23.976'), duration: 10, firstBeat: 0.37 }))
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1\.8">/)
  assert.match(xml, /<format id="r1" name="FFVideoFormat1080p2398" frameDuration="1001\/24000s"/)
  assert.match(xml, /tcFormat="NDF"/)
  const starts = [...xml.matchAll(/<marker start="(\d+)\/24000s" duration="1001\/24000s" value="Beat (\d+)"\/>/g)]
  assert.equal(starts.length, 20)
  for (const [, numerator] of starts) assert.equal(Number(numerator) % 1001, 0, `${numerator}/24000s is off the frame grid`)
  // 0.37 s at 24000/1001 is frame 8.87, so 9.
  assert.equal(starts[0]![1], String(9 * 1001))
  assert.match(xml, /<sequence format="r1" duration="240240\/24000s"/)
})

test('FCPXML: drop-frame display at 29.97, and the file name escaped in every name attribute', () => {
  const xml = toFcpxml(input({ name: 'A&B "live" <1>.mov', rate: rate('29.97'), dropFrame: true }))
  assert.match(xml, /tcFormat="DF"/)
  assert.equal([...xml.matchAll(/name="A&amp;B &quot;live&quot; &lt;1&gt;\.mov beat markers"/g)].length, 2)
  assert.ok(!xml.includes('"live"'))
})

test('EDL: CMX 3600 events on a 01:00:00:00 timeline with Resolve marker notes', () => {
  assert.equal(toEdl(input({ firstBeat: 0.5, duration: 1 })), [
    'TITLE: song.mp3 beat markers',
    'FCM: NON-DROP FRAME',
    '',
    '001  001      V     C        01:00:00:13 01:00:00:14 01:00:00:13 01:00:00:14',
    ' |C:ResolveColorBlue |M:Beat 1 |D:1',
    '',
    '002  001      V     C        01:00:00:24 01:00:01:00 01:00:00:24 01:00:01:00',
    ' |C:ResolveColorBlue |M:Beat 2 |D:1',
    '',
  ].join('\n'))
})

test('EDL: drop-frame at 29.97 and 59.94 says so and writes ; timecode', () => {
  for (const label of ['29.97', '59.94']) {
    const edl = toEdl(input({ firstBeat: 600, duration: 600.4, rate: rate(label), dropFrame: true }))
    assert.match(edl, /^FCM: DROP FRAME$/m)
    assert.match(edl, /^001 {2}001 {6}V {5}C {8}01:10:00;00 01:10:00;01 01:10:00;00 01:10:00;01$/m, label)
  }
  // Non-drop at 29.97 runs 18 frames behind the clock after ten minutes.
  const ndf = toEdl(input({ firstBeat: 600, duration: 600.4, rate: rate('29.97'), dropFrame: false }))
  assert.match(ndf, /^FCM: NON-DROP FRAME$/m)
  assert.match(ndf, / 01:09:59:12 /)
})

test('EDL: the title is one line, and event numbers widen past 999', () => {
  const edl = toEdl(input({ name: 'two\nlines\r.wav', bpm: 600, firstBeat: 0, duration: 120 }))
  assert.match(edl, /^TITLE: two lines \.wav beat markers$/m)
  assert.match(edl, /^0001 {2}001 /m)
  assert.match(edl, /^1201 {2}001 /m)
})

test('FCP7 XML: an xmeml sequence with frame-counted markers and an NTSC rate', () => {
  const xml = toFcp7Xml(input({ name: 'Tom & Jerry.mp4', rate: rate('29.97'), dropFrame: true, firstBeat: 1, duration: 1.5 }))
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE xmeml>\n<xmeml version="4">/)
  assert.match(xml, /<name>Tom &amp; Jerry\.mp4 beat markers<\/name>/)
  assert.match(xml, /<rate><timebase>30<\/timebase><ntsc>TRUE<\/ntsc><\/rate>/)
  assert.match(xml, /<string>00:00:00;00<\/string><frame>0<\/frame><displayformat>DF<\/displayformat>/)
  assert.match(xml, /<duration>45<\/duration>/)
  assert.match(xml, /<marker><name>Beat 1<\/name><comment\/><in>30<\/in><out>-1<\/out><\/marker>/)
  assert.match(xml, /<marker><name>Beat 2<\/name><comment\/><in>44<\/in><out>-1<\/out><\/marker>/)
  assert.equal([...xml.matchAll(/<marker>/g)].length, 2)
})

test('every format keeps the last marker inside the sequence, even a beat in its last half frame', () => {
  // 120 BPM from 0.5 s over 2 s at 25 fps: the sequence is 50 frames, and the beat at 2.0 s rounds
  // to frame 50, where the sequence ends. It moves back to 49.
  const exportInput = input()
  const fcpxml = toFcpxml(exportInput)
  const sequence = Number(/<sequence format="r1" duration="(\d+)\/25s"/.exec(fcpxml)?.[1])
  const fcpStarts = [...fcpxml.matchAll(/<marker start="(\d+)\/25s"/g)].map(([, frame]) => Number(frame))
  assert.equal(sequence, 50)
  assert.deepEqual(fcpStarts, [13, 25, 38, 49])
  const xmeml = toFcp7Xml(exportInput)
  const length = Number(/<duration>(\d+)<\/duration>/.exec(xmeml)?.[1])
  const ins = [...xmeml.matchAll(/<in>(\d+)<\/in>/g)].map(([, frame]) => Number(frame))
  assert.equal(length, 50)
  assert.ok(ins.every((frame) => frame < length), `${ins.join(',')} reach ${length}`)
  assert.equal(ins.at(-1), 49)
})

test('FCP7 XML: whole rates are not NTSC', () => {
  assert.match(toFcp7Xml(input({ rate: rate('25') })), /<timebase>25<\/timebase><ntsc>FALSE<\/ntsc>/)
  assert.match(toFcp7Xml(input({ rate: rate('23.976') })), /<timebase>24<\/timebase><ntsc>TRUE<\/ntsc>/)
})

test('downloadName: the stem, the format and the rate, without characters file systems refuse', () => {
  assert.equal(downloadName('song.mp3', 'edl', rate('25')), 'song beat markers 25 fps.edl')
  assert.equal(downloadName('a/b:c*?.final.wav', 'fcp7xml', rate('29.97')), 'a_b_c__.final beat markers 29.97 fps.xml')
  assert.equal(downloadName('.mp3', 'csv', rate('24')), '.mp3 beat markers 24 fps.csv')
  assert.equal(downloadName('???', 'fcpxml', rate('24')), '___ beat markers 24 fps.fcpxml')
  assert.equal(downloadName('   .wav', 'csv', rate('24')), 'audio beat markers 24 fps.csv')
  assert.equal(downloadName(`a${String.fromCharCode(1)}b.wav`, 'csv', rate('24')), 'a_b beat markers 24 fps.csv')
})

test('markerFile: name, type and content per format', () => {
  const file = markerFile('fcpxml', input())
  assert.equal(file.name, 'song beat markers 25 fps.fcpxml')
  assert.equal(file.mime, 'application/xml')
  assert.match(file.content, /<fcpxml/)
  assert.equal(markerFile('csv', input()).mime, 'text/csv')
  assert.throws(() => markerFile('mp4' as never, input()), RangeError)
})
