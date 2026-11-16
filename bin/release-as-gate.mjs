#!/usr/bin/env node
// CI gate: fail once a package's `release-as` has been released.
//
// `release-as` in release-please-config.json forces the next release of a package to one version: 6.1.0 for the
// library, because 6.0.0 was published broken in 2025 and npm never takes a version twice. Once that release
// merges, the manifest reaches it, and a `release-as` left behind would pin every later release PR to a version
// npm already has. Removing it is a manual step nobody is reminded of: this gate is the reminder.
//
// Usage: node bin/release-as-gate.mjs   (reads release-please-config.json and .release-please-manifest.json)
//        node bin/release-as-gate.mjs --self-test

import {readFileSync} from 'node:fs';

// x.y.z as numbers, or null for anything else (a prerelease included: release-as here is always plain)
function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  return match ? match.slice(1).map(Number) : null;
}

// Positive when a is after b
function compare(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// The packages whose release-as the manifest has reached or passed, as messages; a bad version is one too
export function staleReleaseAs(config, manifest) {
  const stale = [];
  for (const [path, settings] of Object.entries(config.packages ?? {})) {
    if (settings['release-as'] === undefined) continue;
    const target = parse(settings['release-as']);
    const released = parse(manifest[path]);
    if (target === null || released === null) {
      stale.push(`${path}: cannot compare release-as ${settings['release-as']} with the manifest's ${manifest[path]}`);
    } else if (compare(released, target) >= 0) {
      stale.push(`${path}: release-as ${settings['release-as']} is released (manifest ${manifest[path]}): remove it`);
    }
  }
  return stale;
}

function selfTest() {
  const assert = (cond, msg) => { if (!cond) throw new Error(`self-test failed: ${msg}`); };
  const config = {packages: {lib: {'release-as': '6.1.0'}, cli: {}}};
  assert(staleReleaseAs(config, {lib: '5.6.1', cli: '0.0.0'}).length === 0, 'a pending release-as passes');
  assert(staleReleaseAs(config, {lib: '6.1.0'}).length === 1, 'a released release-as fails');
  assert(staleReleaseAs(config, {lib: '6.2.0'}).length === 1, 'a release-as the manifest passed fails');
  assert(staleReleaseAs(config, {lib: '10.0.0'}).length === 1, 'versions compare as numbers, not strings');
  assert(staleReleaseAs(config, {}).length === 1, 'a package missing from the manifest fails');
  assert(staleReleaseAs({packages: {cli: {}}}, {cli: '0.0.0'}).length === 0, 'no release-as, nothing to check');
  console.log('release-as-gate self-test: ok');
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'));
  const stale = staleReleaseAs(config, manifest);
  for (const message of stale) console.error(message);
  if (stale.length > 0) process.exit(1);
  console.log('release-as-gate: no release-as left behind');
}

main();
