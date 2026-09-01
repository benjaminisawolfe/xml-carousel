import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      'tools/xerces-wasm-spike/.cache/',
      'tools/xerces-wasm-spike/.tools/',
      'tools/xerces-wasm-spike/build/',
      'tools/xerces-wasm-spike/dist/',
      'tools/relax-ng-wasm-spike/.cache/',
      'tools/relax-ng-wasm-spike/.tools/',
      'tools/relax-ng-wasm-spike/build/',
      'tools/relax-ng-wasm-spike/dist/',
      'tools/relax-ng-wasm-spike/.evidence/',
      'src/standards/xerces/runtime/xerces-runtime.js',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,mjs,ts,svelte}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
];
