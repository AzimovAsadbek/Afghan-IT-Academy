import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';
import { boundariesPlugin } from './module-boundaries.js';

/**
 * NestJS API configuration.
 *
 * Module boundaries (ADR 0002) are enforced by `boundaries/module-boundaries`,
 * a local rule that works on resolved file paths. The `no-restricted-imports`
 * entries below stay for the restrictions that genuinely are string-shaped —
 * `process.env`, `dotenv`, and deep `@prisma/client` paths.
 */
export const nestConfig = tseslint.config(
  ...baseConfig,

  {
    files: ['**/*.ts'],
    plugins: { boundaries: boundariesPlugin },
    rules: {
      /* Reaching into another module's internals is what quietly turns a
       * modular monolith into a big ball of mud, and it is cheap to prevent at
       * lint time — provided the rule actually fires, which the previous
       * specifier-matching approach did not. See module-boundaries.js. */
      'boundaries/module-boundaries': 'error',

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
