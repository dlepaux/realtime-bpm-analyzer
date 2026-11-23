// Run with `npm test` (node --test, Node's own type stripping; no test framework).
// The spec each format follows is cited at the top of .vitepress/tools/beat-markers.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FRAME_RATES } from '../.vitepress/tools/frames.ts'
import {
  EXPORT_RATES,
  EXPORT_TIMECODES,
  MARKER_FORMATS,
  MAX_MARKERS,
  beatMarkers,
  beatTimes,
  downloadName,
  escapeXml,
  fps,
  frameAt,
  framesPerHour,
  markerFile,
  rationalTime,
  timecode,
  timecodeChoice,
  timecodesFor,
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

test('beatTimes: every 60 / bpm from the first beat, up to but not at the end of the audio', () => {
  // The audio's end is not a beat: 2 s of audio holds no beat at 2.000 s.
  assert.deepEqual(beatTimes(120, 0.5, 2), [0.5, 1, 1.5])
  assert.deepEqual(beatTimes(120, 0.5, 2.01), [0.5, 1, 1.5, 2])
  assert.deepEqual(beatTimes(120, 0.5, 1.99), [0.5, 1, 1.5])
  assert.deepEqual(beatTimes(120, 0, 0.5), [0])
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
    // 2.000 s is the audio's end: no beat there, so no row.
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
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1\.10">/)
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

test('EDL: CMX 3600 events on a 01:00:00:00 timeline with Resolve marker notes, CR/LF, no FCM at 25 fps', () => {
  assert.equal(toEdl(input({ firstBeat: 0.5, duration: 1.1 })), [
    'TITLE: SONG MP3 BEAT MARKERS',
    '',
    '001  001      V     C        01:00:00:13 01:00:00:14 01:00:00:13 01:00:00:14',
    ' |C:ResolveColorBlue |M:Beat 1 |D:1',
    '',
    '002  001      V     C        01:00:01:00 01:00:01:01 01:00:01:00 01:00:01:01',
    ' |C:ResolveColorBlue |M:Beat 2 |D:1',
    '',
  ].map((line) => `${line}\r\n`).join(''))
})

test('EDL: an FCM line everywhere but the PAL rates, 25 and 50 fps', () => {
  for (const entry of EXPORT_TIMECODES) {
    const fcm = /^FCM: (.*)\r$/m.exec(toEdl(input({ rate: entry.rate, dropFrame: entry.dropFrame })))?.[1]
    const expected = ['25', '50'].includes(entry.rate.label) ? undefined : entry.dropFrame ? 'DROP FRAME' : 'NON-DROP FRAME'
    assert.equal(fcm, expected, entry.label)
  }
})

test('EDL: only CMX 3600 characters outside the Resolve notes, and every line ends CR/LF', () => {
  for (const entry of EXPORT_TIMECODES) {
    const edl = toEdl(input({ name: 'Café – mix (v2).wav', duration: 30, rate: entry.rate, dropFrame: entry.dropFrame }))
    assert.ok(edl.endsWith('\r\n'), entry.label)
    const lines = edl.slice(0, -2).split('\r\n')
    for (const line of lines) {
      assert.doesNotMatch(line, /[\r\n]/, entry.label)
      // Outside the set: the hyphen of NON-DROP FRAME, as the spec writes it (p. 16), and the ; of
      // drop-frame timecode (see beat-markers.ts).
      const allowed = entry.dropFrame ? /^[A-Z0-9:; /]*$/ : /^[A-Z0-9: /]*$/
      if (!line.startsWith(' |C:') && line !== 'FCM: NON-DROP FRAME') assert.match(line, allowed, `${entry.label}: ${line}`)
    }
  }
})

test('EDL: drop-frame at 29.97 and 59.94 says so in the FCM line, and with ; in the timecode for readers that skip FCM', () => {
  for (const label of ['29.97', '59.94']) {
    const edl = toEdl(input({ firstBeat: 600, duration: 600.4, rate: rate(label), dropFrame: true }))
    assert.match(edl, /^FCM: DROP FRAME\r$/m)
    assert.match(edl, /^001 {2}001 {6}V {5}C {8}01:10:00;00 01:10:00;01 01:10:00;00 01:10:00;01\r$/m, label)
  }
  // Non-drop at 29.97 runs 18 frames behind the clock after ten minutes.
  const ndf = toEdl(input({ firstBeat: 600, duration: 600.4, rate: rate('29.97'), dropFrame: false }))
  assert.match(ndf, /^FCM: NON-DROP FRAME\r$/m)
  assert.match(ndf, / 01:09:59:12 /)
})

test('EDL: the title is one line of capitals, digits and spaces, at most 70, and event numbers widen past 999', () => {
  const edl = toEdl(input({ name: 'two\nlines\r.wav', bpm: 600, firstBeat: 0, duration: 120.05 }))
  assert.match(edl, /^TITLE: TWO LINES WAV BEAT MARKERS\r$/m)
  assert.match(toEdl(input({ name: 'Café – mix (v2).wav' })), /^TITLE: CAFE MIX V2 WAV BEAT MARKERS\r$/m)
  assert.match(toEdl(input({ name: '日本.wav' })), /^TITLE: WAV BEAT MARKERS\r$/m)
  assert.match(toEdl(input({ name: 'x'.repeat(100) })), new RegExp(`^TITLE: ${'X'.repeat(70)}\r$`, 'm'))
  assert.match(edl, /^0001 {2}001 /m)
  assert.match(edl, /^1201 {2}001 /m)
})

test('FCP7 XML: an xmeml sequence with frame-counted markers and an NTSC rate', () => {
  const xml = toFcp7Xml(input({ name: 'Tom & Jerry.mp4', rate: rate('29.97'), dropFrame: true, firstBeat: 1, duration: 1.51 }))
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE xmeml>\n<xmeml version="4">/)
  assert.match(xml, /<name>Tom &amp; Jerry\.mp4 beat markers<\/name>/)
  assert.match(xml, /<rate><timebase>30<\/timebase><ntsc>TRUE<\/ntsc><\/rate>/)
  assert.match(xml, /<string>00:00:00;00<\/string><frame>0<\/frame><displayformat>DF<\/displayformat>/)
  assert.match(xml, /<duration>46<\/duration>/)
  assert.match(xml, /<marker><name>Beat 1<\/name><comment\/><in>30<\/in><out>-1<\/out><\/marker>/)
  assert.match(xml, /<marker><name>Beat 2<\/name><comment\/><in>45<\/in><out>-1<\/out><\/marker>/)
  assert.equal([...xml.matchAll(/<marker>/g)].length, 2)
})

test('every format keeps every marker inside the sequence, and writes no beat at its end', () => {
  // 120 BPM from 0.5 s over 2 s at 25 fps: the sequence is 50 frames, and 2.0 s is its end, so
  // the markers stop at 1.5 s, frame 38.
  const exportInput = input()
  const fcpxml = toFcpxml(exportInput)
  const sequence = Number(/<sequence format="r1" duration="(\d+)\/25s"/.exec(fcpxml)?.[1])
  const fcpStarts = [...fcpxml.matchAll(/<marker start="(\d+)\/25s"/g)].map(([, frame]) => Number(frame))
  assert.equal(sequence, 50)
  assert.deepEqual(fcpStarts, [13, 25, 38])
  const xmeml = toFcp7Xml(exportInput)
  assert.equal(Number(/<duration>(\d+)<\/duration>/.exec(xmeml)?.[1]), 50)
  assert.deepEqual([...xmeml.matchAll(/<in>(\d+)<\/in>/g)].map(([, frame]) => Number(frame)), [13, 25, 38])
})

test('FCP7 XML: drop-frame only at a 30 timebase, as the xmeml reference allows, so 59.94 DF is refused', () => {
  assert.throws(() => toFcp7Xml(input({ rate: rate('59.94'), dropFrame: true })), RangeError)
  assert.match(toFcp7Xml(input({ rate: rate('59.94'), dropFrame: false })), /<timebase>60<\/timebase><ntsc>TRUE<\/ntsc>/)
  assert.deepEqual(
    EXPORT_TIMECODES.filter((entry) => !timecodesFor('fcp7xml').includes(entry)).map((entry) => entry.id),
    ['59.94 DF'],
  )
  for (const format of ['csv', 'edl', 'fcpxml'] as const) assert.deepEqual(timecodesFor(format), EXPORT_TIMECODES)
})

test('timecodeChoice: the chosen timecode, its non-drop twin where the format has no drop-frame, else 24 fps', () => {
  assert.equal(timecodeChoice('edl', '59.94 DF').id, '59.94 DF')
  assert.equal(timecodeChoice('fcp7xml', '59.94 DF').id, '59.94 NDF')
  assert.equal(timecodeChoice('fcp7xml', '29.97 DF').id, '29.97 DF')
  assert.equal(timecodeChoice('csv', 'nope').id, '24')
})

test('FCP7 XML: whole rates are not NTSC', () => {
  assert.match(toFcp7Xml(input({ rate: rate('25') })), /<timebase>25<\/timebase><ntsc>FALSE<\/ntsc>/)
  assert.match(toFcp7Xml(input({ rate: rate('23.976') })), /<timebase>24<\/timebase><ntsc>TRUE<\/ntsc>/)
})

test('downloadName: the stem, the format and the rate, without characters file systems refuse', () => {
  assert.equal(downloadName('song.mp3', 'edl', rate('25'), false), 'song beat markers 25 fps.edl')
  assert.equal(downloadName('a/b:c*?.final.wav', 'fcp7xml', rate('29.97'), true), 'a_b_c__.final beat markers 29.97 fps DF.xml')
  assert.equal(downloadName('song.mp3', 'csv', rate('59.94'), false), 'song beat markers 59.94 fps NDF.csv')
  assert.equal(downloadName('.mp3', 'csv', rate('24'), false), '.mp3 beat markers 24 fps.csv')
  assert.equal(downloadName('???', 'fcpxml', rate('24'), false), '___ beat markers 24 fps.fcpxml')
  assert.equal(downloadName('   .wav', 'csv', rate('24'), false), 'audio beat markers 24 fps.csv')
  assert.equal(downloadName(`a${String.fromCharCode(1)}b.wav`, 'csv', rate('24'), false), 'a_b beat markers 24 fps.csv')
})

test('EXPORT_TIMECODES: 29.97 and 59.94 offered as drop-frame and non-drop, every other rate once', () => {
  assert.deepEqual(EXPORT_TIMECODES.map((entry) => entry.label), [
    '23.976 fps', '24 fps', '25 fps', '29.97 fps DF', '29.97 fps NDF', '30 fps', '50 fps', '59.94 fps DF', '59.94 fps NDF', '60 fps',
  ])
  assert.equal(new Set(EXPORT_TIMECODES.map((entry) => entry.id)).size, EXPORT_TIMECODES.length)
  for (const entry of EXPORT_TIMECODES) assert.ok(!entry.dropFrame || entry.rate.canDropFrame, entry.label)
})

test('drop-frame and non-drop are each written as chosen in all four formats', () => {
  // One timecode minute: frame 1800 at 29.97 (00:01:00:00 NDF, 00:01:00;02 DF), 3600 at 59.94.
  // The beat at 60 s of audio falls just before it, on 00:00:59 either way.
  for (const [label, minuteFrame, dropped] of [['29.97', 1800, '02'], ['59.94', 3600, '04']] as const) {
    for (const choice of EXPORT_TIMECODES.filter((entry) => entry.rate.label === label)) {
      const marks = input({ bpm: 60, firstBeat: 0, duration: 61, rate: choice.rate, dropFrame: choice.dropFrame })
      const atMinute = markerFile('csv', marks).content.split('\r\n').find((line) => line.startsWith('Beat 61,'))
      const edl = toEdl(marks)
      const fcpxml = toFcpxml(marks)
      if (!choice.dropFrame) assert.doesNotMatch(edl, /;/, choice.label)
      assert.ok(atMinute, `${choice.label}: no marker at one minute`)
      if (choice.dropFrame) {
        assert.match(atMinute, /,00:00:59;\d\d$/, choice.label)
        assert.equal(timecode(minuteFrame, choice.rate, true), `00:01:00;${dropped}`)
        assert.match(edl, /^FCM: DROP FRAME\r$/m)
        assert.match(edl, /01:00:00;00 01:00:00;01/)
        assert.match(fcpxml, /tcFormat="DF"/)
        if (label === '29.97') {
          assert.match(toFcp7Xml(marks), /<string>00:00:00;00<\/string><frame>0<\/frame><displayformat>DF<\/displayformat>/)
        }
      } else {
        assert.match(atMinute, /,00:00:59:\d\d$/, choice.label)
        assert.doesNotMatch(markerFile('csv', marks).content, /;/, choice.label)
        assert.equal(timecode(minuteFrame, choice.rate, false), '00:01:00:00')
        assert.match(edl, /^FCM: NON-DROP FRAME\r$/m)
        assert.match(edl, /01:00:00:00 01:00:00:01/)
        assert.match(fcpxml, /tcFormat="NDF"/)
        assert.match(toFcp7Xml(marks), /<string>00:00:00:00<\/string><frame>0<\/frame><displayformat>NDF<\/displayformat>/)
      }
    }
  }
})

test('markerFile: name, type and content per format', () => {
  const file = markerFile('fcpxml', input())
  assert.equal(file.name, 'song beat markers 25 fps.fcpxml')
  assert.equal(file.mime, 'application/xml')
  assert.match(file.content, /<fcpxml/)
  assert.equal(markerFile('csv', input()).mime, 'text/csv')
  assert.throws(() => markerFile('mp4' as never, input()), RangeError)
})

// Every marker sits on its beat's frame and inside the audio's timeline. What each file
// holds is read back from the file itself, and the expected grid is worked out here, not from
// beatTimes or frameAt.

interface Written {
  /** The frame of each marker, in order, as the file places it. */
  frames: number[]
  /** The sequence's length in frames, where the file declares one (FCPXML, FCP7 XML). */
  declared: number | null
  /** The CSV's seconds and timecode, one per row. */
  rows: { seconds: number; timecode: string }[]
}

/** Inverts `timecode` by search: EDL record-ins are timecodes, and drop-frame skips labels. */
function edlFrames(edl: string, choice: (typeof EXPORT_TIMECODES)[number]): number[] {
  const start = framesPerHour(choice.rate, choice.dropFrame)
  const recordIns = [...edl.matchAll(/^\d+ {2}001 {6}V {5}C {8}\S+ \S+ (\S+) \S+\r$/gm)].map(([, tc]) => tc!)
  let frame = start
  return recordIns.map((label) => {
    // Record-ins only grow, so the search resumes where the last one stopped.
    while (timecode(frame, choice.rate, choice.dropFrame) !== label) {
      frame += 1
      assert.ok(frame < start + 10 ** 7, `no frame has the timecode ${label}`)
    }
    return frame - start
  })
}

function written(format: (typeof MARKER_FORMATS)[number]['id'], exportInput: MarkerExport, choice: (typeof EXPORT_TIMECODES)[number]): Written {
  const content = markerFile(format, exportInput).content
  const { numerator, denominator } = exportInput.rate
  if (format === 'csv') {
    const rows = content.split('\r\n').slice(1, -1).map((line) => line.split(','))
    return {
      frames: rows.map((row) => Number(row[2])),
      declared: null,
      rows: rows.map((row) => ({ seconds: Number(row[1]), timecode: row[3]! })),
    }
  }
  if (format === 'fcpxml') {
    const toFrames = (value: string) => (value === '0' ? 0 : Number(value) / denominator)
    const starts = [...content.matchAll(/<marker start="(\d+)(?:\/\d+)?s"/g)].map(([, value]) => toFrames(value!))
    const [, total, unit] = /<sequence format="r1" duration="(\d+)\/(\d+)s"/.exec(content) ?? []
    assert.equal(Number(unit), numerator)
    return { frames: starts, declared: toFrames(total!), rows: [] }
  }
  if (format === 'fcp7xml') {
    return {
      frames: [...content.matchAll(/<in>(\d+)<\/in>/g)].map(([, value]) => Number(value)),
      declared: Number(/<duration>(\d+)<\/duration>/.exec(content)?.[1]),
      rows: [],
    }
  }
  return { frames: edlFrames(content, choice), declared: null, rows: [] }
}

/**
 * The grid the export must write: a beat every 60 / bpm from the first, inside the audio, on the
 * nearest frame, and only while that frame is inside the sequence of `frames` frames.
 */
function expectedGrid(exportInput: MarkerExport, frames: number): { seconds: number; frame: number }[] {
  const grid: { seconds: number; frame: number }[] = []
  for (let index = 0; index < MAX_MARKERS; index += 1) {
    const seconds = exportInput.firstBeat + index * (60 / exportInput.bpm)
    const frame = Math.round((seconds * exportInput.rate.numerator) / exportInput.rate.denominator)
    if (seconds >= exportInput.duration || frame >= frames) break
    grid.push({ seconds, frame })
  }
  return grid
}

/** The rule, checked in every format the export offers at this timecode. Returns the CSV's frames. */
function checkRule(scenario: Omit<MarkerExport, 'rate' | 'dropFrame'>, choice: (typeof EXPORT_TIMECODES)[number], frames: number): number[] {
  const exportInput: MarkerExport = { ...scenario, rate: choice.rate, dropFrame: choice.dropFrame }
  const grid = expectedGrid(exportInput, frames)
  const where = `${choice.label}, ${scenario.bpm} BPM from ${scenario.firstBeat} s over ${scenario.duration} s`
  assert.deepEqual(beatMarkers(exportInput).map((marker) => marker.frame), grid.map((beat) => beat.frame), `beatMarkers at ${where}`)
  for (const format of MARKER_FORMATS.filter((entry) => timecodesFor(entry.id).includes(choice))) {
    const file = written(format.id, exportInput, choice)
    const label = `${format.id} at ${where}`
    // A marker's frame is its beat's frame, and no beat is left out or added.
    assert.deepEqual(file.frames, grid.map((beat) => beat.frame), label)
    if (file.declared !== null) assert.equal(file.declared, frames, label)
    // Inside the timeline at both ends.
    for (const frame of file.frames) assert.ok(frame >= 0 && frame < frames, `${label}: frame ${frame} outside 0..${frames - 1}`)
    // The CSV's seconds, frame and timecode name the same beat on every row.
    for (const [index, row] of file.rows.entries()) {
      const frame = file.frames[index]!
      assert.ok(Math.abs(row.seconds - grid[index]!.seconds) <= 0.0005, `${label}: row ${index + 1} at ${row.seconds} s`)
      // Inside the audio, give or take the seconds' rounding to 3 decimals: a beat 0.4 ms before
      // the end can print past it.
      assert.ok(row.seconds < scenario.duration + 0.0005, `${label}: row ${index + 1} at the audio's end`)
      // Within half a frame, plus the 3-decimal rounding of the seconds.
      const offset = Math.abs((row.seconds * choice.rate.numerator) / choice.rate.denominator - frame)
      assert.ok(offset <= 0.5 + 0.0005 * fps(choice.rate), `${label}: row ${index + 1}, ${row.seconds} s on frame ${frame}`)
      assert.equal(row.timecode, timecode(frame, choice.rate, choice.dropFrame), `${label}: row ${index + 1}`)
    }
  }
  return grid.map((beat) => beat.frame)
}

/** Frames in `seconds` of audio, the audio's length rounded up to a whole frame. */
const framesIn = (seconds: number, entry: ExportRate) => Math.ceil((seconds * entry.numerator) / entry.denominator)

test(' 30.000 s at 120 BPM from 0 s at 24 fps is 60 markers, the last at 29.500 s on frame 708', () => {
  const card: MarkerExport = { name: 'kick.wav', bpm: 120, firstBeat: 0, duration: 30, rate: rate('24'), dropFrame: false }
  const markers = beatMarkers(card)
  assert.equal(markers.length, 60)
  assert.deepEqual(markers.at(-1), { index: 60, seconds: 29.5, frame: 708 })
  const csv = toCsv(card).split('\r\n')
  assert.equal(csv.length, 62)
  assert.equal(csv[1], 'Beat 1,0.000,0,00:00:00:00')
  assert.equal(csv[60], 'Beat 60,29.500,708,00:00:29:12')
  assert.doesNotMatch(toCsv(card), /Beat 61/)
  const fcpxml = toFcpxml(card)
  assert.equal([...fcpxml.matchAll(/<marker /g)].length, 60)
  assert.match(fcpxml, /<marker start="708\/24s" duration="1\/24s" value="Beat 60"\/>\n {12}<\/gap>/)
  assert.match(fcpxml, /<sequence format="r1" duration="720\/24s"/)
  assert.equal([...toFcp7Xml(card).matchAll(/<marker>/g)].length, 60)
  assert.match(toEdl(card), /^060 {2}001 {6}V {5}C {8}01:00:29:12 01:00:29:13 /m)
  assert.doesNotMatch(toEdl(card), /^061 /m)
})

test(' 30 s at 120 BPM keeps 60 markers on their beats at every rate and in every format', () => {
  for (const choice of EXPORT_TIMECODES) {
    const frames = checkRule({ name: 'kick.wav', bpm: 120, firstBeat: 0, duration: 30 }, choice, framesIn(30, choice.rate))
    assert.equal(frames.length, 60, choice.label)
    assert.equal(frames[0], 0, choice.label)
    assert.equal(frames.at(-1), Math.round(29.5 * fps(choice.rate)), choice.label)
  }
})

test(' a beat at the end, or inside the last half frame, is not written; one just before it is', () => {
  // Each case puts the last of three beats, a second apart, at a place in the sequence's last
  // frame. The audio ends on a frame boundary here, `frames` frames long, so the sequence and the
  // audio end together and the last half frame lies inside the audio at every rate.
  for (const choice of EXPORT_TIMECODES) {
    const { numerator, denominator } = choice.rate
    const frames = 30 * choice.rate.timebase
    const duration = (frames * denominator) / numerator
    const atFrame = (frame: number) => (frame * denominator) / numerator
    const cases = [
      { what: 'at the end', last: duration, count: 2 },
      { what: 'in the last half frame', last: atFrame(frames - 0.25), count: 2 },
      { what: 'just before the last half frame', last: atFrame(frames - 0.6), count: 3 },
    ]
    for (const { what, last, count } of cases) {
      const written = checkRule({ name: 'edge.wav', bpm: 60, firstBeat: last - 2, duration }, choice, frames)
      assert.equal(written.length, count, `${choice.label}, a beat ${what}`)
      assert.ok(written.at(-1)! <= frames - 1, `${choice.label}, a beat ${what}`)
    }
  }
})

test(' a first beat at 0 is frame 0, 00:00:00:00, and the EDL\'s 01:00:00:00', () => {
  for (const choice of EXPORT_TIMECODES) {
    const exportInput: MarkerExport = { name: 'zero.wav', bpm: 90, firstBeat: 0, duration: 4, rate: choice.rate, dropFrame: choice.dropFrame }
    const frames = checkRule(exportInput, choice, framesIn(4, choice.rate))
    assert.equal(frames[0], 0, choice.label)
    const separator = choice.dropFrame ? ';' : ':'
    assert.match(toCsv(exportInput), new RegExp(`^Beat 1,0\\.000,0,00:00:00${separator}00\\r$`, 'm'), choice.label)
    assert.match(toEdl(exportInput), new RegExp(`^001 {2}001 {6}V {5}C {8}01:00:00${separator}00 `, 'm'), choice.label)
  }
})

test(' an audio that ends on a frame boundary declares exactly that many frames, despite float error', () => {
  // 31 frames of 24000/1001 is 1.29295833... s, which times 24000 / 1001 is 31.000000000000004 in
  // floats, whose ceiling would add a 32nd frame past the audio's end.
  const choice = EXPORT_TIMECODES.find((entry) => entry.id === '23.976')!
  const duration = (31 * 1001) / 24_000
  assert.ok((duration * 24_000) / 1001 > 31, 'the float case this test is about')
  const exportInput: MarkerExport = { name: 'seven.wav', bpm: 60, firstBeat: 0, duration, rate: choice.rate, dropFrame: false }
  assert.match(toFcpxml(exportInput), /<sequence format="r1" duration="31031\/24000s"/)
  assert.match(toFcp7Xml(exportInput), /<duration>31<\/duration>/)
  // A beat in its last half frame rounds to frame 31, the sequence's end, so it isn't written.
  const late = { ...exportInput, firstBeat: (30.75 * 1001) / 24_000 }
  assert.equal(beatMarkers(late).length, 0)
  assert.equal(toCsv(late), 'marker,seconds,frame,timecode\r\n')
})

test(' the rule holds across tempos, first beats and lengths', () => {
  // Off-grid tempos and first beats, and lengths that end anywhere inside a frame.
  for (const choice of EXPORT_TIMECODES) {
    for (const [bpm, firstBeat, duration] of [[127.6, 0.37, 61.3], [174, 0.011, 9.999], [93.25, 1.7, 30.03], [140, 0, 12.857]] as const) {
      checkRule({ name: 'mix.wav', bpm, firstBeat, duration }, choice, framesIn(duration, choice.rate))
    }
  }
})
