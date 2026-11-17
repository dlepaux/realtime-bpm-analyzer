// Run eslint on each whole package rather than the staged subset.
// Rationale: type-aware rules (@typescript-eslint/no-*) depend on the full
// TypeScript program. When lint-staged passes only the touched files as
// arguments, type resolution falls back to `any` for unparsed modules and
// fires false positives. Using a function here ignores the filenames argument
// and lets eslint resolve the whole project graph, matching CI.
//
// Each package is linted only when one of its own files is staged (RBA-149).
// mcp's lint resolves cli's types from cli's build, so linting every package
// on any staged file meant a docs-only commit failed in a fresh clone until the
// packages were built. The trade-off: a library change no longer re-lints cli
// and mcp here, which CI's full lint still does.
// docs/ and examples/ are linted by their own scripts, as before.
const lintPackage = workspace => () => `npm run lint:fix -w ${workspace}`;
const sources = '**/*.{js,mjs,cjs,ts,tsx,jsx}';

module.exports = {
  [`packages/realtime-bpm-analyzer/${sources}`]: lintPackage('realtime-bpm-analyzer'),
  [`packages/cli/${sources}`]: lintPackage('realtime-bpm-analyzer-cli'),
  [`packages/mcp/${sources}`]: lintPackage('realtime-bpm-analyzer-mcp'),
};
