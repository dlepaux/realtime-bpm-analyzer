#!/usr/bin/env node
// CI gate for the ports' publish jobs (RBA-259): publish a port only from the commit release-please released it at,
// and, given a registry URL, only when the registry doesn't have that version yet.
//
// The npm steps key on the registry alone, because a package.json only names a new version once its release PR has
// merged. The ports' files said 6.2.0 before their first release, so a registry check alone would publish them on
// the first push to main that carries them, before any release. So the release tag decides first: it must exist and
// point at this run's commit. A re-run of that run ("Re-run failed jobs") keeps the commit, so it can still publish
// what a failed run left out.
//
// Maven Central takes a version as one bundle, so its job passes the URL of the version's POM: a version there is
// whole, and a re-run publishes nothing twice. PyPI takes a version file by file, so a version it has can still lack
// a file a failed run didn't upload: its job passes no URL, and the upload skips the files PyPI already has.
//
// Usage: node bin/port-publish-gate.mjs <tag> [registry-url]
//        node bin/port-publish-gate.mjs --self-test
// Reads GITHUB_SHA, GITHUB_SERVER_URL and GITHUB_REPOSITORY, and writes publish=true|false to GITHUB_OUTPUT.
// Exits 1 when the registry answers anything but 200 or 404: an outage must not read as "not published".

import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';

// The decision, from what the tag and the registry said. tagSha is null for a tag that doesn't exist, and
// registryStatus is null when the registry wasn't asked: there is no URL, or the tag is elsewhere.
export function decide({tag, tagSha, headSha, registryStatus}) {
  if (tagSha === null) return {publish: false, message: `no tag ${tag}: this commit released nothing to publish`};
  if (tagSha !== headSha) {
    return {publish: false, message: `${tag} is at ${tagSha}, not at this commit ${headSha}: nothing to publish here`};
  }
  if (registryStatus === null) return {publish: true, message: `${tag} is released here: publishing what is missing`};
  if (registryStatus === 200) return {publish: false, message: `${tag} is already on the registry: nothing to publish`};
  if (registryStatus === 404) return {publish: true, message: `${tag} is released here and not on the registry: publishing`};
  throw new Error(`the registry answered ${registryStatus} for ${tag}: only 200 and 404 decide`);
}

// The commit a tag names, from `git ls-remote` lines, or null. An annotated tag's peeled line (^{}) wins.
export function tagCommit(lsRemote, tag) {
  const refs = new Map();
  for (const line of lsRemote.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (sha && ref) refs.set(ref, sha);
  }
  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`) ?? null;
}

function selfTest() {
  const assert = (cond, msg) => { if (!cond) throw new Error(`self-test failed: ${msg}`); };
  const head = 'a'.repeat(40);
  const base = {tag: 'jvm-v6.2.0', headSha: head};
  assert(!decide({...base, tagSha: null, registryStatus: null}).publish, 'no tag, no publish');
  assert(!decide({...base, tagSha: 'b'.repeat(40), registryStatus: null}).publish, 'a tag elsewhere, no publish');
  assert(!decide({...base, tagSha: head, registryStatus: 200}).publish, 'a version on the registry, no publish');
  assert(decide({...base, tagSha: head, registryStatus: 404}).publish, 'released here and missing: publish');
  assert(decide({...base, tagSha: head, registryStatus: null}).publish, 'released here, no registry asked: publish');
  for (const status of [500, 403, 301, 0]) {
    let threw = false;
    try { decide({...base, tagSha: head, registryStatus: status}); } catch { threw = true; }
    assert(threw, `a registry answer of ${status} fails the job`);
  }
  const lightweight = `${head}\trefs/tags/jvm-v6.2.0\n`;
  assert(tagCommit(lightweight, 'jvm-v6.2.0') === head, 'a lightweight tag names its commit');
  const annotated = `${'c'.repeat(40)}\trefs/tags/jvm-v6.2.0\n${head}\trefs/tags/jvm-v6.2.0^{}\n`;
  assert(tagCommit(annotated, 'jvm-v6.2.0') === head, 'an annotated tag names the commit it peels to');
  assert(tagCommit('', 'jvm-v6.2.0') === null, 'a missing tag is null');
  assert(tagCommit(`${head}\trefs/tags/jvm-v6.2.01\n`, 'jvm-v6.2.0') === null, 'another tag is not this one');
  console.log('port-publish-gate self-test: ok');
}

async function registryStatus(url) {
  // redirect: manual, so a redirect is its own answer rather than whatever page it leads to
  const response = await fetch(url, {method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(30_000)});
  return response.status;
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const [tag, url] = process.argv.slice(2);
  const {GITHUB_SHA: headSha, GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_OUTPUT: output} = process.env;
  if (!tag || !headSha || !server || !repo || !output) {
    throw new Error('usage: port-publish-gate.mjs <tag> [registry-url], in a GitHub Actions job');
  }
  // Anonymous: the repository is public, and this job's token stays out of git's command line
  const lsRemote = execFileSync('git', ['ls-remote', '--tags', `${server}/${repo}.git`, `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`], {encoding: 'utf8'});
  const tagSha = tagCommit(lsRemote, tag);
  const status = tagSha === headSha && url ? await registryStatus(url) : null;
  const {publish, message} = decide({tag, tagSha, headSha, registryStatus: status});
  console.log(message);
  appendFileSync(output, `publish=${publish}\n`);
}

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
