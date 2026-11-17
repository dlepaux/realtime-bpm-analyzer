#!/usr/bin/env node
// The Swift port's mirror (RBA-272): dlepaux/realtime-bpm-analyzer-swift, a generated, push-only copy of packages/swift.
//
// SwiftPM reads a package from the root of a git repository and its versions from plain semver tags, while this
// repository's root and its vX.Y.Z tags belong to the JS library. So each Swift release copies the package into the
// mirror's root, commits it on main and tags it with the bare version (DECISION of 2026-11-17 on RBA-272). The code
// is only ever changed here, in packages/swift, and versioned by release-please with the other ports.
//
// The mirror ships no test target. The tests read the conformance vectors in conformance/ and the JS library's
// sources in packages/realtime-bpm-analyzer/src (JsSourceTests), so a mirror holding them would carry the JS
// library too, which is what the separate repository avoids. Conformance (Swift) runs them here on the same commit,
// and SwiftPM never runs a dependency's tests. Package.swift marks the test target, and readme.md the sections about
// the tests, between `swift-mirror: omit start` and `swift-mirror: omit end` lines, which `build` leaves out.
//
// Usage: node bin/swift-mirror.mjs build <out-dir>
//          Writes the mirror's tree, from packages/swift, into <out-dir>, which must not exist yet.
//        node bin/swift-mirror.mjs publish <tree-dir> <remote> <version> <source-sha>
//          Commits <tree-dir> as the whole of the remote's main, with the source commit named in the message, tags
//          it <version> (annotated, no v) and pushes both at once. Does nothing when the tag is already there, and
//          meets an empty repository by making the first commit. Credentials are git's: the job sets GIT_SSH_COMMAND.

import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAIN_REPO = 'https://github.com/dlepaux/realtime-bpm-analyzer';
const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{40}$/;
// The identity of the commits and tags the pipeline makes, as GitHub shows Actions' own
const BOT = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
  '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false'];

// The text without each `swift-mirror: omit start` … `swift-mirror: omit end` stretch, marker lines included.
// A marker out of order, or none at all when `required`, throws: a renamed marker must not ship the tests silently.
export function omitMarked(text, {required = false, name = 'the file'} = {}) {
  const kept = [];
  let omitting = false;
  let found = 0;
  for (const line of text.split('\n')) {
    if (line.includes('swift-mirror: omit start')) {
      if (omitting) throw new Error(`${name}: a second omit start before the omit end`);
      omitting = true;
      found += 1;
    } else if (line.includes('swift-mirror: omit end')) {
      if (!omitting) throw new Error(`${name}: an omit end with no omit start`);
      omitting = false;
    } else if (!omitting) {
      kept.push(line);
    }
  }
  if (omitting) throw new Error(`${name}: an omit start with no omit end`);
  if (required && found === 0) throw new Error(`${name}: no swift-mirror omit markers`);
  return kept.join('\n');
}

// The mirror's readme: where it comes from first, then the package's own readme without its monorepo sections
export function mirrorReadme(readme) {
  const body = omitMarked(readme, {name: 'readme.md'});
  // The notice goes under the title, so the readme must open with it, not with a badge or a comment
  if (!body.startsWith('# ')) throw new Error('readme.md: the first line is not the "# " title');
  const heading = body.indexOf('\n');
  const notice = [
    '',
    `> **Generated.** This repository is a copy of [\`packages/swift\`](${MAIN_REPO}/tree/main/packages/swift) in`,
    `> [dlepaux/realtime-bpm-analyzer](${MAIN_REPO}), written by its release pipeline on each Swift release and`,
    '> tagged with the version. Nothing is changed here by hand. Open issues and pull requests on',
    `> [dlepaux/realtime-bpm-analyzer](${MAIN_REPO}/issues), where the code, its tests and the conformance vectors are.`,
  ];
  return [body.slice(0, heading), ...notice, body.slice(heading + 1)].join('\n');
}

const SPI = `# Swift Package Index: the documentation to build from the package's doc comments
version: 1
builder:
  configs:
    - documentation_targets: [RealtimeBpmAnalyzer]
`;

