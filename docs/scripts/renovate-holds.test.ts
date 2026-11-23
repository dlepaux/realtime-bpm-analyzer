// Run with `npm test`. The versions Renovate must leave alone, and the ones it must keep moving.
// - The published engines of the CLI and the MCP server: raising them drops users on an older Node LTS,
//   a breaking change ruled out on 2026-11-17.
// - The steps that run Node at that floor: a bump there tests a newer Node than the floor promises.
// - The markers job's Python: its requirements pin OpenTimelineIO's CPython wheel by hash, and OpenTimelineIO
//   publishes none past 3.13, so a newer Python breaks `pip install --require-hashes`.
// - The runtime floors of the published Python package (numpy >=1.26.4): the py311 job tests exactly that floor, and
//   raising it drops users on the older major, as #455 would have.
// - JUnit below 6 in the JVM package: JUnit 6 needs Java 17, and CI runs the same tests on Java 8 (#456).
// Every other setup-node and setup-python step keeps getting Renovate's bumps.
// The matcher below models the packageRules fields this repo's holds use. Renovate matches matchPackageNames
// against the packageName, which for setup-node's node-version is actions/node-versions, not node: a hold written
// with matchPackageNames ["node"] there matched nothing, and #346 bumped the floor job.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

type Rule = { enabled?: boolean, [field: string]: unknown }
type Dep = { manager: string, depType?: string, depName: string, packageName: string, currentValue: string }
type Step = { uses?: string, name?: string, with?: Record<string, unknown> }
type Workflow = { jobs: Record<string, { steps?: Step[] }> }

const repoFile = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8')
const { packageRules } = JSON.parse(repoFile('renovate.json')) as { packageRules: Rule[] }

// Renovate's pattern syntax for these fields: an exact name, or a regex written as /.../
const matchesPattern = (pattern: string, value: string) => {
  const regex = /^\/(.+)\/$/.exec(pattern)
  return regex ? new RegExp(regex[1]).test(value) : pattern === value
}

// What each field is matched against. A rule with any other match* field doesn't match here; a test below
// refuses such a field on any rule that sets enabled or allowedVersions, so no hold or block can pass unread.
const FIELDS: Record<string, (dep: Dep) => string | undefined> = {
  matchManagers: (dep) => dep.manager,
  matchDepTypes: (dep) => dep.depType,
  matchDepNames: (dep) => dep.depName,
  matchPackageNames: (dep) => dep.packageName,
  matchCurrentValue: (dep) => dep.currentValue,
}

function ruleMatches(rule: Rule, dep: Dep): boolean {
  const matchers = Object.keys(rule).filter((key) => key.startsWith('match'))
  // No matcher at all applies the rule to every dependency, as in Renovate
  return matchers.every((key) => {
    const value = FIELDS[key]?.(dep)
    if (value === undefined) return false
    const patterns = [rule[key]].flat() as string[]
    return patterns.some((pattern) => matchesPattern(pattern, value))
  })
}

// Later rules override earlier ones, as in Renovate
const isHeld = (dep: Dep) =>
  packageRules.filter((rule) => ruleMatches(rule, dep)).reduce((enabled, rule) => rule.enabled ?? enabled, true) === false

const allowedVersions = (dep: Dep) => packageRules.filter((rule) => ruleMatches(rule, dep))
  .reduce<unknown>((allowed, rule) => rule.allowedVersions ?? allowed, undefined)

const workflowsDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url))
const workflows = readdirSync(workflowsDir).filter((file) => /\.ya?ml$/.test(file)).map((file) =>
  ({ file, workflow: parse(readFileSync(join(workflowsDir, file), 'utf8')) as Workflow }))

// Every setup-<tool> step in every workflow, as the dependency Renovate's github-actions manager extracts from it
function setupSteps(tool: 'node' | 'python') {
  return workflows.flatMap(({ file, workflow }) => Object.entries(workflow.jobs).flatMap(([job, { steps = [] }]) =>
    steps.filter((step) => step.uses?.startsWith(`actions/setup-${tool}@`) && step.with?.[`${tool}-version`] !== undefined)
      .map((step) => ({
        where: `${file} ${job} "${step.name}"`,
        job,
        dep: {
          manager: 'github-actions',
          depName: tool,
          packageName: `actions/${tool}-versions`,
          currentValue: String(step.with?.[`${tool}-version`]),
        },
      }))))
}

const enginesFloor = (path: string) => {
  const { engines } = JSON.parse(repoFile(path)) as { engines?: { node?: string } }
  assert.ok(engines?.node, `${path} declares engines.node`)
  return engines.node
}

const publishedEngines = ['packages/cli/package.json', 'packages/mcp/package.json']

test('Renovate leaves the published engines of the CLI and the MCP server alone', () => {
  for (const path of publishedEngines) {
    const dep = { manager: 'npm', depType: 'engines', depName: 'node', packageName: 'node', currentValue: enginesFloor(path) }
    assert.ok(isHeld(dep), `${path}'s engines.node ${dep.currentValue} is held`)
  }
})

test('Renovate leaves the steps at the Node floor alone, and bumps every other Node step', () => {
  const floor = enginesFloor(publishedEngines[0]).replace(/^>=/, '')
  const steps = setupSteps('node')
  const atFloor = steps.filter(({ dep }) => dep.currentValue === floor)
  assert.ok(atFloor.some(({ job }) => job === 'node-floor'), 'the node-floor job runs the floor')
  for (const { where, dep } of steps) {
    assert.equal(isHeld(dep), dep.currentValue === floor, `${where} runs Node ${dep.currentValue}`)
  }
})

