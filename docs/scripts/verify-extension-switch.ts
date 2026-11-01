// Proves the extension switch on real builds (RBA-58). Run after `npm run build`: it
// checks that build against the committed EXTENSION_STORE_URL, builds the site with the
// switch the other way into a temporary folder, checks that, and puts the file back.
// Rewriting the one line, rather than reading an environment variable, keeps the value
// in extension-config.ts as the only switch the site has.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXTENSION_STORE_URL } from '../.vitepress/tools/extension-config.ts'
import { resolveStoreUrl } from '../.vitepress/tools/extension-promo.ts'
import { switchProblems, type BuiltSite } from './extension-switch.ts'

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = join(DOCS, '.vitepress/tools/extension-config.ts')
const VALUE_LINE = /^export const EXTENSION_STORE_URL: string \| null = .*$/m
const FIXTURE = `https://chromewebstore.google.com/detail/live-bpm-detector/${'a'.repeat(32)}`

function builtSite(root: string): BuiltSite {
  const paths = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((path) => statSync(join(root, path)).isFile())
    .map((path) => path.split(sep).join('/'))
  return {
    paths,
    read: (path) => readFileSync(join(root, path), 'utf8'),
    size: (path) => statSync(join(root, path)).size,
  }
}

function check(root: string, storeUrl: string | null): boolean {
  const problems = switchProblems(builtSite(root), storeUrl)
  const state = storeUrl === null ? 'off' : 'on'
  for (const problem of problems) console.error(problem)
  console.log(`extension switch ${state}: ${problems.length} problem(s)`)
  return problems.length === 0
}

function buildWithValue(value: string | null, outDir: string): void {
  const source = readFileSync(CONFIG, 'utf8')
  if (!VALUE_LINE.test(source)) throw new Error('EXTENSION_STORE_URL line not found in extension-config.ts')
  try {
    const line = `export const EXTENSION_STORE_URL: string | null = ${JSON.stringify(value)}`
    writeFileSync(CONFIG, source.replace(VALUE_LINE, line))
    const build = spawnSync('npx', ['vitepress', 'build', '--outDir', outDir], { cwd: DOCS, stdio: 'inherit' })
    if (build.status !== 0) throw new Error(`vitepress build exited with ${build.status}`)
  } finally {
    writeFileSync(CONFIG, source)
  }
}

const committed = resolveStoreUrl(EXTENSION_STORE_URL)
const other = committed === null ? FIXTURE : null
const outDir = mkdtempSync(join(tmpdir(), 'rba-extension-switch-'))
let passed = check(join(DOCS, '.vitepress/dist'), committed)
try {
  buildWithValue(other, outDir)
  passed = check(outDir, other) && passed
} finally {
  rmSync(outDir, { recursive: true, force: true })
}
process.exit(passed ? 0 : 1)
