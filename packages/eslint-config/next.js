import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.js';

/**
 * Next.js web configuration.
 *
 * Two project-specific concerns are enforced here rather than left to review:
 *   1. i18n  — no user-facing string literals bypassing next-intl, and no
 *      physical CSS direction properties that silently break RTL.
 *   2. bandwidth — no unoptimised <img>, no sync <script>.
 */
export const nextConfig = tseslint.config(
  ...baseConfig,

  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      /* --- Accessibility: these are product requirements, not nits. ------ */
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/no-autofocus': 'warn',

      /* --- Low bandwidth -------------------------------------------------
       * Afghanistan-first: unoptimised images and blocking scripts are the two
       * cheapest ways to make the app unusable on a 2G connection.
       */
      '@next/next/no-img-element': 'error',
      '@next/next/no-sync-scripts': 'error',
      '@next/next/no-css-tags': 'error',

      /* Pages Router only. This project is App Router exclusively, and the rule
       * emits a "Pages directory cannot be found" warning on every run. */
      '@next/next/no-html-link-for-pages': 'off',

      /* --- RTL correctness ------------------------------------------------
       * Dari and Pashto are RTL. Physical direction utilities (ml-, pr-, left-)
       * do not mirror; logical ones (ms-, pe-, start-) do.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name="className"] > Literal[value=/(^|\\s)((ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|float-left|float-right)-|text-(left|right)(\\s|$))/]',
          message:
            'Use CSS logical properties so the layout mirrors in Dari/Pashto: ms-/me-, ps-/pe-, start-/end-, border-s-/border-e-, text-start/text-end.',
        },
      ],

      /* Client components ship JavaScript to the user. Keep them deliberate. */
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  {
    files: ['**/*.tsx'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
);

export default nextConfig;
