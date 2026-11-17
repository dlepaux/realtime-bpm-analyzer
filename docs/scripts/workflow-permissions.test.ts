// Run with `npm test`. What each workflow job may do with its GITHUB_TOKEN and its OIDC token (RBA-232), and
// where its secrets may appear (RBA-272).
// npm's trusted publisher accepts an OIDC token from main.yml, so `id-token: write` on any other job of it,
// a pull request's run included, could publish realtime-bpm-analyzer. Only the release job gets one, in the
// `npm` environment that only main may deploy to, the PyPI and NuGet publish jobs, each in its registry's
// environment that only main may deploy to, and Pages' deploy job, which needs one to deploy.
// A permission missing from a job fails only on main, after the merge, where no PR run shows it: so every
// job's permissions are pinned below with the step that uses them, and a change has to change both.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

type Permissions = string | Record<string, string>
type Step = { name?: string, env?: Record<string, unknown> }
type Job = { if?: string, permissions?: Permissions | null, environment?: string | { name: string }, steps?: Step[] }
type Workflow = { on: string | string[] | Record<string, unknown>, permissions?: Permissions | null, jobs: Record<string, Job> }

const workflowsDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url))

const workflows: Record<string, Workflow> = Object.fromEntries(
  readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => [file, parse(readFileSync(join(workflowsDir, file), 'utf8')) as Workflow]),
)

// Each job's effective permissions, with what uses them. A job that declares none gets the workflow's.
// The release job and Pages' deploy are the only ones that may hold id-token: write.
const EXPECTED: Record<string, Record<string, Record<string, string>>> = {
  'main.yml': {
    // checkout. The uploads use the runner's own artifact token, not GITHUB_TOKEN.
    build: { contents: 'read' },
    // release-please-action's README: contents (tags, GitHub releases, the release branch), pull-requests (the
    // release PR) and issues (its autorelease labels). id-token: npm publish --provenance through npm's trusted
    // publisher, which also signs the provenance.
    release: { 'contents': 'write', 'issues': 'write', 'pull-requests': 'write', 'id-token': 'write' },
    // checkout. Firefox's install and the sound server need no token.
    firefox: { contents: 'read' },
    // checkout. The downloads use the runner's own artifact token.
    'node-floor': { contents: 'read' },
    // checkout. The download uses the runner's own artifact token; Deno's and Bun's setup actions download public
    // releases.
    conformance: { contents: 'read' },
    // checkout, and the Hermes clone, which is public. actions/cache uses the runner's own token.
    'conformance-hermes': { contents: 'read' },
    // checkout. setup-java's Maven cache uses the runner's own token, and the wrapper downloads Maven anonymously.
    'conformance-jvm': { contents: 'read' },
    // checkout. setup-python downloads public releases, pip installs from PyPI without a token.
    'conformance-python': { contents: 'read' },
    // checkout. setup-dotnet downloads the SDK anonymously, and the restore reads nuget.org without a token.
    'conformance-dotnet': { contents: 'read' },
    // checkout. The Swift images are public, pulled from Docker Hub without a token.
    'conformance-swift': { contents: 'read' },
    // checkout. bin/port-publish-gate.mjs reads the tags anonymously; the upload uses the runner's own artifact token.
    'pypi-build': { contents: 'read' },
    // pypa/gh-action-pypi-publish's README: id-token for PyPI's trusted publishing and the attestations. No
    // checkout, and the download uses the runner's own artifact token.
    'pypi-publish': { 'id-token': 'write' },
    // checkout. bin/port-publish-gate.mjs reads the tags anonymously.
    'maven-check': { contents: 'read' },
    // checkout. Central's token and the signing key are the maven environment's secrets, not GITHUB_TOKEN's.
    'maven-publish': { contents: 'read' },
    // checkout. bin/port-publish-gate.mjs reads the tags anonymously, setup-dotnet downloads the SDK anonymously, the
    // restore reads nuget.org without a token, and the upload uses the runner's own artifact token.
    'nuget-build': { contents: 'read' },
    // NuGet/login's README and nuget.org's trusted publishing docs: id-token, exchanged for a key that lasts an hour.
    // No checkout, and the download uses the runner's own artifact token.
    'nuget-publish': { 'id-token': 'write' },
    // checkout. bin/port-publish-gate.mjs and git ls-remote read the tags anonymously; the mirror is public.
    'swift-check': { contents: 'read' },
    // checkout. The push to the mirror uses the swift environment's deploy key, not GITHUB_TOKEN.
    'swift-publish': { contents: 'read' },
    // checkout, and configure-pages on pushes, which reads the Pages site (GET /repos/{owner}/{repo}/pages).
    // upload-pages-artifact is an artifact upload.
    docs: { contents: 'read', pages: 'read' },
    // checkout. actions/cache uses the runner's own token.
    markers: { contents: 'read' },
    // deploy-pages' README: pages to create the deployment, id-token to prove where it comes from.
    'docs-deploy': { 'pages': 'write', 'id-token': 'write' },
  },
  'codeql.yml': {
    // codeql-action's README: security-events to upload the results; contents for the checkout.
    // actions: read is for private repositories only.
    analyze: { 'contents': 'read', 'security-events': 'write' },
  },
  'benchmark-image.yml': {
    // checkout, and docker/login-action plus docker push to ghcr.io.
    image: { contents: 'read', packages: 'write' },
  },
  'links.yml': {
    // checkout, and the weekly report: gh issue list/comment/close and create-issue-from-file open, edit and close
    // the one broken-links issue. lychee-action also hands this token to the lychee binary, for GitHub's rate
    // limits on github.com links (main.yml's offline check withholds it with token: '').
    'external-links': { contents: 'read', issues: 'write' },
  },
  'browser-cost.yml': {
    cost: { contents: 'read' },
    memory: { contents: 'read' },
    bundle: { contents: 'read' },
    report: { contents: 'read' },
  },
}

