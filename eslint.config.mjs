import { defineConfig, globalIgnores } from 'eslint/config';

import { baseConfig } from '@afghan-it-academy/eslint-config/base';
import { nestConfig } from '@afghan-it-academy/eslint-config/nest';
import { nextConfig } from '@afghan-it-academy/eslint-config/next';
import { plainConfig } from '@afghan-it-academy/eslint-config/plain';

/**
 * Root ESLint configuration.
 *
 * Each package also has its own `eslint.config.mjs`, which is what
 * `pnpm lint` uses. This file exists because ESLint resolves its configuration
 * from the working directory: tools that run from the repository root —
 * lint-staged in the pre-commit hook, and editor integrations — would otherwise
 * fail with "couldn't find an eslint.config file".
 *
 * The routing below must mirror the per-package configs. If they diverge, a file
 * is linted differently depending on who invoked ESLint, which is worse than
 * having no root config at all.
 */
export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/*.generated.ts',
    '**/generated/**',
    'apps/web/next-env.d.ts',
  ]),

  {
    files: ['apps/api/**/*.ts'],
    extends: [nestConfig],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [nextConfig],
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    extends: [baseConfig],
  },
  {
    /* The ESLint configs and custom rules themselves. Linting these is how a
     * broken rule gets caught rather than quietly never firing again. */
    files: ['packages/*/*.js', 'packages/*/*.mjs', '*.mjs'],
    extends: [plainConfig],
  },
]);
