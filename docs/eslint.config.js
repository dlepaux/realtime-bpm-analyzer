// Flat ESLint config for the VitePress docs site.
// Covers .ts and .vue files in .vitepress/ with recommended presets.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.vitepress/dist/**',
      '.vitepress/cache/**',
      'scripts/**',
      'examples/**',
      'api/**',
      'guide/**',
      '**/*.md',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
        // Build-time constant injected via `vite.define` in `.vitepress/config.ts`.
        // Declared as a TS ambient in `vite-env.d.ts`; ESLint needs the global hint
        // separately because it doesn't read the .d.ts.
        __GITHUB_STAR_COUNT__: 'readonly',
      },
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaFeatures: {jsx: false},
      },
    },
    rules: {
      // Team conventions — permissive where it counts, strict where it matters.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_'},
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', {prefer: 'type-imports'}],
      'vue/multi-word-component-names': 'off', // VitePress Layout.vue is a valid single-word name
      'vue/html-self-closing': [
        'warn',
        {
          html: {void: 'always', normal: 'never', component: 'always'},
          svg: 'always',
          math: 'always',
        },
      ],
      'no-console': ['warn', {allow: ['debug', 'warn', 'error']}],
    },
  },
];