// The only jobs that run on pull requests and still write. CodeQL uploads each PR's results to code scanning,
// and its job installs nothing and runs no code from the repo (JavaScript needs no build, autobuild does nothing).
const PULL_REQUEST_WRITES: Record<string, Record<string, string[]>> = {
  'codeql.yml': { analyze: ['security-events'] },
}

const ID_TOKEN_JOBS = ['main.yml/release', 'main.yml/pypi-publish', 'main.yml/nuget-publish', 'main.yml/docs-deploy']

const ALL_SCOPES = ['actions', 'attestations', 'checks', 'contents', 'deployments', 'discussions', 'id-token', 'issues', 'models', 'packages', 'pages', 'pull-requests', 'security-events', 'statuses']

// read-all and write-all are shorthands for every scope
const expand = (permissions: Permissions | null | undefined): Record<string, string> => {
  if (permissions === undefined || permissions === null) return {}
  if (typeof permissions === 'string') return Object.fromEntries(ALL_SCOPES.map((scope) => [scope, permissions.replace('-all', '')]))
  return permissions
}

const effective = (workflow: Workflow, job: Job) => expand(job.permissions ?? workflow.permissions)

const writes = (permissions: Record<string, string>) =>
  Object.entries(permissions).filter(([, level]) => level === 'write').map(([scope]) => scope)

const triggers = (on: Workflow['on']) => typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on)

// A job sits out pull requests when one of its `if`'s && terms is that guard, and no || can route around it.
const skipsPullRequests = (job: Job) =>
  typeof job.if === 'string' && !job.if.includes('||') &&
  job.if.split('&&').some((term) => term.trim() === "github.event_name != 'pull_request'")

const environmentName = (job: Job) => typeof job.environment === 'string' ? job.environment : job.environment?.name

const jobsOf = () => Object.entries(workflows).flatMap(([file, workflow]) =>
  Object.entries(workflow.jobs).map(([id, job]) => ({ file, id, job, workflow })))

test('the workflows were found and parsed', () => {
  assert.deepEqual(Object.keys(workflows).sort(), Object.keys(EXPECTED).sort())
})

test('each workflow grants read-only permissions at the top: contents: read, or none', () => {
  for (const [file, workflow] of Object.entries(workflows)) {
    assert.ok(workflow.permissions !== undefined, `${file}: no top-level permissions, so it gets the repo's default`)
    assert.ok(workflow.permissions !== null && typeof workflow.permissions === 'object', `${file}: top-level permissions ${String(workflow.permissions)}`)
    const extra = Object.entries(workflow.permissions).filter(([scope, level]) => !(scope === 'contents' && level === 'read'))
    assert.deepEqual(extra, [], `${file}: top-level permissions beyond contents: read`)
  }
})

test('each job has exactly the permissions pinned for it', () => {
  for (const { file, id, job, workflow } of jobsOf()) {
    assert.deepEqual(effective(workflow, job), EXPECTED[file]?.[id], `${file} job ${id}`)
  }
  for (const [file, jobs] of Object.entries(EXPECTED)) {
    for (const id of Object.keys(jobs)) assert.ok(workflows[file]?.jobs[id], `${file} has no job ${id} any more`)
  }
})

test('id-token: write is on the release job, the PyPI and NuGet publishes and Pages\' deploy only', () => {
  const holders = jobsOf().filter(({ job, workflow }) => effective(workflow, job)['id-token'] === 'write').map(({ file, id }) => `${file}/${id}`)
  assert.deepEqual(holders.sort(), [...ID_TOKEN_JOBS].sort())
})

