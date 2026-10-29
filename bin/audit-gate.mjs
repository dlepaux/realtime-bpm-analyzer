#!/usr/bin/env node
// CI gate: fail on any high/critical npm advisory, except the ones listed in
// ALLOWLIST below, which have no fix anyone can install yet.
//
// Why not plain `npm audit --audit-level=high`: in 2026-10 four advisories
// reached main's dev tooling with no installable fix (braces has no patched
// release; undici, http-cache-semantics and brace-expansion are bundled inside
// npm 11, which @semantic-release/npm requires). The plain gate then failed
// every PR whatever it changed. The library ships no runtime dependencies, so
// none of these reach consumers.
//
// Each entry is scoped to one advisory in one package, optionally only under a
// path prefix, and stops suppressing after `until`. CI then goes red again and
// forces a re-check, so an entry cannot outlive its reason unnoticed.
//
// Usage: (npm audit --json || true) | node bin/audit-gate.mjs   (npm audit exits 1 whenever it finds anything)
//        node bin/audit-gate.mjs --self-test

const ALLOWLIST = [
  { ghsa: 'GHSA-xjj6-f33q-929c', pkg: 'undici', under: 'node_modules/npm/', until: '2026-11-15', why: 'bundled in npm 11; npm 11.21.1 ships 6.29.0, fixed in 6.29.1. npm/cli#10170 bumped it (merged 2026-10-27); it ships in 11.21.2, unreleased as of 2026-10-29 (release PR npm/cli#10179)' },
  { ghsa: 'GHSA-2m5v-pch6-74hx', pkg: 'undici', under: 'node_modules/npm/', until: '2026-11-15', why: 'bundled in npm 11; npm 11.21.1 ships 6.29.0, fixed in 6.29.1. npm/cli#10170 bumped it (merged 2026-10-27); it ships in 11.21.2, unreleased as of 2026-10-29 (release PR npm/cli#10179)' },
  { ghsa: 'GHSA-qrxm-fqhp-jwvm', pkg: 'undici', under: 'node_modules/npm/', until: '2026-11-15', why: 'bundled in npm 11; npm 11.21.1 ships 6.29.0, fixed in 6.29.1. npm/cli#10170 bumped it (merged 2026-10-27); it ships in 11.21.2, unreleased as of 2026-10-29 (release PR npm/cli#10179)' },
];

const BLOCKING = new Set(['high', 'critical']);

// Returns { blocking: [...], allowed: [...], stale: [...] } for an `npm audit --json` report.
export function evaluate(report, allowlist, today) {
  // An npm error (registry down, auth) is JSON without vulnerability metadata: never read it as clean.
  if (!report.metadata?.vulnerabilities) throw new Error(`not an npm audit report: ${JSON.stringify(report).slice(0, 300)}`);
  const blocking = [];
  const allowed = [];
  const seen = new Set();
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const ghsa = via.url.split('/').pop();
      const entry = allowlist.find((e) => e.ghsa === ghsa && e.pkg === pkg && today <= e.until
        && (!e.under || vuln.nodes.every((n) => n.startsWith(e.under))));
      const finding = `${via.severity} ${pkg} ${ghsa} ${via.title}`;
      if (entry) {
        seen.add(`${entry.pkg} ${entry.ghsa}`);
        allowed.push(`${finding} (allowed until ${entry.until}: ${entry.why})`);
      } else {
        blocking.push(finding);
      }
    }
  }
  const stale = allowlist.filter((e) => !seen.has(`${e.pkg} ${e.ghsa}`)).map((e) => `${e.pkg} ${e.ghsa}`);
  return { blocking, allowed, stale };
}

function selfTest() {
  const assert = (cond, msg) => { if (!cond) throw new Error(`self-test failed: ${msg}`); };
  const adv = (ghsa, severity = 'high') => ({ severity, url: `https://github.com/advisories/${ghsa}`, title: 't' });
  const list = [
    { ghsa: 'GHSA-a', pkg: 'braces', until: '2026-11-15', why: 'x' },
    { ghsa: 'GHSA-b', pkg: 'undici', under: 'node_modules/npm/', until: '2026-11-15', why: 'x' },
  ];
  const report = (vulns) => ({ vulnerabilities: vulns, metadata: { vulnerabilities: {} } });

  let r = evaluate(report({ braces: { via: [adv('GHSA-a')], nodes: ['node_modules/braces'] } }), list, '2026-10-15');
  assert(r.blocking.length === 0 && r.allowed.length === 1, 'listed advisory is allowed');

  r = evaluate(report({ braces: { via: [adv('GHSA-a')], nodes: ['node_modules/braces'] } }), list, '2026-11-16');
  assert(r.blocking.length === 1, 'expired entry blocks again');

  r = evaluate(report({ braces: { via: [adv('GHSA-z')], nodes: ['node_modules/braces'] } }), list, '2026-10-15');
  assert(r.blocking.length === 1, 'a new advisory on a listed package blocks');

  r = evaluate(report({ undici: { via: [adv('GHSA-b')], nodes: ['node_modules/undici'] } }), list, '2026-10-15');
  assert(r.blocking.length === 1, 'path-scoped entry does not cover a direct copy');

  r = evaluate(report({ x: { via: [adv('GHSA-m', 'moderate'), 'braces'], nodes: ['node_modules/x'] } }), list, '2026-10-15');
  assert(r.blocking.length === 0, 'moderate and transitive "via" strings do not block');
  assert(r.stale.length === 2, 'unmatched entries are reported stale');

  let threw = false;
  try { evaluate({ error: { code: 'ENOTFOUND' } }, list, '2026-10-15'); } catch { threw = true; }
  assert(threw, 'an npm error report is never read as clean');

  console.log('audit-gate self-test: ok');
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const today = new Date().toISOString().slice(0, 10);
  const { blocking, allowed, stale } = evaluate(JSON.parse(input), ALLOWLIST, today);
  for (const a of allowed) console.log(`allowed: ${a}`);
  for (const s of stale) console.log(`stale allowlist entry (no longer reported, remove it): ${s}`);
  for (const b of blocking) console.error(`BLOCKING: ${b}`);
  if (blocking.length > 0) process.exit(1);
  console.log(`audit gate: pass (${allowed.length} allowlisted)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
