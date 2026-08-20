import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Configuration for hand-written JavaScript in this repository: the ESLint
 * configs themselves and the custom rules beside them.
 *
 * These files were previously linted by nothing at all — the root config scoped
 * packages to `packages/<name>/src`, which these sit outside. That is how a
 * boundary rule that had stopped matching survived a whole milestone unnoticed.
 *
 * No type-aware linting: these are plain ESM modules with no TypeScript program.
 */
export const plainConfig = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  prettier,
];

export default plainConfig;
