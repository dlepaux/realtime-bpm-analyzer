// @ts-check
import tseslint from 'typescript-eslint';
import globals from 'globals';

// The library's correctness-focused setup (packages/realtime-bpm-analyzer/eslint.config.js),
// for Node only. No style rules: formatting is not ESLint's job here.

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.js'],
  },

  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // The tests run the built bin as plain JS, outside the TS project, so lint them untyped
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