test('each publish job runs in its registry\'s environment, and Pages\' deploy in github-pages', () => {
  const jobs = workflows['main.yml']?.jobs
  assert.equal(environmentName(jobs?.release ?? {}), 'npm')
  assert.equal(environmentName(jobs?.['pypi-publish'] ?? {}), 'pypi')
  assert.equal(environmentName(jobs?.['maven-publish'] ?? {}), 'maven')
  assert.equal(environmentName(jobs?.['nuget-publish'] ?? {}), 'nuget')
  assert.equal(environmentName(jobs?.['swift-publish'] ?? {}), 'swift')
  assert.equal(environmentName(jobs?.['docs-deploy'] ?? {}), 'github-pages')
})

test('no job that runs on a pull request gets id-token or a write permission', () => {
  for (const { file, id, job, workflow } of jobsOf()) {
    const on = triggers(workflow.on)
    assert.ok(!on.includes('pull_request_target'), `${file}: pull_request_target runs a fork's code with a write token`)
    if (!on.includes('pull_request') || skipsPullRequests(job)) continue
    const allowed = PULL_REQUEST_WRITES[file]?.[id] ?? []
    assert.deepEqual(writes(effective(workflow, job)).filter((scope) => !allowed.includes(scope)), [], `${file} job ${id} runs on pull requests`)
  }
})

test('skipsPullRequests reads the guard only where nothing routes around it', () => {
  assert.equal(skipsPullRequests({ if: "github.event_name != 'pull_request' && github.ref == 'refs/heads/main'" }), true)
  assert.equal(skipsPullRequests({ if: "github.event_name != 'pull_request'" }), true)
  assert.equal(skipsPullRequests({ if: "github.event_name != 'pull_request' || always()" }), false)
  assert.equal(skipsPullRequests({ if: "github.ref == 'refs/heads/main'" }), false)
  assert.equal(skipsPullRequests({}), false)
})

// A credential in a workflow: any secret but GITHUB_TOKEN, whose scope the permissions above pin, or the short-lived
// key NuGet/login hands to the next step.
const CREDENTIAL = /\$\{\{\s*(secrets\.(?!GITHUB_TOKEN\b)\w+|steps\.\w+\.outputs\.NUGET_API_KEY)\s*\}\}/g

// Each credential reaches the one step that uses it, through that step's env, never through a job's or the
// workflow's env, a `with`, a `run` line or an `if`: in a run line it would be pasted into the script, and in a job's
// env every step and every action of the job would get it.
const CREDENTIAL_STEPS: Record<string, string[]> = {
  'secrets.GPG_PRIVATE_KEY': ['main.yml/maven-publish/Import the signing key'],
  'secrets.GPG_PASSPHRASE': ['main.yml/maven-publish/Sign, upload and publish to Maven Central'],
  'secrets.MAVEN_CENTRAL_USERNAME': ['main.yml/maven-publish/Sign, upload and publish to Maven Central'],
  'secrets.MAVEN_CENTRAL_PASSWORD': ['main.yml/maven-publish/Sign, upload and publish to Maven Central'],
  'secrets.SWIFT_DEPLOY_KEY': ['main.yml/swift-publish/Commit, tag and push to the mirror'],
  'steps.login.outputs.NUGET_API_KEY': ['main.yml/nuget-publish/Push to NuGet'],
}

test('each credential is in the env of the one step that uses it, and nowhere else', () => {
  const found: Record<string, string[]> = {}
  for (const [file, workflow] of Object.entries(workflows)) {
    const { jobs, ...top } = workflow
    assert.deepEqual(JSON.stringify(top).match(CREDENTIAL) ?? [], [], `${file}: a credential outside a step's env`)
    for (const [id, job] of Object.entries(jobs)) {
      const outside = { ...job, steps: (job.steps ?? []).map(({ env: _env, ...step }) => step) }
      assert.deepEqual(JSON.stringify(outside).match(CREDENTIAL) ?? [], [], `${file} job ${id}: a credential outside a step's env`)
      for (const step of job.steps ?? []) {
        for (const match of JSON.stringify(step.env ?? {}).matchAll(CREDENTIAL)) {
          (found[match[1] ?? ''] ??= []).push(`${file}/${id}/${step.name}`)
        }
      }
    }
  }
  assert.deepEqual(found, CREDENTIAL_STEPS)
})

test('CREDENTIAL finds secrets and the NuGet key, and leaves GITHUB_TOKEN to the permissions', () => {
  const found = (text: string) => [...text.matchAll(CREDENTIAL)].map((match) => match[1])
  assert.deepEqual(found('${{ secrets.SWIFT_DEPLOY_KEY }} ${{secrets.X}} ${{ steps.login.outputs.NUGET_API_KEY }}'),
    ['secrets.SWIFT_DEPLOY_KEY', 'secrets.X', 'steps.login.outputs.NUGET_API_KEY'])
  assert.deepEqual(found('${{ secrets.GITHUB_TOKEN }} ${{ steps.unpublished.outputs.version }}'), [])
})

test('expand reads read-all and write-all as every scope', () => {
  assert.equal(expand('write-all')['id-token'], 'write')
  assert.equal(expand('read-all').contents, 'read')
  assert.deepEqual(expand({}), {})
})
