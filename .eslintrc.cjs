/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.min.*',
    'public/',
  ],
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    // Prefer the TS-aware version.
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],

    // This repo contains a number of intentional `any` escape hatches (e.g., dynamic Firestore
    // payloads, sql.js interop). Keeping this off avoids large refactors.
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      files: ['**/*.tsx'],
      plugins: ['react-hooks', 'react-refresh'],
      extends: ['plugin:react-hooks/recommended'],
      rules: {
        // Many existing components intentionally omit exhaustive deps (to avoid repeated
        // network/db loads). Keep the critical rules-of-hooks, but relax deps.
        'react-hooks/exhaustive-deps': 'off',

        // Fast refresh is helpful but shouldn't block lint.
        'react-refresh/only-export-components': 'off',
      },
    },
  ],
};
