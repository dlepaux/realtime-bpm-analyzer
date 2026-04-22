// @ts-check
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Correctness-focused ESLint setup. NO auto-fixing style rules — existing
// codebase formatting stays. If formatting needs enforcement later, add
// prettier as a separate tool; mixing style rules with ESLint's fixer has
// historically corrupted TS files in this repo.

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'examples/**',
      'docs/**',
      'src/generated-processor.ts',
      'node_modules/**',
      'web-dev-server.config.mjs',
      'web-test-runner.config.mjs',
      'eslint.config.js',
      '.lintstagedrc.cjs',
      '.commitlintrc.cjs',
      'build.ts',
      'testing/**',
    ],
  },

  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // Warn, don't fail, for most type-aware checks — existing code wasn't
      // written to be strict here and fixing is out of scope for this story.
      '@typescript-eslint/no-unused-vars': ['warn', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-deprecated': 'off', // Re-export RealTimeBpmAnalyzer has @deprecated on purpose.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      // AudioWorkletProcessor type-compat workarounds in processor file.
      '@typescript-eslint/no-empty-object-type': 'off',
      // BpmAnalyzer uses `as EventListener` to adapt typed handlers to DOM
      // addEventListener. The assertion is needed in source; the new rule
      // is overly aggressive about it.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // chai-style `expect(x).to.be.true` trips this rule; idiomatic for chai.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
);
