import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';

/**
 * NestJS API configuration.
 *
 * The `no-restricted-imports` block below is the mechanical enforcement of the
 * modular-monolith boundary documented in docs/architecture/. Modules talk to
 * each other through their public entry point only; reaching into another
 * module's internals is what quietly turns a modular monolith into a big ball
 * of mud, and it is cheap to prevent at lint time.
 */
export const nestConfig = tseslint.config(
  ...baseConfig,

  {
    files: ['**/*.ts'],
    rules: {
      /* Decorators are the framework's idiom; these rules fight them. */
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',

      /* Nest's DI containers legitimately hold untyped metadata. */
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],

      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../modules/*/*', '**/modules/*/!(index)*'],
              message:
                'Cross-module deep imports are forbidden. Import a module through its public index barrel, or expose a service via its module exports.',
            },
            {
              group: ['@prisma/client/*'],
              message: 'Import Prisma types from the package root.',
            },
            {
              group: ['dotenv', 'dotenv/*'],
              message:
                'Environment access must go through the validated ConfigService (src/config), never process.env directly.',
            },
          ],
          paths: [
            {
              name: 'process',
              importNames: ['env'],
              message: 'Use the validated ConfigService instead of process.env.',
            },
          ],
        },
      ],
    },
  },

  /* The config module is the one place allowed to read raw process.env. */
  {
    files: ['**/config/**/*.ts', '**/main.ts', '**/*.config.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-properties': 'off',
    },
  },
);

export default nestConfig;