test('Renovate leaves the markers job on the Python its hashed wheels are for, and bumps every other Python step', () => {
  const steps = setupSteps('python')
  const markers = steps.filter(({ job }) => job === 'markers')
  assert.equal(markers.length, 1, 'the markers job sets up Python once')
  const requirements = repoFile('docs/scripts/marker-conformance-requirements.txt')
  assert.ok(requirements.includes(`CPython ${markers[0].dep.currentValue} `),
    `the markers requirements' hashes are for CPython ${markers[0].dep.currentValue}`)
  for (const { where, job, dep } of steps) {
    assert.equal(isHeld(dep), job === 'markers', `${where} runs Python ${dep.currentValue}`)
  }
})

// pyproject's [project] dependencies, as Renovate's pep621 manager extracts them: "numpy>=1.26.4" → numpy, >=1.26.4
function pythonRuntimeDeps(): Dep[] {
  const list = /^dependencies = \[(.*)\]$/m.exec(repoFile('packages/python/pyproject.toml'))
  assert.ok(list, 'packages/python/pyproject.toml declares its dependencies on one line')
  return [...list[1].matchAll(/"([A-Za-z0-9_.-]+)([^"]+)"/g)].map(([, name, range]) =>
    ({ manager: 'pep621', depType: 'project.dependencies', depName: name, packageName: name, currentValue: range }))
}

test('Renovate leaves the published Python package\'s runtime floors alone, the versions the py311 job tests', () => {
  const pinned = repoFile('packages/python/ci/test-py311.in')
  const deps = pythonRuntimeDeps()
  assert.ok(deps.some(({ depName }) => depName === 'numpy'), 'numpy is a runtime dependency')
  for (const dep of deps) {
    const floor = /^>=(\S+)$/.exec(dep.currentValue)?.[1]
    assert.ok(floor, `${dep.depName} ${dep.currentValue} is a plain >= floor`)
    assert.ok(new RegExp(`^${dep.depName}==${floor.replaceAll('.', '\\.')}$`, 'm').test(pinned),
      `ci/test-py311.in tests ${dep.depName} at its floor ${floor}`)
    assert.ok(isHeld(dep), `${dep.depName} ${dep.currentValue} is held`)
  }
  const build = { manager: 'pep621', depType: 'build-system.requires', depName: 'hatchling', packageName: 'hatchling', currentValue: '>=1.27' }
  assert.equal(isHeld(build), false, 'the build backend still gets bumps')
})

test('Renovate keeps the JVM package on JUnit 5, which still runs on the Java 8 the tests prove', () => {
  const pom = repoFile('packages/jvm/pom.xml')
  const version = /<artifactId>junit-bom<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>/.exec(pom)?.[1]
  assert.match(version ?? '', /^5\./, 'pom.xml imports junit-bom 5.x')
  assert.match(repoFile('.github/workflows/main.yml'), /surefire:test -Djvm="\$JAVA_HOME_8_X64\/bin\/java"/,
    'CI runs the JVM tests on Java 8')
  const bom = { manager: 'maven', depName: 'org.junit:junit-bom', packageName: 'org.junit:junit-bom', currentValue: version ?? '' }
  assert.equal(allowedVersions(bom), '<6')
  assert.equal(isHeld(bom), false, 'JUnit 5 patches and minors still come')
})

// The bump checks above hold only if the matcher reads every rule that can switch a dependency off. A rule on a
// field it doesn't model (matchUpdateTypes, matchFileNames...) or with a glob, a negation or regex flags would
// count as "no match" here while Renovate applies it, and the bumps it stops would pass unseen.
test('every rule that sets enabled or allowedVersions uses only the fields and patterns this test models', () => {
  for (const rule of packageRules.filter((rule) => 'enabled' in rule || 'allowedVersions' in rule)) {
    for (const [key, value] of Object.entries(rule).filter(([key]) => key.startsWith('match'))) {
      assert.ok(key in FIELDS, `${String(rule.description)}: ${key} isn't modelled`)
      for (const pattern of [value].flat() as string[]) {
        // A scoped name like @types/node is exact; a leading / or ! starts a regex with flags or a negation
        assert.ok(/^\/.+\/$/.test(pattern) || !/^[!/]|[*?{}]/.test(pattern), `${String(rule.description)}: ${pattern} isn't exact or /regex/`)
      }
    }
  }
})

test('the matcher reads matchPackageNames as the package name, as Renovate does', () => {
  const setupNode = { manager: 'github-actions', depName: 'node', packageName: 'actions/node-versions', currentValue: '22.12.0' }
  assert.equal(ruleMatches({ matchManagers: ['github-actions'], matchPackageNames: ['node'] }, setupNode), false)
  assert.equal(ruleMatches({ matchManagers: ['github-actions'], matchDepNames: ['node'] }, setupNode), true)
  assert.equal(ruleMatches({ matchDepNames: ['node'], matchCurrentValue: '/^22\\./' }, { ...setupNode, currentValue: '26.12.1' }), false)
  assert.equal(ruleMatches({ matchDepNames: ['node'], matchFileNames: ['x'] }, setupNode), false)
  assert.equal(ruleMatches({ enabled: false }, setupNode), true)
})
