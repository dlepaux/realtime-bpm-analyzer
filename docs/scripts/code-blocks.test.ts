// Run with `npm test`. Type-checks every TypeScript, TSX and JavaScript block of the
// guides, the examples and the home page against the library's built types, so a page
// cannot show an API the library no longer has. CI downloads the library's dist before
// the docs tests; locally, build the library first.
//
// Each block is its own module. A block may use the free names declared in PRELUDE
// (an `audioContext`, an `analyzer`, ...) without building them, as a page usually does.
// A block that cannot stand alone (a fragment, a file another block imports) is skipped
// with `<!-- typecheck: skip, <why> -->` on the line before its fence.
//
// The two migration guides are left out: their "before" blocks are the old API on purpose.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'

const docsDir = fileURLToPath(new URL('../', import.meta.url))
const repoDir = path.join(docsDir, '..')

const PAGES = [
  ...readdirSync(path.join(docsDir, 'guide'))
    .filter((name) => name.endsWith('.md') && !name.startsWith('migration-'))
    .map((name) => path.join(docsDir, 'guide', name)),
  ...readdirSync(path.join(docsDir, 'examples'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(docsDir, 'examples', name)),
  path.join(docsDir, 'index.md'),
  path.join(repoDir, 'examples', 'readme.md'),
]

// What the pages take as given. Global script declarations: a block that builds its own
// `analyzer` shadows this one in its module scope.
const PRELUDE = `
declare const createRealtimeBpmAnalyzer: typeof import('realtime-bpm-analyzer').createRealtimeBpmAnalyzer
declare const analyzeFullBuffer: typeof import('realtime-bpm-analyzer').analyzeFullBuffer
declare const audioContext: AudioContext
declare const audioElement: HTMLAudioElement
declare const button: HTMLButtonElement
declare const audioBuffer: AudioBuffer
declare const file: File
declare const channelData: Float32Array
declare const sampleRate: number
declare const analyzer: import('realtime-bpm-analyzer').BpmAnalyzer
declare const bpmDisplay: HTMLElement
declare const source: AudioNode
declare const stream: MediaStream
`

const LANGUAGES: Record<string, '.ts' | '.tsx' | '.js'> = {
  typescript: '.ts',
  ts: '.ts',
  tsx: '.tsx',
  javascript: '.js',
  js: '.js',
}

const SKIP = /^<!-- typecheck: skip, .+ -->$/

type Block = { file: string; page: string; line: number; code: string }

/** The checkable blocks of one page, each with the line its fence opens on */
function extractBlocks(page: string): Block[] {
  const lines = readFileSync(page, 'utf8').split('\n')
  const blocks: Block[] = []
  const name = path.relative(repoDir, page).replaceAll(/[/.]/g, '-')

  for (let index = 0; index < lines.length; index++) {
    const open = /^(\s*)```(\w+)/.exec(lines[index] ?? '')
    if (open === null) {
      continue
    }

    const close = lines.findIndex((line, at) => at > index && line.trim().startsWith('```'))
    assert.ok(close > index, `${page}:${index + 1}: unclosed fence`)
    const extension = LANGUAGES[open[2] ?? '']
    // A fence inside a list item is indented: its lines carry the same indent
    const indent = open[1]?.length ?? 0
    const before = lines.slice(0, index).reverse().find((line) => line.trim() !== '')
    if (extension !== undefined && !SKIP.test(before?.trim() ?? '')) {
      blocks.push({
        file: path.join(docsDir, `__block-${name}-${index + 1}${extension}`),
        page,
        line: index + 1,
        code: `${lines.slice(index + 1, close).map((line) => line.slice(indent)).join('\n')}\nexport {}\n`,
      })
    }
    index = close
  }

  return blocks
}

/** Diagnostics of the blocks, compiled as one program with the prelude */
function check(blocks: Block[], options: ts.CompilerOptions): string[] {
  const prelude = path.join(docsDir, '__prelude.d.ts')
  const virtual = new Map<string, string>([[prelude, PRELUDE], ...blocks.map((block) => [block.file, block.code] as const)])
  const host = ts.createCompilerHost(options)
  const { getSourceFile, fileExists, readFile } = host
  host.fileExists = (file) => virtual.has(file) || fileExists(file)
  host.readFile = (file) => virtual.get(file) ?? readFile(file)
  host.getSourceFile = (file, language, ...rest) => {
    const code = virtual.get(file)
    return code === undefined ? getSourceFile(file, language, ...rest) : ts.createSourceFile(file, code, language, true)
  }

  const program = ts.createProgram([prelude, ...virtual.keys()].filter((file, at, all) => all.indexOf(file) === at), options, host)
  const where = new Map(blocks.map((block) => [block.file, block]))

  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    const block = diagnostic.file === undefined ? undefined : where.get(diagnostic.file.fileName)
    if (block === undefined || diagnostic.start === undefined || diagnostic.file === undefined) {
      return `${diagnostic.file?.fileName ?? '(global)'}: ${message}`
    }

    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    return `${path.relative(repoDir, block.page)}:${block.line + 1 + line}: ${message}`
  })
}

const base: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: ['node'],
  jsx: ts.JsxEmit.ReactJSX,
  skipLibCheck: true,
  noEmit: true,
  isolatedModules: true,
}

const blocks = PAGES.flatMap(extractBlocks)

test('the pages have blocks to check', () => {
  assert.ok(blocks.length > 50, `only ${blocks.length} blocks found`)
})

test('every TypeScript and TSX block type-checks, strict', () => {
  const diagnostics = check(blocks.filter((block) => !block.file.endsWith('.js')), { ...base, strict: true })
  assert.deepEqual(diagnostics, [])
})

// JavaScript readers get no types, so only what TypeScript infers without strictness is
// held: a removed function, event or option still fails.
test('every JavaScript block type-checks', () => {
  const diagnostics = check(blocks.filter((block) => block.file.endsWith('.js')), { ...base, allowJs: true, checkJs: true })
  assert.deepEqual(diagnostics, [])
})
