#!/usr/bin/env node
// Fails when a package's README would not reach the npm registry's `readme` field (RBA-229).
//
// `npm publish` packs the package (prepack, tarball, postpack: lib/commands/publish.js:111 in
// npm 11.20.0), then reads the manifest it sends to the registry again from the package folder
// (publish.js:124, `#getManifest`: @npmcli/package-json `fix()` then `prepare()`). `prepare()`
// fills `readme` from a README file in that folder, or writes "ERROR: No README data found!".
// So a README that a prepack script copies in and a postpack script removes reaches the tarball
// but not the registry, which is what happened from 5.5.0 to 5.6.1.
//
// This check runs the same two steps without publishing: `npm pack --dry-run` (the same
// libnpmpack call, scripts included, nothing written or sent), then the same manifest read,
// with the @npmcli/package-json that ships inside the npm doing the packing.
//
// Usage: node bin/check-npm-readme.mjs <package-dir> [<file-the-readme-must-equal>]

import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

const PLACEHOLDER = 'ERROR: No README data found!';
const REQUIRED_IN_TARBALL = ['readme.md', 'license.md'];

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function npm(args, cwd) {
  return execFileSync('npm', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']}).trim();
}

// The @npmcli/package-json of the npm on PATH, so the read below is the one that npm's publish does
function loadNpmPackageJson(cwd) {
  const npmDir = path.join(npm(['root', '-g'], cwd), 'npm');
  const requireFromNpm = createRequire(path.join(npmDir, 'package.json'));
  const bundledVersion = requireFromNpm('./package.json').version;
  const runningVersion = npm(['--version'], cwd);
  if (bundledVersion !== runningVersion) {
    fail(`npm on PATH is ${runningVersion}, but ${npmDir} holds ${bundledVersion}: the check would read another npm's code`);
  }
  return {PackageJson: requireFromNpm('@npmcli/package-json'), version: runningVersion};
}

const [packageArg, expectedArg] = process.argv.slice(2);
if (!packageArg) {
  fail('usage: node bin/check-npm-readme.mjs <package-dir> [<file-the-readme-must-equal>]');
}
const packageDir = path.resolve(packageArg);
const {PackageJson, version} = loadNpmPackageJson(packageDir);

// Step 1, as publish.js:111: pack with the lifecycle scripts, in memory only
const [packed] = JSON.parse(npm(['pack', '--dry-run', '--json', '--foreground-scripts=false'], packageDir));
const tarballFiles = new Set(packed.files.map(file => file.path));
const missing = REQUIRED_IN_TARBALL.filter(file => !tarballFiles.has(file));
if (missing.length > 0) {
  fail(`${packed.name}@${packed.version}: the tarball lacks ${missing.join(' and ')}`);
}

// Step 2, as publish.js:124: the manifest npm would send, read from the folder after postpack
const pkg = await PackageJson.fix(packageDir, {changes: []});
const {content: manifest} = await pkg.prepare();
if (!manifest.readme || manifest.readme === PLACEHOLDER) {
  fail(`${manifest.name}@${manifest.version}: npm ${version} would send the registry no README (readme: ${JSON.stringify(manifest.readme)}). A README removed by postpack is gone by the time publish reads it.`);
}
if (expectedArg && manifest.readme !== readFileSync(path.resolve(expectedArg), 'utf8')) {
  fail(`${manifest.name}@${manifest.version}: the README npm would send differs from ${expectedArg}`);
}

console.log(`${manifest.name}@${manifest.version}: npm ${version} sends ${manifest.readmeFilename} (${manifest.readme.length} chars) to the registry, and the tarball carries ${REQUIRED_IN_TARBALL.join(' and ')}`);
