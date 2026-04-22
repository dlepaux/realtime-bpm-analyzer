// Run eslint on the whole project rather than the staged subset.
// Rationale: type-aware rules (@typescript-eslint/no-*) depend on the full
// TypeScript program. When lint-staged passes only the touched files as
// arguments, type resolution falls back to `any` for unparsed modules and
// fires false positives. Using a function here ignores the filenames argument
// and lets eslint resolve the whole project graph, matching CI.
module.exports = {
  '**/*.{js,mjs,cjs,ts,tsx,jsx}': () => 'eslint . --fix',
};