// Writes the mirror's whole tree into outDir, from the package in packageDir and the repository root in rootDir
export function buildTree(outDir, {packageDir = join(ROOT, 'packages/swift'), rootDir = ROOT} = {}) {
  if (existsSync(outDir)) throw new Error(`${outDir} exists: the tree is written into a new directory`);
  mkdirSync(outDir, {recursive: true});
  const manifest = omitMarked(readFileSync(join(packageDir, 'Package.swift'), 'utf8'), {required: true, name: 'Package.swift'});
  if (/testTarget|Tests\//.test(manifest)) throw new Error('Package.swift: a test target is left outside the omit markers');
  writeFileSync(join(outDir, 'Package.swift'), manifest);
  cpSync(join(packageDir, 'Sources'), join(outDir, 'Sources'), {recursive: true});
  writeFileSync(join(outDir, 'readme.md'), mirrorReadme(readFileSync(join(packageDir, 'readme.md'), 'utf8')));
  writeFileSync(join(outDir, '.spi.yml'), SPI);
  // GitHub and the Swift Package Index read the licence from a LICENSE file
  cpSync(join(rootDir, 'license.md'), join(outDir, 'LICENSE'));
  for (const optional of ['changelog.md', '.gitignore']) {
    if (existsSync(join(packageDir, optional))) cpSync(join(packageDir, optional), join(outDir, optional));
  }
  return listTree(outDir);
}

// Every file under dir, relative and sorted: what a test compares
export function listTree(dir, prefix = '') {
  return readdirSync(join(dir, prefix)).sort().flatMap((name) => {
    const path = prefix ? `${prefix}/${name}` : name;
    return statSync(join(dir, path)).isDirectory() ? listTree(dir, path) : [path];
  });
}

const git = (args, options = {}) => execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options});

// Whether the remote has refs/tags/<version>, and whether it has a main branch at all (an empty repository hasn't)
export function remoteState(remote, version) {
  const refs = git(['ls-remote', remote, 'refs/heads/main', `refs/tags/${version}`]);
  const names = refs.split('\n').map((line) => line.split('\t')[1]).filter(Boolean);
  return {hasTag: names.includes(`refs/tags/${version}`), hasMain: names.includes('refs/heads/main')};
}

export function commitMessage(version, sourceSha) {
  return `Release ${version}\n\nGenerated from ${MAIN_REPO}/tree/${sourceSha}/packages/swift\n(dlepaux/realtime-bpm-analyzer@${sourceSha}).\n`;
}

// Commits treeDir as the remote main's whole content, tags it and pushes both. Returns what it did.
export function publish(treeDir, remote, version, sourceSha) {
  if (!SEMVER.test(version)) throw new Error(`version ${version} is not x.y.z`);
  if (!SHA.test(sourceSha)) throw new Error(`source ${sourceSha} is not a full commit sha`);
  const {hasTag, hasMain} = remoteState(remote, version);
  if (hasTag) return `the mirror already has ${version}: nothing to push`;
  const work = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'swift-mirror-'));
  try {
    const at = ['-C', work];
    git([...at, 'init', '-q']);
    git([...at, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
    git([...at, 'remote', 'add', 'origin', remote]);
    if (hasMain) {
      // HEAD moves to main and the index stays empty, so the commit below holds the new tree alone, as a child of
      // main: every file the new tree drops is deleted
      git([...at, 'fetch', '-q', '--depth=1', 'origin', 'refs/heads/main']);
      git([...at, 'reset', '-q', '--soft', 'FETCH_HEAD']);
    }
    cpSync(treeDir, work, {recursive: true});
    git([...at, 'add', '--all']);
    // --allow-empty: a release whose changes are all in the omitted tests still gets its commit and tag
    git([...at, ...BOT, 'commit', '-q', '--allow-empty', '-m', commitMessage(version, sourceSha)]);
    git([...at, ...BOT, 'tag', '-a', version, '-m', `realtime-bpm-analyzer-swift ${version}, from dlepaux/realtime-bpm-analyzer@${sourceSha}`]);
    // Atomic: the branch and the tag land together or not at all, and a re-run sees either both or neither.
    // Never forced: a main that moved under this run is refused rather than overwritten.
    git([...at, 'push', '-q', '--atomic', 'origin', 'refs/heads/main:refs/heads/main', `refs/tags/${version}:refs/tags/${version}`]);
    return `pushed main and ${version} (${hasMain ? 'on top of the mirror\'s main' : 'the first commit of an empty mirror'})`;
  } finally {
    rmSync(work, {recursive: true, force: true});
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'build' && args.length === 1) {
    const files = buildTree(resolve(args[0]));
    console.log(`swift-mirror: wrote ${files.length} files to ${args[0]}`);
  } else if (command === 'publish' && args.length === 4) {
    const [tree, remote, version, sourceSha] = args;
    console.log(`swift-mirror: ${publish(resolve(tree), remote, version, sourceSha)}`);
  } else {
    throw new Error('usage: swift-mirror.mjs build <out-dir> | publish <tree-dir> <remote> <version> <source-sha>');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
