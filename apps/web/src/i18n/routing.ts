import { DEFAULT_LOCALE, LOCALES } from '@afghan-it-academy/shared';
import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing.
 *
 * `localePrefix: 'always'` means every URL carries its locale (`/fa-AF/courses`).
 * The alternative — hiding the prefix for the default locale — produces two URLs
 * for the same content, which splits SEO signal and makes shared links
 * ambiguous about which language the recipient will see. In a country where
 * links are shared over WhatsApp between speakers of different languages, that
 * ambiguity is a real usability problem, not a theoretical one.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  localeDetection: true,
  // Persist the visitor's choice for a year; language is a deliberate decision,
  // not something to re-ask on every visit over a slow connection.
  localeCookie: {
    name: 'AIA_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  },
});
