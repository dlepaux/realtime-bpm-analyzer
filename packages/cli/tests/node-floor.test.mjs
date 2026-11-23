// The Node floor the CLI and the MCP server declare is the version main.yml's node-floor job tests
// them on, so the oldest Node a user may run is one CI has run. Renovate leaves both alone
// (renovate.json), so only a hand edit moves them, and this catches an edit to one of the three
// without the others. The floor is 22.12.0: 22.0.0 can deadlock a worker's teardown and hang the
// host.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const hangLimit = {timeout: 60_000};

const repoFile = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

/**
 * @param {string} workflow main.yml's text
 * @returns {string[]} Every node-version the node-floor job's steps set
 */
function nodeFloorVersions(workflow) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === '  node-floor:');
  assert.ok(start >= 0, 'main.yml has a node-floor job');
  // The job ends at the next line indented as a job key, or a comment at that depth
  const length = lines.slice(start + 1).findIndex(line => /^ {2}\S/.test(line));
  const job = lines.slice(start + 1, length < 0 ? undefined : start + 1 + length);
  return job.map(line => /^\s+node-version:\s*["']?([^"'\s#]+)/.exec(line)?.[1]).filter(Boolean);
}

/**
 * @param {string} path A package.json
 * @returns {Promise<string>} The Node version its engines field starts from, from `>=X.Y.Z`
 */
async function enginesFloor(path) {
  const {engines} = JSON.parse(await repoFile(path));
  const floor = /^>=(\d+\.\d+\.\d+)$/.exec(engines?.node ?? '');
  assert.ok(floor, `${path} declares engines.node as >=X.Y.Z, not ${JSON.stringify(engines?.node)}`);
  return floor[1];
}

describe('the Node floor', hangLimit, () => {
  it('is the version the node-floor job runs, for the CLI and the MCP server', async () => {
    const versions = nodeFloorVersions(await repoFile('.github/workflows/main.yml'));
    assert.equal(versions.length, 1, `the node-floor job sets one node-version, not ${JSON.stringify(versions)}`);
    assert.equal(await enginesFloor('packages/cli/package.json'), versions[0]);
    assert.equal(await enginesFloor('packages/mcp/package.json'), versions[0]);
  });

  it('reads the node-floor job alone, not the jobs around it', () => {
    const workflow = [
      'jobs:', '  build:', '    steps:', '      - with:', '          node-version: 26.12.1',
      '  node-floor:', '    steps:', '      - with:', '          node-version: "22.12.0"',
      '  # The next job', '  release:', '    steps:', '      - with:', '          node-version: 26.12.1',
    ].join('\n');
    assert.deepEqual(nodeFloorVersions(workflow), ['22.12.0']);
  });
});
