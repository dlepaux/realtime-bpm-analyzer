// Run with `npm test`. The private tracker reference gate (bin/private-refs-gate.sh), run on scratch repositories:
// a reference planted in any path it covers fails it, the records it leaves out pass, and an allowlisted line
// passes only as it stands. The gate is Build & Test's first step, so a path it stops covering would pass quietly.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const GATE = 'bin/private-refs-gate.sh'
const ALLOWLIST = 'bin/private-refs-allowlist.txt'
// Built at run time, so this file holds no reference for the gate to find
const REF = ['RBA', '123'].join('-')

// One file in each area the gate covers: the source, docs and community files it checked first, then the paths
// it took on once their references were replaced with reasons.
const COVERED = [
  'packages/realtime-bpm-analyzer/src/core/planted.ts',
  'docs/guide/planted.md',
  'contributing.md',
  'docs/.vitepress/config.ts',
  'docs/.vitepress/components/Planted.vue',
  'docs/.vitepress/theme/planted.css',
  'docs/.vitepress/tools/planted.ts',
  'docs/scripts/planted.test.ts',
  'bin/planted.mjs',
  '.github/workflows/planted.yml',
  '.lintstagedrc.cjs',
  'renovate.json',
  'conformance/generator/planted.mjs',
  'conformance/vectors.json',
  'packages/realtime-bpm-analyzer/tests/unit/planted.test.ts',
  'packages/realtime-bpm-analyzer/web-test-runner.config.mjs',
  'packages/realtime-bpm-analyzer/benchmark/lib/planted.ts',
  'packages/realtime-bpm-analyzer/benchmark/planted.py',
  'packages/realtime-bpm-analyzer/benchmark/readme.md',
  'packages/cli/tests/planted.test.mjs',
  'packages/mcp/tests/planted.test.mjs',
  'packages/jvm/src/test/java/Planted.java',
  'packages/python/tests/test_planted.py',
  'packages/python/scripts/planted.sh',
  'packages/csharp/tests/Planted.cs',
  'packages/swift/Tests/Planted.swift',
]

// Records the gate leaves out on purpose
const LEFT_OUT = [
  'packages/realtime-bpm-analyzer/changelog.md',
  'packages/cli/changelog.md',
  'packages/realtime-bpm-analyzer/benchmark/results/planted.md',
  'packages/realtime-bpm-analyzer/benchmark/heldout-log.md',
  'docs/scripts/fixtures/overlay-view-snapshot.txt',
]

interface Run { status: number | null, out: string }

// A scratch repository holding the gate, its allowlist and `files`, staged so git grep sees them as tracked
function runGate(files: Record<string, string>): Run {
  const dir = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'private-refs-gate-'))
  try {
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
      assert.equal(r.status, 0, r.stderr)
    }
    git('init', '-q')
    for (const path of [GATE, ALLOWLIST]) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      copyFileSync(join(ROOT, path), join(dir, path))
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    git('add', '-A')
    const r = spawnSync('sh', [GATE], { cwd: dir, encoding: 'utf8' })
    return { status: r.status, out: r.stdout + r.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a tree without references passes', () => {
  const run = runGate({ 'readme.md': '# Title\n', 'docs/scripts/clean.test.ts': '// no ticket here\n' })
  assert.equal(run.status, 0, run.out)
})

for (const path of COVERED) {
  test(`a reference planted in ${path} fails the gate and is listed`, () => {
    const run = runGate({ [path]: `// first line\n// cited ${REF} here\n` })
    assert.equal(run.status, 1, run.out)
    assert.ok(run.out.includes(`${path}:// cited ${REF} here`), run.out)
  })
}

for (const path of LEFT_OUT) {
  test(`a reference in ${path}, a record, passes`, () => {
    const run = runGate({ [path]: `- fix: something (${REF})\n` })
    assert.equal(run.status, 0, run.out)
  })
}

const [entry] = readFileSync(join(ROOT, ALLOWLIST), 'utf8').split('\n').filter(Boolean)
assert.ok(entry, `${ALLOWLIST} is empty`)
const cut = entry.indexOf(':')
const allowedPath = entry.slice(0, cut)
const allowedLine = entry.slice(cut + 1)

test('an allowlisted line passes as it stands', () => {
  const run = runGate({ [allowedPath]: `${allowedLine}\n` })
  assert.equal(run.status, 0, run.out)
})

test('a new reference in an allowlisted file still fails', () => {
  const run = runGate({ [allowedPath]: `${allowedLine}\n// cited ${REF} here\n` })
  assert.equal(run.status, 1, run.out)
  assert.ok(!run.out.includes(allowedLine), 'the allowlisted line is listed too')
})

test('an allowlisted line that changes no longer matches its entry', () => {
  const run = runGate({ [allowedPath]: `${allowedLine} changed\n` })
  assert.equal(run.status, 1, run.out)
})

test('a git grep error fails the gate instead of passing as clean', () => {
  const dir = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'private-refs-gate-nogit-'))
  try {
    mkdirSync(join(dir, 'bin'))
    copyFileSync(join(ROOT, GATE), join(dir, GATE))
    copyFileSync(join(ROOT, ALLOWLIST), join(dir, ALLOWLIST))
    // No repository here, and none above it may be found either
    const env = { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) }
    const r = spawnSync('sh', [GATE], { cwd: dir, encoding: 'utf8', env })
    assert.ok((r.status ?? 0) > 1, `exit ${r.status}: ${r.stdout}${r.stderr}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
