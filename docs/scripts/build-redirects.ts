import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { legacyRedirects } from './legacy-redirects';
import { checkRedirects, redirectHtml } from './redirects';

// Runs after `vitepress build`: the stubs land outside VitePress's hashmap and
// sitemap, so they neither count as pages for the lean-chunk check nor get indexed.

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../.vitepress/dist');

// A stub left by an earlier run is not a page, so re-running stays idempotent.
const isBuiltPage = (file: string): boolean => {
  const path = join(distDir, file);
  if (!existsSync(path)) return false;
  const stub = file in legacyRedirects ? redirectHtml(legacyRedirects[file]!) : undefined;
  return readFileSync(path, 'utf8') !== stub;
};

const errors = checkRedirects(legacyRedirects, isBuiltPage);
if (errors.length > 0) {
  console.error(`Legacy redirect map is broken:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

for (const [from, to] of Object.entries(legacyRedirects)) {
  const outPath = join(distDir, from);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, redirectHtml(to));
}

console.log(`Wrote ${Object.keys(legacyRedirects).length} redirect pages to ${distDir}, every target checked`);
