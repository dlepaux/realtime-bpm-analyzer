// Writes every marker file the export offers, every format at every frame rate, with a manifest
// of the inputs, for the CI job that reads them back with OpenTimelineIO
// (scripts/marker-conformance.py). The files come from the same functions the page calls.
//
// Usage: node scripts/marker-fixtures.ts <empty output directory>
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARKER_FORMATS,
  markerFile,
  timecodesFor,
  type MarkerExport,
} from '../.vitepress/tools/beat-markers.ts'

// A tempo between whole numbers, a first beat off the frame grid, past 999 markers and past the
// tenth minute (drop-frame's exception), and a name that needs escaping in XML and in the EDL.
const SCENARIO = {
  name: 'Conformance <A&B> "mix" é.wav',
  bpm: 127.6,
  firstBeat: 0.37,
  duration: 610.5,
} as const

const outDir = process.argv[2]
if (outDir === undefined) throw new Error('Usage: node scripts/marker-fixtures.ts <output directory>')
mkdirSync(outDir, { recursive: true })
if (readdirSync(outDir).length > 0) throw new Error(`${outDir} is not empty`)

const manifest = MARKER_FORMATS.flatMap((format) => timecodesFor(format.id).map((timecode) => {
  const input: MarkerExport = { ...SCENARIO, rate: timecode.rate, dropFrame: timecode.dropFrame }
  const file = markerFile(format.id, input)
  writeFileSync(join(outDir, file.name), file.content)
  return {
    file: file.name,
    format: format.id,
    timecode: timecode.id,
    ...SCENARIO,
    numerator: timecode.rate.numerator,
    denominator: timecode.rate.denominator,
    timebase: timecode.rate.timebase,
    dropFrame: timecode.dropFrame,
  }
}))
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`${manifest.length} marker files in ${outDir}`)
